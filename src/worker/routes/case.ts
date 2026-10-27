// Rotas do caso. Acesso só pelo link secreto: o token (32 bytes) vai no header X-Case-Token.
import { Hono } from "hono";
import { z } from "zod";
import { caseByToken, logEvent, setStatus, thesisOverrides, type CaseRow } from "../db";
import { encryptJson } from "../crypto";
import { verifyTurnstile } from "../turnstile";
import { newCaseToken, newId, sha256Hex } from "../util";
import { FRIENDLY, LlmError } from "../llm/openrouter";
import { analyzeImage, extractCrlv, extractNotification, selectTheses, writeNarrative, type FilePart } from "../pipeline";
import { getProvider } from "../payments";
import type { PaymentMethod } from "../payments/types";
import { ConfirmedSchema, RequesterSchema, type Confirmed } from "../../shared/schemas";
import { diagnose, type Diagnosis } from "../../shared/rules/engine";
import { todayBrasilia, formatBR } from "../../shared/rules/dates";
import { buildDocument, documentPlainText, type DocumentModel } from "../../shared/document";
import { validateText } from "../../shared/citations";
import { deadlineIcs } from "../../shared/ics";

type Ctx = { Bindings: Env; Variables: { case: CaseRow } };
export const caseRoutes = new Hono<Ctx>();

const KINDS = ["notificacao", "imagem_infracao", "crlv"] as const;
type Kind = (typeof KINDS)[number];
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

// ---------- Criação do caso (upload) ----------

caseRoutes.post("/cases", async (c) => {
  const form = await c.req.raw.formData().catch(() => null);
  if (!form) return fail(400, "Envio inválido. Tente de novo.");
  if (form.get("consent") !== "true") return fail(400, "É preciso aceitar o uso dos dados para gerar o diagnóstico.");
  const ok = await verifyTurnstile(c.env, form.get("turnstile")?.toString() ?? null, c.req.header("CF-Connecting-IP") ?? null);
  if (!ok) return fail(403, "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.");

  const files: { kind: Kind; file: File }[] = [];
  let total = 0;
  for (const kind of KINDS) {
    for (const v of form.getAll(kind)) {
      if (!(v instanceof File) || v.size === 0) continue;
      if (!ALLOWED.has(v.type)) return fail(400, `Formato não aceito: ${v.name}. Envie JPG, PNG, WEBP ou PDF.`);
      if (v.size > MAX_FILE) return fail(400, `O arquivo ${v.name} passa de 8 MB.`);
      total += v.size;
      files.push({ kind, file: v });
    }
  }
  if (total > MAX_TOTAL) return fail(400, "Os arquivos somam mais de 20 MB.");
  const notif = files.filter((f) => f.kind === "notificacao");
  if (!notif.length) return fail(400, "Envie a foto ou o PDF da notificação.");
  if (notif.length > 4) return fail(400, "Envie no máximo 4 imagens da notificação.");
  if (files.filter((f) => f.kind !== "notificacao").length > 2) return fail(400, "Envie no máximo uma imagem da infração e um CRLV.");

  const emailRaw = form.get("email")?.toString().trim() || null;
  const email = emailRaw && z.string().email().max(160).safeParse(emailRaw).success ? emailRaw : null;
  const id = newId();
  const token = newCaseToken();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO cases (id, token_hash, status, email, consent_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, await sha256Hex(token), "created", email, now, now, now)
    .run();
  let n = 0;
  for (const f of files) {
    const key = `cases/${id}/${f.kind}-${++n}.${EXT[f.file.type]}`;
    await c.env.UPLOADS.put(key, f.file.stream(), { httpMetadata: { contentType: f.file.type } });
    await c.env.DB.prepare("INSERT INTO uploads (id, case_id, kind, r2_key, content_type, size, created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(newId(), id, f.kind, key, f.file.type, f.file.size, now)
      .run();
  }
  await logEvent(c.env, id, "upload", { arquivos: files.length });
  return c.json({ token });
});

// ---------- Autenticação por token ----------

caseRoutes.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname.replace(/^\/api/, "");
  if (path !== "/case" && !path.startsWith("/case/")) return next();
  const row = await caseByToken(c.env, c.req.header("X-Case-Token"));
  if (!row) return fail(404, "Link inválido ou expirado.");
  const readOnly = path === "/case" && (c.req.method === "GET" || c.req.method === "DELETE");
  if (row.purged_at && !readOnly) return fail(410, "Este caso foi apagado, como previsto na política de privacidade.");
  c.set("case", row);
  await next();
});

