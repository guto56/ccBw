import type { ProdutoUnico } from "./nfe";

export type PedidoWorker =
  | { tipo: "xml"; arquivos: File[] }
  | { tipo: "planilha"; arquivo: File };

export type SituacaoArquivo = "lendo" | "ok" | "ignorado" | "erro";

export type RespostaWorker =
  | { tipo: "progresso"; arquivo: string; situacao: SituacaoArquivo; mensagem: string; notas: number; itens: number }
  | { tipo: "fim-xml"; produtos: ProdutoUnico[]; notas: number; arquivos: number; ignorados: number }
  | { tipo: "planilha"; arquivo: string; cabecalho: string[]; linhas: string[][] }
  | { tipo: "erro"; mensagem: string };
