import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");
export const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "hora no formato HH:MM");

export const DOC_TYPES = ["notificacao_autuacao", "notificacao_penalidade", "outro"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Campos que o usuário pode marcar como "não consta na notificação". */
export const MISSABLE = ["tipificacao", "local", "data", "hora", "placa", "marca", "orgao", "agente_ou_equipamento", "agente", "prazo"] as const;
export type Missable = (typeof MISSABLE)[number];

// ---------- Saída da LLM: extração da notificação ----------

const conf = z.number().min(0).max(1);
const field = <T extends z.ZodTypeAny>(t: T) => z.object({ value: t.nullable(), confidence: conf });

export const ExtractionSchema = z.object({
  tipo_documento: field(z.enum(DOC_TYPES)),
  orgao_autuador: field(z.string()),
  numero_auto: field(z.string()),
  codigo_infracao: field(z.string()),
  descricao_infracao: field(z.string()),
  artigo_infracao: field(z.string()),
  data_infracao: field(isoDate),
  hora_infracao: field(hhmm),
  local_infracao: field(z.string()),
  placa: field(z.string()),
  marca_modelo: field(z.string()),
  data_expedicao: field(isoDate),
  data_postagem: field(isoDate),
  prazo_final: field(isoDate),
  agente_identificacao: field(z.string()),
  equipamento_identificacao: field(z.string()),
  valor: field(z.number()),
  pontos: field(z.number().int()),
  tem_imagem_infracao: field(z.boolean()),
  observacoes_meio_constatacao: field(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

// ---------- Saída da LLM: CRLV ----------

export const CrlvExtractionSchema = z.object({
  placa: field(z.string()),
  marca_modelo: field(z.string()),
});
export type CrlvExtraction = z.infer<typeof CrlvExtractionSchema>;

// ---------- Saída da LLM: fatos observáveis da imagem ----------

export const IMAGE_OBJECT = ["celular_identificavel", "objeto_nao_identificavel", "mao_sem_objeto", "maos_nao_visiveis"] as const;
export const IMAGE_BELT = ["cinto_visivel_em_uso", "cinto_visivel_sem_uso", "nao_e_possivel_ver"] as const;
export const IMAGE_PERSON = ["condutor", "passageiro", "indeterminado"] as const;

export const ImageFactsSchema = z.object({
  objeto_na_mao: field(z.enum(IMAGE_OBJECT)),
  cinto: field(z.enum(IMAGE_BELT)),
  placa_legivel: field(z.boolean()),
  placa_lida: field(z.string()),
  pessoa_em_foco: field(z.enum(IMAGE_PERSON)),
  data_hora_na_imagem: field(z.string()),
  descricao_factual: z.array(z.string().max(240)).max(6),
});
export type ImageFacts = z.infer<typeof ImageFactsSchema>;

// ---------- Dados confirmados pelo usuário ----------

export const MEIO = ["videomonitoramento", "sanmft", "agente_no_local", "nao_informado", "nao_sei"] as const;
export const SIM_NAO = ["sim", "nao", "nao_sei"] as const;

export const ConfirmedImageFactsSchema = z.object({
  objeto_na_mao: z.enum(IMAGE_OBJECT).nullable(),
  cinto: z.enum(IMAGE_BELT).nullable(),
  placa_legivel: z.boolean().nullable(),
  pessoa_em_foco: z.enum(IMAGE_PERSON).nullable(),
});
export type ConfirmedImageFacts = z.infer<typeof ConfirmedImageFactsSchema>;

const str = z.string().trim().max(300).nullable();

export const ConfirmedSchema = z.object({
  tipo_documento: z.enum(DOC_TYPES),
  jari_ja_indeferiu: z.boolean().default(false),
  orgao_autuador: str,
  numero_auto: str,
  codigo_infracao: str,
  descricao_infracao: str,
  artigo_infracao: str,
  data_infracao: isoDate.nullable(),
  hora_infracao: hhmm.nullable(),
  local_infracao: str,
  placa: str,
  marca_modelo: str,
  data_expedicao: isoDate.nullable(),
  data_postagem: isoDate.nullable(),
  /** Só na notificação de penalidade: data de expedição da notificação da autuação anterior, se o usuário tiver. */
  na_data_expedicao: isoDate.nullable().default(null),
  prazo_final: isoDate.nullable(),
  agente_identificacao: str,
  equipamento_identificacao: str,
  valor: z.number().nonnegative().max(100000).nullable(),
  pontos: z.number().int().min(0).max(60).nullable(),
  tem_imagem: z.boolean().nullable(),
  ausentes: z.array(z.enum(MISSABLE)).default([]),
  meio_constatacao: z.enum(MEIO).default("nao_sei"),
  sanmft_conformidade_informada: z.enum(SIM_NAO).default("nao_sei"),
  defesa_previa_apresentada: z.enum(SIM_NAO).default("nao_sei"),
  sne_aderido: z.enum(SIM_NAO).default("nao_sei"),
  crlv: z.object({ placa: str, marca_modelo: str }).nullable().default(null),
  imagem: ConfirmedImageFactsSchema.nullable().default(null),
});
export type Confirmed = z.infer<typeof ConfirmedSchema>;

// ---------- Saídas da LLM: seleção de teses e narrativa ----------

export const ThesisSelectionSchema = z.object({
  teses: z
    .array(z.object({ id: z.string(), achado: z.string(), justificativa: z.string().max(400) }))
    .max(12),
});
export type ThesisSelection = z.infer<typeof ThesisSelectionSchema>;

export const NarrativeSchema = z.object({
  paragrafos: z.array(z.string().min(20).max(900)).min(1).max(4),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

// ---------- Requerente (dados pessoais, cifrados no banco) ----------

export const RequesterSchema = z.object({
  nome: z.string().trim().max(160).optional().default(""),
  cpf: z.string().trim().max(20).optional().default(""),
  cnh: z.string().trim().max(20).optional().default(""),
  endereco: z.string().trim().max(300).optional().default(""),
  cidade_uf: z.string().trim().max(120).optional().default(""),
  qualidade: z.enum(["proprietario", "condutor", "proprietario_e_condutor"]).default("proprietario"),
});
export type Requester = z.infer<typeof RequesterSchema>;