async function latestExtractions(env: Env, caseId: string) {
  const r = await env.DB.prepare("SELECT kind, result_json FROM extractions WHERE case_id = ? ORDER BY created_at DESC").bind(caseId).all<{ kind: string; result_json: string }>();
  const out: Record<string, unknown> = {};
  for (const row of r.results ?? []) if (!(row.kind in out)) out[row.kind] = JSON.parse(row.result_json);
  return out;
}

async function paymentOf(env: Env, caseId: string) {
  return env.DB.prepare("SELECT id, provider, method, status, amount_cents FROM payments WHERE case_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(caseId)
    .first<{ id: string; provider: string; method: string; status: string; amount_cents: number }>();
}

caseRoutes.get("/case", async (c) => {
  const row = c.get("case");
  const [extraction, payment, uploads, doc, outcome] = await Promise.all([
    latestExtractions(c.env, row.id),
    paymentOf(c.env, row.id),
    c.env.DB.prepare("SELECT id, kind, content_type FROM uploads WHERE case_id = ? ORDER BY created_at").bind(row.id).all<{ id: string; kind: string; content_type: string }>(),
    c.env.DB.prepare("SELECT id FROM documents WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").bind(row.id).first<{ id: string }>(),
    c.env.DB.prepare("SELECT result, created_at FROM outcomes WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").bind(row.id).first<{ result: string; created_at: number }>(),
  ]);
  return c.json({
    status: row.status,
    created_at: row.created_at,
    purged: Boolean(row.purged_at),
    has_email: Boolean(row.email),
    uploads: uploads.results ?? [],
    extraction,
    confirmed: row.confirmed_json ? JSON.parse(row.confirmed_json) : null,
    diagnosis: row.diagnosis_json ? JSON.parse(row.diagnosis_json) : null,
    payment: payment ? { id: payment.id, status: payment.status, method: payment.method, provider: payment.provider } : null,
    document_ready: Boolean(doc),
    outcome: outcome ?? null,
    price_cents: Number(c.env.PRICE_CENTS),
  });
});

caseRoutes.get("/case/file/:id", async (c) => {
  const row = c.get("case");
  const up = await c.env.DB.prepare("SELECT r2_key, content_type FROM uploads WHERE id = ? AND case_id = ?").bind(c.req.param("id"), row.id).first<{ r2_key: string; content_type: string }>();
  if (!up) return fail(404, "Arquivo não encontrado.");
  const obj = await c.env.UPLOADS.get(up.r2_key);
  if (!obj) return fail(404, "Arquivo não encontrado.");
  return new Response(obj.body, { headers: { "Content-Type": up.content_type, "Cache-Control": "private, no-store" } });
});

// ---------- Extração (LLM) ----------

async function loadFiles(env: Env, caseId: string, kind: Kind): Promise<FilePart[]> {
  const r = await env.DB.prepare("SELECT r2_key, content_type FROM uploads WHERE case_id = ? AND kind = ? ORDER BY created_at").bind(caseId, kind).all<{ r2_key: string; content_type: string }>();
  const out: FilePart[] = [];
  for (const u of r.results ?? []) {
    const obj = await env.UPLOADS.get(u.r2_key);
    if (obj) out.push({ contentType: u.content_type, bytes: new Uint8Array(await obj.arrayBuffer()), filename: u.r2_key.split("/").pop()! });
  }
  return out;
}

caseRoutes.post("/case/extract", async (c) => {
  const row = c.get("case");
  const [notif, img, crlv] = await Promise.all([loadFiles(c.env, row.id, "notificacao"), loadFiles(c.env, row.id, "imagem_infracao"), loadFiles(c.env, row.id, "crlv")]);
  // A imagem da infração pode estar na própria notificação: sem arquivo separado, analisa a notificação.
  const imageSource = img.length ? img : notif.filter((f) => f.contentType !== "application/pdf" || c.env.MODEL_VISION_ACCEPTS_PDF === "true");
  const tasks = await Promise.allSettled([
    extractNotification(c.env, row.id, notif),
    crlv.length ? extractCrlv(c.env, row.id, crlv) : Promise.resolve(null),
    imageSource.length ? analyzeImage(c.env, row.id, imageSource) : Promise.resolve(null),
  ]);
  const erros: Record<string, string> = {};
  const names = ["notificacao", "crlv", "imagem_infracao"] as const;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    if (t.status === "fulfilled") {
      if (t.value) {
        await c.env.DB.prepare("INSERT INTO extractions (id, case_id, kind, model, result_json, created_at) VALUES (?,?,?,?,?,?)")
          .bind(newId(), row.id, names[i], c.env.MODEL_VISION, JSON.stringify(t.value), Date.now())
          .run();
      }
    } else {
      const e = t.reason;
      erros[names[i]!] = e instanceof LlmError ? FRIENDLY[e.code] : "Não conseguimos ler este arquivo. Preencha os dados à mão.";
      console.error(JSON.stringify({ msg: "extracao_falhou", case_id: row.id.slice(0, 8), etapa: names[i], code: e instanceof LlmError ? e.code : "erro" }));
    }
  }
  await setStatus(c.env, row.id, "extracted");
  await logEvent(c.env, row.id, "extracted", { erros: Object.keys(erros) });
  return c.json({ extraction: await latestExtractions(c.env, row.id), erros });
});

