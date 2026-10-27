// Etapas com LLM. Cada uma valida a saída com zod e registra uso em llm_usage.
import { callStructured, LlmError, type ChatMessage, type ContentPart } from "./llm/openrouter";
import { CRLV_SYSTEM, EXTRACTION_SYSTEM, IMAGE_SYSTEM, NARRATIVE_SYSTEM, THESES_SYSTEM } from "./llm/prompts";
import {
  CrlvExtractionSchema,
  ExtractionSchema,
  ImageFactsSchema,
  NarrativeSchema,
  ThesisSelectionSchema,
  type Confirmed,
  type CrlvExtraction,
  type Extraction,
  type ImageFacts,
} from "../shared/schemas";
import { THESES } from "../shared/legal";
import type { Diagnosis } from "../shared/rules/engine";
import type { SelectedThesis } from "../shared/document";
import { fallbackNarrative } from "../shared/document";
import { removeInvalidCitations, validateText } from "../shared/citations";
import { formatBR } from "../shared/rules/dates";
import { bytesToBase64 } from "./util";

export interface FilePart {
  contentType: string;
  bytes: Uint8Array;
  filename: string;
}

export function filesToContent(env: Env, files: FilePart[]): ContentPart[] {
  const parts: ContentPart[] = [];
  for (const f of files) {
    const b64 = bytesToBase64(f.bytes);
    if (f.contentType === "application/pdf") {
      if (env.MODEL_VISION_ACCEPTS_PDF !== "true") throw new LlmError("saida_invalida", "modelo configurado não aceita PDF");
      parts.push({ type: "file", file: { filename: f.filename, file_data: `data:application/pdf;base64,${b64}` } });
    } else {
      parts.push({ type: "image_url", image_url: { url: `data:${f.contentType};base64,${b64}` } });
    }
  }
  return parts;
}

const pdfPlugins = (files: FilePart[]) => (files.some((f) => f.contentType === "application/pdf") ? [{ id: "file-parser", pdf: { engine: "native" } }] : undefined);

export async function extractNotification(env: Env, caseId: string, files: FilePart[], fetchImpl?: typeof fetch): Promise<Extraction> {
  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACTION_SYSTEM },
    { role: "user", content: [{ type: "text", text: "Extraia os dados desta notificação de trânsito (frente e verso, se houver)." }, ...filesToContent(env, files)] },
  ];
  return callStructured({ env, caseId, stage: "extracao", model: env.MODEL_VISION, messages, schema: ExtractionSchema, schemaName: "extracao_notificacao", temperature: 0, maxTokens: 2500, plugins: pdfPlugins(files), fetchImpl });
}

export async function extractCrlv(env: Env, caseId: string, files: FilePart[], fetchImpl?: typeof fetch): Promise<CrlvExtraction> {
  const messages: ChatMessage[] = [
    { role: "system", content: CRLV_SYSTEM },
    { role: "user", content: [{ type: "text", text: "Extraia placa e marca/modelo deste CRLV." }, ...filesToContent(env, files)] },
  ];
  return callStructured({ env, caseId, stage: "crlv", model: env.MODEL_VISION, messages, schema: CrlvExtractionSchema, schemaName: "extracao_crlv", temperature: 0, maxTokens: 400, plugins: pdfPlugins(files), fetchImpl });
}

const LEGAL_WORDS = /\b(infra[çc][ãa]o|irregular|nul[ao]|ilegal|ilegalidade|culpad|inv[áa]lid|v[áa]lid[ao]|multa)\b/i;

export async function analyzeImage(env: Env, caseId: string, files: FilePart[], fetchImpl?: typeof fetch): Promise<ImageFacts> {
  const messages: ChatMessage[] = [
    { role: "system", content: IMAGE_SYSTEM },
    { role: "user", content: [{ type: "text", text: "Descreva os fatos visíveis nesta imagem." }, ...filesToContent(env, files)] },
  ];
  const facts = await callStructured({ env, caseId, stage: "imagem", model: env.MODEL_VISION, messages, schema: ImageFactsSchema, schemaName: "fatos_imagem", temperature: 0, maxTokens: 900, fetchImpl });
  // Só fatos: descarta frases com conclusão jurídica.
  return { ...facts, descricao_factual: facts.descricao_factual.filter((s) => !LEGAL_WORDS.test(s)) };
}

/**
 * Seleção de teses: a LLM só pode devolver IDs do catálogo, ligados a um achado do motor.
 * Qualquer ID fora do catálogo, ou sem achado correspondente, é descartado.
 * Teses elegíveis que a LLM omitir entram por regra (o motor já verificou a condição).
 */
