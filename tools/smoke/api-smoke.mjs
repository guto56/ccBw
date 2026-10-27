// Smoke test ponta a ponta da API (pagamento mock).
// Uso: BASE_URL=http://127.0.0.1:8787 ADMIN_TOKEN=... node tools/smoke/api-smoke.mjs fixtures/caso1.json
// O arquivo do caso traz: imagens (caminhos), dados confirmados (usados se a leitura automática falhar) e o esperado.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const log = (...a) => console.log(`[${spec.nome}]`, ...a);

async function api(path, { token, method = "GET", json, form } = {}) {
  const headers = {};
  if (token) headers["X-Case-Token"] = token;
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: json ? JSON.stringify(json) : form });
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const form = new FormData();
for (const [kind, files] of Object.entries(spec.arquivos)) {
  for (const f of files) form.append(kind, new Blob([readFileSync(f)], { type: f.endsWith(".pdf") ? "application/pdf" : "image/png" }), basename(f));
}
form.append("consent", "true");
form.append("turnstile", "XXXX.DUMMY.TOKEN.XXXX");
const { token } = await api("/api/cases", { method: "POST", form });
log("caso criado");

const ex = await api("/api/case/extract", { token, method: "POST" });
const leitura = ex.extraction?.notificacao ? "automática" : "manual";
log("leitura:", leitura, Object.keys(ex.erros ?? {}).length ? ex.erros : "");

let confirmed = spec.confirmado;
if (ex.extraction?.notificacao && spec.usar_extracao) {
  const n = ex.extraction.notificacao;
  confirmed = { ...spec.confirmado };
  for (const k of Object.keys(n)) if (k in confirmed && n[k]?.value != null) confirmed[k] = n[k].value;
  log("campos lidos pela IA:", Object.entries(n).filter(([, v]) => v?.value != null).length);
}
const { diagnosis } = await api("/api/case/confirm", { token, method: "POST", json: { confirmed } });
log("peça:", diagnosis.peca?.tipo, "| força:", diagnosis.forca.nivel, "| achados:", diagnosis.achados.map((a) => a.rule_id).join(", ") || "nenhum");
log("prazo:", diagnosis.prazo.efetivo, "dias restantes:", diagnosis.prazo.dias_restantes);
for (const [k, v] of Object.entries(spec.esperado ?? {})) {
  const got = k === "achados" ? diagnosis.achados.map((a) => a.rule_id).sort().join(",") : k === "forca" ? diagnosis.forca.nivel : k === "sem_achados" ? String(diagnosis.sem_achados) : null;
  const want = Array.isArray(v) ? [...v].sort().join(",") : String(v);
  if (got !== want) throw new Error(`esperado ${k}=${want}, obtido ${got}`);
}

const { payment } = await api("/api/case/checkout", { token, method: "POST", json: { method: "pix", ciente_sem_achados: true } });
await api("/api/case/pay/mock-confirm", { token, method: "POST", json: { payment_id: payment.id } });
log("pagamento (teste): aprovado");

const gen = await api("/api/case/generate", { token, method: "POST", json: { requester: { nome: "Pessoa Fictícia de Teste", cpf: "000.000.000-00", endereco: "Rua Exemplo, 1", cidade_uf: "Cidade Exemplo/EX" } } });
log("peça gerada:", gen.doc.titulo, "| teses:", gen.doc.direito.length, "| narrativa:", gen.narrativa);
const doc = await api("/api/case/document", { token });
if (!doc.plain.includes("DOS PEDIDOS")) throw new Error("texto da peça incompleto");
await api("/api/case/downloaded", { token, method: "POST" });
const ics = await api("/api/case/ics", { token });
if (!String(ics).includes("BEGIN:VCALENDAR")) throw new Error("ics inválido");
await api("/api/case/outcome", { token, method: "POST", json: { result: "pendente" } });
const state = await api("/api/case", { token });
log("status final:", state.status, "| resultado:", state.outcome?.result);
if (process.env.ADMIN_TOKEN) {
  const res = await fetch(BASE + "/api/admin/summary", { headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
  log("admin funil:", JSON.stringify((await res.json()).funil));
}
console.log(JSON.stringify({ caso: spec.nome, ok: true, leitura, achados: diagnosis.achados.map((a) => a.rule_id), forca: diagnosis.forca.nivel, teses: gen.doc.direito.map((s) => s.titulo) }));