// ---------- Confirmação e diagnóstico ----------

function persistDiagnosis(env: Env, caseId: string, confirmed: Confirmed, d: Diagnosis) {
  const now = Date.now();
  const stmts = [
    env.DB.prepare("UPDATE cases SET confirmed_json = ?, diagnosis_json = ?, piece_type = ?, strength = ?, deadline = ?, status = ?, updated_at = ? WHERE id = ?").bind(
      JSON.stringify(confirmed),
      JSON.stringify(d),
      d.peca?.tipo ?? null,
      d.forca.nivel,
      d.prazo.efetivo,
      "diagnosed",
      now,
      caseId,
    ),
    env.DB.prepare("DELETE FROM findings WHERE case_id = ?").bind(caseId),
    ...[...d.achados, ...d.bloqueios, ...d.avisos].map((f) =>
      env.DB.prepare("INSERT INTO findings (id, case_id, rule_id, kind, title, detail, thesis_ids, data_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(
        newId(),
        caseId,
        f.rule_id,
        f.kind,
        f.titulo,
        f.detalhe,
        JSON.stringify(f.thesis_ids),
        JSON.stringify(f.dados),
        now,
      ),
    ),
  ];
  return env.DB.batch(stmts);
}

caseRoutes.post("/case/confirm", async (c) => {
  const row = c.get("case");
  if (row.status === "paid" || row.status === "delivered") return fail(409, "Este caso já foi pago. Os dados não podem mais ser alterados.");
  const body = await c.req.json().catch(() => null);
  const parsed = ConfirmedSchema.safeParse(body?.confirmed);
  if (!parsed.success) return fail(400, "Confira os campos destacados.", { campos: parsed.error.issues.map((i) => i.path.join(".")) });
  const d = diagnose(parsed.data, todayBrasilia(), await thesisOverrides(c.env));
  await persistDiagnosis(c.env, row.id, parsed.data, d);
  await logEvent(c.env, row.id, "confirmed");
  await logEvent(c.env, row.id, "diagnosed", { achados: d.achados.length, forca: d.forca.nivel, bloqueado: !d.venda.permitida });
  return c.json({ diagnosis: d });
});

// ---------- Pagamento ----------

caseRoutes.post("/case/checkout", async (c) => {
  const row = c.get("case");
  if (!row.diagnosis_json || !row.confirmed_json) return fail(409, "Faça o diagnóstico antes do pagamento.");
  const body = (await c.req.json().catch(() => ({}))) as { method?: string; ciente_sem_achados?: boolean };
  const method: PaymentMethod = body.method === "cartao" ? "cartao" : "pix";
  // recalcula com a data de hoje: o prazo pode ter vencido desde o diagnóstico
  const d = diagnose(ConfirmedSchema.parse(JSON.parse(row.confirmed_json)), todayBrasilia(), await thesisOverrides(c.env));
  if (!d.venda.permitida) return fail(409, d.venda.motivo ?? "Venda bloqueada.", { diagnosis: d });
  if (d.venda.exige_ciencia_sem_achados && body.ciente_sem_achados !== true) return fail(409, "Confirme que entendeu que não encontramos falhas formais.");
  const existing = await paymentOf(c.env, row.id);
  if (existing?.status === "approved") return c.json({ payment: { id: existing.id, status: existing.status } });
  const provider = getProvider(c.env);
  const paymentId = newId();
  const amount = Number(c.env.PRICE_CENTS);
  let result;
  try {
    result = await provider.createCheckout({
      paymentId,
      caseId: row.id,
      amountCents: amount,
      method,
      returnUrl: `${c.env.PUBLIC_BASE_URL}/c#pagamento`,
      notificationUrl: `${c.env.PUBLIC_BASE_URL}/api/payments/mercadopago/webhook`,
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "checkout_falhou", case_id: row.id.slice(0, 8), error: String(e).slice(0, 200) }));
    return fail(502, "O pagamento está indisponível agora. Tente de novo em alguns minutos.");
  }
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO payments (id, case_id, provider, provider_ref, method, amount_cents, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(paymentId, row.id, provider.name, result.providerRef, method, amount, result.status, now, now)
    .run();
  await logEvent(c.env, row.id, "checkout", { provider: provider.name, method });
  return c.json({ payment: { id: paymentId, status: result.status, provider: provider.name, redirect_url: result.redirectUrl ?? null, mock: Boolean(result.mock) } });
});