export function filterSelection(raw: { id: string; achado: string; justificativa: string }[], d: Diagnosis): SelectedThesis[] {
  const eligible = new Map(d.teses_elegiveis.map((t) => [t.thesis_id, t]));
  const out: SelectedThesis[] = [];
  for (const r of raw) {
    const e = eligible.get(r.id);
    if (!e || e.rule_id !== r.achado) continue;
    if (out.some((o) => o.thesis_id === r.id)) continue;
    out.push({ thesis_id: r.id, rule_id: e.rule_id, justificativa: r.justificativa, selected_by: "llm" });
  }
  for (const e of d.teses_elegiveis) {
    if (!out.some((o) => o.thesis_id === e.thesis_id)) {
      const f = d.achados.find((a) => a.rule_id === e.rule_id);
      out.push({ thesis_id: e.thesis_id, rule_id: e.rule_id, justificativa: f?.titulo ?? e.titulo, selected_by: "regras" });
    }
  }
  return out;
}

export async function selectTheses(env: Env, caseId: string, d: Diagnosis, fetchImpl?: typeof fetch): Promise<SelectedThesis[]> {
  if (!d.teses_elegiveis.length) return [];
  const catalog = THESES.filter((t) => d.teses_elegiveis.some((e) => e.thesis_id === t.id)).map((t) => ({ id: t.id, titulo: t.titulo, regra: t.condicao_de_aplicacao.regra, peso: t.peso, acessoria: t.acessoria }));
  const achados = d.achados.map((a) => ({ rule_id: a.rule_id, titulo: a.titulo, detalhe: a.detalhe }));
  const messages: ChatMessage[] = [
    { role: "system", content: THESES_SYSTEM },
    { role: "user", content: JSON.stringify({ achados, catalogo: catalog }) },
  ];
  try {
    const sel = await callStructured({ env, caseId, stage: "teses", model: env.MODEL_REASONING, messages, schema: ThesisSelectionSchema, schemaName: "selecao_teses", temperature: 0, maxTokens: 1200, fetchImpl });
    return filterSelection(sel.teses, d);
  } catch (e) {
    console.error(JSON.stringify({ msg: "selecao_teses_fallback", case_id: caseId, error: e instanceof LlmError ? e.code : String(e) }));
    return filterSelection([], d);
  }
}

function narrativeInput(c: Confirmed, d: Diagnosis) {
  return {
    orgao_autuador: c.orgao_autuador,
    numero_auto: c.numero_auto,
    descricao_infracao: c.descricao_infracao,
    data_infracao: c.data_infracao ? formatBR(c.data_infracao) : null,
    hora_infracao: c.hora_infracao,
    local_infracao: c.local_infracao,
    placa: c.placa,
    marca_modelo: c.marca_modelo,
    data_expedicao: c.data_expedicao ? formatBR(c.data_expedicao) : null,
    data_postagem: c.data_postagem ? formatBR(c.data_postagem) : null,
    meio_constatacao: c.meio_constatacao,
    achados: d.achados.map((a) => ({ titulo: a.titulo, detalhe: a.detalhe })),
  };
}

export interface NarrativeResult {
  paragrafos: string[];
  origem: "llm" | "llm_corrigida" | "modelo_fixo";
  removidas: string[];
}

/** Narrativa dos fatos. Citação fora da base: pede nova versão uma vez; se persistir, remove as frases. */
export async function writeNarrative(env: Env, caseId: string, c: Confirmed, d: Diagnosis, fetchImpl?: typeof fetch): Promise<NarrativeResult> {
  const base: ChatMessage[] = [
    { role: "system", content: NARRATIVE_SYSTEM },
    { role: "user", content: JSON.stringify(narrativeInput(c, d)) },
  ];
  try {
    const first = await callStructured({ env, caseId, stage: "narrativa", model: env.MODEL_REASONING, messages: base, schema: NarrativeSchema, schemaName: "narrativa_fatos", temperature: 0.2, maxTokens: 1200, fetchImpl });
    const text = first.paragrafos.join("\n");
    const v = validateText(text);
    if (v.ok) return { paragrafos: first.paragrafos, origem: "llm", removidas: [] };
    const retry: ChatMessage[] = [
      ...base,
      { role: "assistant", content: JSON.stringify(first) },
      { role: "user", content: `Reescreva sem nenhuma citação normativa ou jurisprudencial. Remova: ${v.invalid.map((x) => `"${x.raw}"`).join(", ")}.` },
    ];
    const second = await callStructured({ env, caseId, stage: "narrativa", model: env.MODEL_REASONING, messages: retry, schema: NarrativeSchema, schemaName: "narrativa_fatos", temperature: 0, maxTokens: 1200, fetchImpl });
    const cleaned = removeInvalidCitations(second.paragrafos.join("\n"));
    const paragrafos = cleaned.text.split("\n").filter(Boolean);
    if (!paragrafos.length) return { paragrafos: fallbackNarrative(c, d), origem: "modelo_fixo", removidas: cleaned.removed.map((r) => r.sentence) };
    return { paragrafos, origem: "llm_corrigida", removidas: cleaned.removed.map((r) => r.sentence) };
  } catch (e) {
    console.error(JSON.stringify({ msg: "narrativa_fallback", case_id: caseId, error: e instanceof LlmError ? e.code : String(e) }));
    return { paragrafos: fallbackNarrative(c, d), origem: "modelo_fixo", removidas: [] };
  }
}
