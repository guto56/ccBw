// /api/admin: protegido por ADMIN_TOKEN (Authorization: Bearer). Dados de caso sempre mascarados.
import { Hono } from "hono";
import { z } from "zod";
import { safeEqual, maskDigits, maskEmail, maskPlate } from "../util";
import { decryptJson } from "../crypto";
import { THESES } from "../../shared/legal";
import type { Requester } from "../../shared/schemas";

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use("*", async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!c.env.ADMIN_TOKEN || !token || !(await safeEqual(token, c.env.ADMIN_TOKEN))) return c.json({ error: "Não autorizado." }, 401);
  await next();
});

adminRoutes.get("/summary", async (c) => {
  const db = c.env.DB;
  const [funnel, cost, perCase, outcomes, fleet] = await Promise.all([
    db.prepare("SELECT name, COUNT(DISTINCT case_id) AS casos FROM events GROUP BY name").all<{ name: string; casos: number }>(),
    db.prepare("SELECT COUNT(*) AS chamadas, COALESCE(SUM(cost_usd),0) AS custo, COUNT(DISTINCT case_id) AS casos, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS falhas FROM llm_usage").first<{ chamadas: number; custo: number; casos: number; falhas: number }>(),
    db.prepare("SELECT stage, COUNT(*) AS chamadas, COALESCE(AVG(cost_usd),0) AS custo_medio, COALESCE(AVG(latency_ms),0) AS latencia_media FROM llm_usage GROUP BY stage").all(),
    db.prepare("SELECT result, COUNT(*) AS n FROM (SELECT case_id, result, MAX(created_at) FROM outcomes GROUP BY case_id) GROUP BY result").all<{ result: string; n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM fleet_waitlist").first<{ n: number }>(),
  ]);
  const f = Object.fromEntries((funnel.results ?? []).map((r) => [r.name, r.casos]));
  return c.json({
    funil: { upload: f.upload ?? 0, diagnostico: f.diagnosed ?? 0, checkout: f.checkout ?? 0, pagamento: f.paid ?? 0, peca_gerada: f.generated ?? 0, download: f.downloaded ?? 0 },
    custo_ia: { ...cost, custo_por_caso: cost && cost.casos ? cost.custo / cost.casos : 0, por_etapa: perCase.results ?? [] },
    resultados: Object.fromEntries((outcomes.results ?? []).map((r) => [r.result, r.n])),
    frotas: fleet?.n ?? 0,
  });
});

adminRoutes.get("/cases", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.status, c.email, c.piece_type, c.strength, c.deadline, c.created_at, c.purged_at, c.confirmed_json,
      (SELECT COALESCE(SUM(cost_usd),0) FROM llm_usage u WHERE u.case_id = c.id) AS custo,
      (SELECT COUNT(*) FROM llm_usage u WHERE u.case_id = c.id) AS chamadas,
      (SELECT result FROM outcomes o WHERE o.case_id = c.id ORDER BY created_at DESC LIMIT 1) AS resultado,
      (SELECT status FROM payments p WHERE p.case_id = c.id ORDER BY created_at DESC LIMIT 1) AS pagamento,
      (SELECT requester_enc FROM documents d WHERE d.case_id = c.id ORDER BY created_at DESC LIMIT 1) AS requester_enc,
      (SELECT GROUP_CONCAT(thesis_id) FROM theses_applied t WHERE t.case_id = c.id) AS teses
     FROM cases c ORDER BY c.created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<Record<string, unknown>>();
  const out = [];
  for (const r of rows.results ?? []) {
    const conf = r.confirmed_json ? (JSON.parse(String(r.confirmed_json)) as { orgao_autuador?: string; placa?: string; artigo_infracao?: string }) : null;
    let requerente: Record<string, string> | null = null;
    if (r.requester_enc) {
      try {
        const q = await decryptJson<Requester>(c.env, String(r.requester_enc));
        requerente = { nome: q.nome ? `${q.nome.split(" ")[0]} •••` : "", cpf: maskDigits(q.cpf), cnh: maskDigits(q.cnh) };
      } catch {
        requerente = { erro: "não foi possível decifrar" };
      }
    }
    out.push({
      id: String(r.id).slice(0, 8),
      status: r.status,
      criado_em: r.created_at,
      apagado: Boolean(r.purged_at),
      email: maskEmail(r.email as string | null),
      orgao: conf?.orgao_autuador ?? null,
      placa: maskPlate(conf?.placa ?? null),
      artigo: conf?.artigo_infracao ?? null,
      peca: r.piece_type,
      forca: r.strength,
      prazo: r.deadline,
      pagamento: r.pagamento,
      teses: r.teses ? String(r.teses).split(",") : [],
      custo_ia_usd: r.custo,
      chamadas_ia: r.chamadas,
      resultado: r.resultado,
      requerente,
    });
  }
  return c.json({ casos: out });
});

adminRoutes.get("/theses", async (c) => {
  const [ovr, stats] = await Promise.all([
    c.env.DB.prepare("SELECT thesis_id, status, weight, updated_at FROM thesis_overrides").all<{ thesis_id: string; status: string | null; weight: number | null; updated_at: number }>(),
    c.env.DB.prepare(
      `SELECT t.thesis_id, o.result, COUNT(*) AS n FROM theses_applied t
       JOIN (SELECT case_id, result FROM outcomes o1 WHERE created_at = (SELECT MAX(created_at) FROM outcomes o2 WHERE o2.case_id = o1.case_id)) o ON o.case_id = t.case_id
       GROUP BY t.thesis_id, o.result`,
    ).all<{ thesis_id: string; result: string; n: number }>(),
  ]);
  const o = new Map((ovr.results ?? []).map((x) => [x.thesis_id, x]));
  return c.json({
    teses: THESES.map((t) => {
      const s = (stats.results ?? []).filter((x) => x.thesis_id === t.id);
      const get = (r: string) => s.find((x) => x.result === r)?.n ?? 0;
      return {
        id: t.id,
        titulo: t.titulo,
        acessoria: t.acessoria,
        peso_base: t.peso,
        status_base: t.status,
        peso: o.get(t.id)?.weight ?? t.peso,
        status: o.get(t.id)?.status ?? t.status,
        resultados: { deferido: get("deferido"), indeferido: get("indeferido"), pendente: get("pendente") },
      };
    }),
  });
});

adminRoutes.post("/theses/:id", async (c) => {
  const id = c.req.param("id");
  if (!THESES.some((t) => t.id === id)) return c.json({ error: "Tese inexistente." }, 404);
  const parsed = z.object({ status: z.enum(["rascunho", "revisado", "suspensa"]).optional(), weight: z.number().int().min(1).max(3).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Status deve ser rascunho, revisado ou suspensa; peso de 1 a 3." }, 400);
  await c.env.DB.prepare(
    "INSERT INTO thesis_overrides (thesis_id, status, weight, updated_at) VALUES (?,?,?,?) ON CONFLICT(thesis_id) DO UPDATE SET status = COALESCE(excluded.status, thesis_overrides.status), weight = COALESCE(excluded.weight, thesis_overrides.weight), updated_at = excluded.updated_at",
  )
    .bind(id, parsed.data.status ?? null, parsed.data.weight ?? null, Date.now())
    .run();
  return c.json({ ok: true });
});

adminRoutes.get("/fleet", async (c) => {
  const r = await c.env.DB.prepare("SELECT company, vehicles, fines_per_month, contact_name, contact_email, contact_phone, created_at FROM fleet_waitlist ORDER BY created_at DESC LIMIT 200").all();
  return c.json({ frotas: r.results ?? [] });
});