caseRoutes.post("/case/pay/mock-confirm", async (c) => {
  const row = c.get("case");
  if (c.env.PAYMENT_PROVIDER !== "mock" || c.env.APP_ENV === "production") return fail(403, "Pagamento de teste desativado.");
  const body = (await c.req.json().catch(() => ({}))) as { payment_id?: string };
  const p = await c.env.DB.prepare("SELECT id, status FROM payments WHERE id = ? AND case_id = ? AND provider = 'mock'").bind(body.payment_id ?? "", row.id).first<{ id: string; status: string }>();
  if (!p) return fail(404, "Pagamento não encontrado.");
  if (p.status !== "approved") {
    await c.env.DB.prepare("UPDATE payments SET status = 'approved', updated_at = ? WHERE id = ?").bind(Date.now(), p.id).run();
    await setStatus(c.env, row.id, "paid");
    await logEvent(c.env, row.id, "paid", { provider: "mock" });
  }
  return c.json({ payment: { id: p.id, status: "approved" } });
});

caseRoutes.get("/case/payment", async (c) => {
  const p = await paymentOf(c.env, c.get("case").id);
  return c.json({ payment: p ? { id: p.id, status: p.status, method: p.method, provider: p.provider } : null });
});

// ---------- Geração da peça ----------

async function storedDocument(env: Env, caseId: string): Promise<{ doc: DocumentModel; plain: string } | null> {
  const d = await env.DB.prepare("SELECT r2_key FROM documents WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").bind(caseId).first<{ r2_key: string }>();
  if (!d?.r2_key) return null;
  const obj = await env.UPLOADS.get(d.r2_key);
  return obj ? ((await obj.json()) as { doc: DocumentModel; plain: string }) : null;
}

caseRoutes.post("/case/generate", async (c) => {
  const row = c.get("case");
  const p = await paymentOf(c.env, row.id);
  if (p?.status !== "approved") return fail(402, "O pagamento ainda não foi confirmado.");
  if (!row.confirmed_json) return fail(409, "Caso sem dados confirmados.");
  const body = (await c.req.json().catch(() => ({}))) as { requester?: unknown };
  const reqParsed = RequesterSchema.safeParse(body.requester ?? {});
  if (!reqParsed.success) return fail(400, "Confira seus dados pessoais.");
  const confirmed = ConfirmedSchema.parse(JSON.parse(row.confirmed_json));
  const d = diagnose(confirmed, todayBrasilia(), await thesisOverrides(c.env));
  if (!d.peca) return fail(409, "Documento não suportado.");

  const selected = await selectTheses(c.env, row.id, d);
  const narrative = await writeNarrative(c.env, row.id, confirmed, d);
  let doc: DocumentModel;
  try {
    doc = buildDocument({ confirmed, diagnosis: d, selected, narrative: narrative.paragrafos, requester: reqParsed.data, testEnvironment: c.env.APP_ENV !== "production" });
  } catch (e) {
    console.error(JSON.stringify({ msg: "documento_invalido", case_id: row.id.slice(0, 8), error: String(e).slice(0, 300) }));
    return fail(500, "Não conseguimos montar a peça com segurança. Nossa equipe foi avisada.");
  }
  const plain = documentPlainText(doc);
  const key = `cases/${row.id}/documento.json`;
  await c.env.UPLOADS.put(key, JSON.stringify({ doc, plain }), { httpMetadata: { contentType: "application/json" } });
  const v = validateText([...doc.fatos, ...doc.direito.flatMap((s) => s.paragrafos)].join("\n"));
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM theses_applied WHERE case_id = ?").bind(row.id),
    ...selected.map((s) => {
      const e = d.teses_elegiveis.find((x) => x.thesis_id === s.thesis_id);
      return c.env.DB.prepare("INSERT INTO theses_applied (id, case_id, thesis_id, finding_rule_id, weight, justification, selected_by, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(
        newId(),
        row.id,
        s.thesis_id,
        s.rule_id,
        e?.peso ?? 0,
        s.justificativa.slice(0, 400),
        s.selected_by,
        now,
      );
    }),
    c.env.DB.prepare("INSERT INTO documents (id, case_id, r2_key, plain_text, validation_json, requester_enc, created_at) VALUES (?,?,?,?,?,?,?)").bind(
      newId(),
      row.id,
      key,
      null,
      JSON.stringify({ narrativa: narrative.origem, frases_removidas: narrative.removidas.length, citacoes: v.citations.map((x) => x.raw) }),
      await encryptJson(c.env, reqParsed.data),
      now,
    ),
    c.env.DB.prepare("UPDATE cases SET status = 'delivered', updated_at = ? WHERE id = ?").bind(now, row.id),
  ]);
  await logEvent(c.env, row.id, "generated", { teses: selected.length, narrativa: narrative.origem });
  return c.json({ doc, plain, narrativa: narrative.origem });
});

