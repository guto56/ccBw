import cclasstribJson from "@/data/cclasstrib.json";
import anexosJson from "@/data/anexos-ncm.json";
export { NCM, validarNcm, caminhoNcm, limparDescricao, type NcmTabela, type ValidacaoNcm } from "./tabelas-ncm";
export { VERSOES } from "./versoes";

export interface ClassTrib {
  cClassTrib: string;
  cst: string;
  nomeCst: string;
  nome: string;
  pRedIBS: number;
  pRedCBS: number;
  anexo: number | null;
  url: string | null;
  nfe: boolean;
  nfce: boolean;
  inicio: string | null;
  fim: string | null;
}

export interface EntradaAnexo {
  /** cClassTrib */
  c: string;
  anexo: number | null;
  /** 1 = permitido, 0 = vedado */
  perm: 0 | 1;
  cond: string | null;
  exc: string | null;
  obs: string | null;
  item: string | null;
  inicio: string | null;
}

export const CCLASSTRIB = cclasstribJson as unknown as {
  fonte: string;
  publicacaoMaisRecente: string;
  baixadoEm: string;
  classificacoes: ClassTrib[];
};
export const ANEXOS = anexosJson as unknown as Record<string, EntradaAnexo[]>;

const porCodigo = new Map(CCLASSTRIB.classificacoes.map((c) => [c.cClassTrib, c]));

export function classTrib(codigo: string): ClassTrib {
  const c = porCodigo.get(codigo);
  if (!c) throw new Error(`cClassTrib ${codigo} não existe na tabela oficial carregada.`);
  return c;
}

export function existeClassTrib(codigo: string): boolean {
  return porCodigo.has(codigo);
}

