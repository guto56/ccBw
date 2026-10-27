// Cliente OpenRouter: structured output (json_schema), validação zod, no máximo 1 nova tentativa,
// timeout e registro de uso/custo por chamada na tabela llm_usage.
import type { z } from "zod";
import { toStrictJsonSchema } from "./jsonschema";
import { newId } from "../util";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export type LlmStage = "extracao" | "imagem" | "crlv" | "teses" | "narrativa";

export class LlmError extends Error {
  constructor(
    public code: "nao_configurado" | "timeout" | "provedor" | "saida_invalida",
    message: string,
  ) {
    super(message);
  }
}

export const FRIENDLY: Record<LlmError["code"], string> = {
  nao_configurado: "A leitura automática está indisponível agora. Você pode preencher os dados à mão.",
  timeout: "A leitura demorou mais que o esperado. Tente de novo ou preencha os dados à mão.",
  provedor: "O serviço de leitura não respondeu. Tente de novo em alguns minutos ou preencha os dados à mão.",
  saida_invalida: "Não conseguimos ler o documento com segurança. Confira a foto ou preencha os dados à mão.",
};

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

export interface StructuredCall<T> {
  env: Env;
  caseId: string | null;
  stage: LlmStage;
  model: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  maxTokens?: number;
  plugins?: unknown[];
  fetchImpl?: typeof fetch;
}

async function logUsage(env: Env, row: { caseId: string | null; stage: LlmStage; model: string; usage: Usage | null; latency: number; ok: boolean; error?: string }) {
  try {
    await env.DB.prepare(
      "INSERT INTO llm_usage (id, case_id, stage, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, ok, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(newId(), row.caseId, row.stage, row.model, row.usage?.prompt_tokens ?? null, row.usage?.completion_tokens ?? null, row.usage?.cost ?? null, row.latency, row.ok ? 1 : 0, row.error ?? null, Date.now())
      .run();
  } catch (e) {
    console.error(JSON.stringify({ msg: "llm_usage_insert_failed", error: String(e) }));
  }
}

function extractJson(content: unknown): unknown {
  if (typeof content !== "string") throw new Error("resposta sem texto");
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(trimmed);
}

export async function callStructured<T>(c: StructuredCall<T>): Promise<T> {
  if (!c.env.OPENROUTER_API_KEY) throw new LlmError("nao_configurado", "OPENROUTER_API_KEY ausente");
  const doFetch = c.fetchImpl ?? fetch;
  const timeout = Number(c.env.LLM_TIMEOUT_MS || "60000");
  const jsonSchema = toStrictJsonSchema(c.schema);
  let messages = [...c.messages];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    let usage: Usage | null = null;
    try {
      const res = await doFetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": c.env.PUBLIC_BASE_URL,
          "X-Title": "ContraMulta",
        },
        body: JSON.stringify({
          model: c.model,
          messages,
          temperature: c.temperature ?? 0,
          max_tokens: c.maxTokens ?? 2000,
          response_format: { type: "json_schema", json_schema: { name: c.schemaName, strict: true, schema: jsonSchema } },
          provider: { require_parameters: true },
          usage: { include: true },
          ...(c.plugins ? { plugins: c.plugins } : {}),
        }),
        signal: AbortSignal.timeout(timeout),
      });
      const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[]; usage?: Usage; error?: { message?: string } } | null;
      usage = body?.usage ?? null;
      if (!res.ok || !body?.choices?.length) {
        const msg = `HTTP ${res.status}: ${body?.error?.message ?? "sem detalhes"}`;
        await logUsage(c.env, { caseId: c.caseId, stage: c.stage, model: c.model, usage, latency: Date.now() - started, ok: false, error: msg.slice(0, 300) });
        throw new LlmError("provedor", msg);
      }
      const content = body.choices[0]!.message?.content;
      let parsed: unknown;
      try {
        parsed = extractJson(content);
      } catch {
        parsed = undefined;
      }
      const result = parsed === undefined ? null : c.schema.safeParse(parsed);
      if (result?.success) {
        await logUsage(c.env, { caseId: c.caseId, stage: c.stage, model: c.model, usage, latency: Date.now() - started, ok: true });
        return result.data;
      }
      lastError = result ? result.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "JSON inválido";
      await logUsage(c.env, { caseId: c.caseId, stage: c.stage, model: c.model, usage, latency: Date.now() - started, ok: false, error: `saida_invalida: ${lastError}`.slice(0, 300) });
      messages = [
        ...c.messages,
        { role: "assistant", content: typeof content === "string" ? content.slice(0, 4000) : "" },
        { role: "user", content: `A resposta anterior não segue o schema (${lastError}). Responda de novo apenas com o JSON válido, sem texto fora dele.` },
      ];
    } catch (e) {
      if (e instanceof LlmError) throw e;
      const name = (e as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        await logUsage(c.env, { caseId: c.caseId, stage: c.stage, model: c.model, usage, latency: Date.now() - started, ok: false, error: "timeout" });
        throw new LlmError("timeout", "tempo esgotado");
      }
      await logUsage(c.env, { caseId: c.caseId, stage: c.stage, model: c.model, usage, latency: Date.now() - started, ok: false, error: String(e).slice(0, 300) });
      throw new LlmError("provedor", String(e));
    }
  }
  throw new LlmError("saida_invalida", lastError);
}