caseRoutes.get("/case/document", async (c) => {
  const stored = await storedDocument(c.env, c.get("case").id);
  if (!stored) return fail(404, "A peça ainda não foi gerada.");
  return c.json(stored);
});

caseRoutes.post("/case/downloaded", async (c) => {
  const row = c.get("case");
  await c.env.DB.prepare("UPDATE documents SET downloaded_at = ? WHERE case_id = ? AND downloaded_at IS NULL").bind(Date.now(), row.id).run();
  await logEvent(c.env, row.id, "downloaded");
  return c.json({ ok: true });
});

caseRoutes.get("/case/ics", async (c) => {
  const row = c.get("case");
  if (!row.deadline) return fail(404, "Sem prazo informado.");
  const piece = row.piece_type === "defesa_previa" ? "defesa prévia" : "recurso";
  const ics = deadlineIcs({
    uid: row.id,
    deadline: row.deadline,
    title: `Prazo final da ${piece} (ContraMulta)`,
    description: `Protocole a ${piece} até ${formatBR(row.deadline)}, pelo canal indicado na notificação. Seu link do caso está no ContraMulta.`,
    url: `${c.env.PUBLIC_BASE_URL}/`,
  });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="prazo-contramulta.ics"' } });
});

// ---------- Resultado informado pelo usuário ----------

caseRoutes.post("/case/outcome", async (c) => {
  const row = c.get("case");
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ result: z.enum(["deferido", "indeferido", "pendente"]), note: z.string().trim().max(500).optional() }).safeParse(body);
  if (!parsed.success) return fail(400, "Escolha deferido, indeferido ou pendente.");
  await c.env.DB.prepare("INSERT INTO outcomes (id, case_id, result, note, created_at) VALUES (?,?,?,?,?)").bind(newId(), row.id, parsed.data.result, parsed.data.note ?? null, Date.now()).run();
  await logEvent(c.env, row.id, "outcome", { result: parsed.data.result });
  return c.json({ ok: true });
});

// ---------- Exclusão a pedido do usuário (LGPD) ----------

export async function purgeCase(env: Env, caseId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const list = await env.UPLOADS.list({ prefix: `cases/${caseId}/`, cursor });
    if (list.objects.length) await env.UPLOADS.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE cases SET email = NULL, confirmed_json = NULL, diagnosis_json = NULL, status = 'purged', purged_at = ?, updated_at = ? WHERE id = ?").bind(now, now, caseId),
    env.DB.prepare("UPDATE documents SET requester_enc = NULL, plain_text = NULL WHERE case_id = ?").bind(caseId),
    env.DB.prepare("UPDATE findings SET detail = '', data_json = NULL WHERE case_id = ?").bind(caseId),
    env.DB.prepare("DELETE FROM extractions WHERE case_id = ?").bind(caseId),
    env.DB.prepare("DELETE FROM uploads WHERE case_id = ?").bind(caseId),
  ]);
}

caseRoutes.delete("/case", async (c) => {
  const row = c.get("case");
  await purgeCase(c.env, row.id);
  await logEvent(c.env, row.id, "deleted_by_user");
  return c.json({ ok: true });
});
