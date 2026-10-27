export type Segmento = "mercado" | "farmacia" | "petshop" | "agropecuaria" | "outro";

export const SEGMENTOS: { valor: Segmento; rotulo: string }[] = [
  { valor: "mercado", rotulo: "Mercado" },
  { valor: "farmacia", rotulo: "Farmácia" },
  { valor: "petshop", rotulo: "Pet shop" },
  { valor: "agropecuaria", rotulo: "Agropecuária" },
  { valor: "outro", rotulo: "Outro" },
];

export type Tratamento = "integral" | "reducao60" | "zero" | "outro";

export const ROTULO_TRATAMENTO: Record<Tratamento, string> = {
  integral: "Integral",
  reducao60: "Redução 60%",
  zero: "Alíquota zero",
  outro: "Outro",
};

export type Confianca = "alta" | "media" | "baixa";

export const ROTULO_CONFIANCA: Record<Confianca, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** sugerido: regra determinística, aguardando aprovação do contador. */
export type Status = "sugerido" | "revisar" | "ncm_invalido" | "aprovado";

export const ROTULO_STATUS: Record<Status, string> = {
  sugerido: "Sugerido",
  revisar: "Revisar",
  ncm_invalido: "NCM inválido",
  aprovado: "Aprovado",
};

export type Origem = "regra" | "ia" | "contador";

/** Produto como chega do XML ou da planilha. Nada de dados do destinatário. */
export interface ProdutoEntrada {
  id: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string;
  cfop?: string;
  ean?: string;
  unidade?: string;
}

export interface Sugestao {
  tratamento: Tratamento;
  cst: string;
  cClassTrib: string;
  pRedIBS: number;
  pRedCBS: number;
  confianca: Confianca;
  justificativa: string;
  fonte: string;
  fonteUrl: string | null;
  status: Status;
  origem: Origem;
  /** NCM usado na classificação, quando diferente do informado (sugerido pela IA ou corrigido). */
  ncmSugerido?: string;
  alertas: string[];
}

export type TipoPendencia = "sugerir_ncm" | "condicao" | "descricao_vaga";

/** Pergunta que o motor não consegue responder só com regras. */
export interface PendenciaIA {
  tipo: TipoPendencia;
  /** Texto da pergunta, autocontido, enviado à IA. */
  pergunta: string;
  /** cClassTrib que passa a valer se a resposta for "sim" (só para tipo condicao). */
  seSim?: string;
}

export interface ResultadoMotor {
  sugestao: Sugestao;
  pendencia?: PendenciaIA;
}

export interface RespostaIA {
  id: string;
  /** Para sugerir_ncm e descricao_vaga. */
  ncm?: string | null;
  /** Para condicao. */
  atende?: boolean | null;
  confianca: Confianca;
  justificativa: string;
}
