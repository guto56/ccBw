import { describe, expect, it } from "vitest";
import { callStructured, LlmError } from "../src/worker/llm/openrouter";
import { filterSelection, writeNarrative, selectTheses } from "../src/worker/pipeline";
import { diagnose } from "../src/shared/rules/engine";
import { ConfirmedSchema, NarrativeSchema } from "../src/shared/schemas";

function fakeEnv(rows: unknown[][] = []) {
  const db = {
    prepare: () => ({ bind: (...args: unknown[]) => ({ run: async () => { rows.push(args); return {}; } }) }),
  };
  return { DB: db, OPENROUTER_API_KEY: "test-key", PUBLIC_BASE_URL: "https://x.test", LLM_TIMEOUT_MS: "5000", MODEL_VISION: "v", MODEL_REASONING: "r", MODEL_VISION_ACCEPTS_PDF: "true" } as unknown as Env;
}

function reply(content: unknown, usage = { prompt_tokens: 100, completion_tokens: 50, cost: 0.0012 }) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage }), { status: 200 });
}

const confirmed = ConfirmedSchema.parse({
  tipo_documento: "notificacao_autuacao", orgao_autuador: "ÓRGÃO EXEMPLO", numero_auto: "EX1", codigo_infracao: null,
  descricao_infracao: "Dirigir veículo segurando telefone celular", artigo_infracao: "252, parágrafo único",
  data_infracao: "2026-08-01", hora_infracao: "08:00", local_infracao: "Rua Exemplo", placa: "ABC1D23", marca_modelo: "VW/GOL",
  data_expedicao: "2026-09-15", data_postagem: null, prazo_final: "2026-11-30", agente_identificacao: null, equipamento_identificacao: null,
  valor: 293.47, pontos: 7, tem_imagem: false,
});
const d = diagnose(confirmed, "2026-10-27");

describe("cliente OpenRouter", () => {
  it("envia headers, json_schema estrito e registra uso", async () => {
    const rows: unknown[][] = [];
    let sent: { url: string; init: RequestInit } | null = null;
    const out = await callStructured({
      env: fakeEnv(rows), caseId: "c1", stage: "narrativa", model: "r", schemaName: "n", schema: NarrativeSchema,
      messages: [{ role: "user", content: "x" }],
      fetchImpl: (async (url: string, init: RequestInit) => { sent = { url, init }; return reply({ paragrafos: ["O requerente recebeu a notificação pelo correio."] }); }) as typeof fetch,
    });
    expect(out.paragrafos).toHaveLength(1);
    const headers = sent!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["HTTP-Referer"]).toBe("https://x.test");
    expect(headers["X-Title"]).toBe("ContraMulta");
    const body = JSON.parse(sent!.init.body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.temperature).toBeLessThanOrEqual(0.2);
    expect(rows).toHaveLength(1);
    expect(rows[0]![6]).toBe(0.0012); // cost_usd
  });

  it("tenta de novo uma única vez quando a saída é inválida", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return calls === 1 ? reply("não é json") : reply({ paragrafos: ["O requerente recebeu a notificação pelo correio."] }); }) as unknown as typeof fetch;
    const out = await callStructured({ env: fakeEnv(), caseId: "c1", stage: "narrativa", model: "r", schemaName: "n", schema: NarrativeSchema, messages: [{ role: "user", content: "x" }], fetchImpl });
    expect(calls).toBe(2);
    expect(out.paragrafos[0]).toMatch(/correio/);
  });

  it("desiste depois da segunda saída inválida", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return reply({ errado: true }); }) as unknown as typeof fetch;
    await expect(callStructured({ env: fakeEnv(), caseId: "c1", stage: "narrativa", model: "r", schemaName: "n", schema: NarrativeSchema, messages: [{ role: "user", content: "x" }], fetchImpl })).rejects.toMatchObject({ code: "saida_invalida" });
    expect(calls).toBe(2);
  });

  it("sem chave configurada, erro amigável", async () => {
    const env = { ...fakeEnv(), OPENROUTER_API_KEY: "" } as unknown as Env;
    await expect(callStructured({ env, caseId: null, stage: "extracao", model: "v", schemaName: "x", schema: NarrativeSchema, messages: [] })).rejects.toBeInstanceOf(LlmError);
  });
});

describe("seleção de teses", () => {
  it("descarta ID fora do catálogo e ID sem achado correspondente", () => {
    const sel = filterSelection(
      [
        { id: "T99_INVENTADA", achado: "R_INTEMPESTIVIDADE_NA", justificativa: "x" },
        { id: "T03_IDENTIFICACAO_VEICULO", achado: "R_DIVERGENCIA_VEICULO", justificativa: "x" },
        { id: "T01_INTEMPESTIVIDADE_NA", achado: "R_INTEMPESTIVIDADE_NA", justificativa: "prazo" },
      ],
      d,
    );
    expect(sel.map((s) => s.thesis_id)).toEqual(["T01_INTEMPESTIVIDADE_NA"]);
    expect(sel[0]!.selected_by).toBe("llm");
  });
  it("se a LLM falhar, usa as teses elegíveis do motor", async () => {
    const fetchImpl = (async () => new Response("erro", { status: 500 })) as unknown as typeof fetch;
    const sel = await selectTheses(fakeEnv(), "c1", d, fetchImpl);
    expect(sel.map((s) => s.thesis_id)).toEqual(["T01_INTEMPESTIVIDADE_NA"]);
    expect(sel[0]!.selected_by).toBe("regras");
  });
});

describe("narrativa", () => {
  it("artigo inventado: pede nova versão; se persistir, remove a frase", async () => {
    const fake = { paragrafos: ["O requerente recebeu a notificação em 20/09/2026. Conforme o art. 777-B do CTB, a câmera exige laudo pericial. A notificação indica o local Rua Exemplo."] };
    let calls = 0;
    const fetchImpl = (async () => { calls++; return reply(fake); }) as unknown as typeof fetch;
    const r = await writeNarrative(fakeEnv(), "c1", confirmed, d, fetchImpl);
    expect(calls).toBe(2);
    expect(r.origem).toBe("llm_corrigida");
    expect(r.paragrafos.join(" ")).not.toContain("777-B");
    expect(r.paragrafos.join(" ")).toContain("Rua Exemplo");
    expect(r.removidas).toHaveLength(1);
  });
  it("narrativa limpa passa direto", async () => {
    const fetchImpl = (async () => reply({ paragrafos: ["O requerente recebeu a notificação referente ao auto EX1."] })) as unknown as typeof fetch;
    const r = await writeNarrative(fakeEnv(), "c1", confirmed, d, fetchImpl);
    expect(r.origem).toBe("llm");
  });
  it("LLM indisponível: usa o modelo fixo, sem citações", async () => {
    const fetchImpl = (async () => { throw new Error("rede"); }) as unknown as typeof fetch;
    const r = await writeNarrative(fakeEnv(), "c1", confirmed, d, fetchImpl);
    expect(r.origem).toBe("modelo_fixo");
    expect(r.paragrafos[0]).toContain("EX1");
  });
});
