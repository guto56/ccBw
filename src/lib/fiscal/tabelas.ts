import ncmJson from "@/data/ncm.json";
import cclasstribJson from "@/data/cclasstrib.json";
import anexosJson from "@/data/anexos-ncm.json";

export interface NcmTabela {
  versao: string;
  ato: string;
  baixadoEm: string;
  /** código 8 dígitos -> [descrição, início vigência, fim vigência] (aaaa-mm-dd) */
  itens: Record<string, [string, string, string]>;
  hierarquia: Record<string, string>;
}

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
  titulo: string | null;
  inicio: string | null;
}

export const NCM = ncmJson as unknown as NcmTabela;
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

export type ValidacaoNcm =
  | { ok: true; codigo: string; descricao: string; caminho: string[] }
  | { ok: false; codigo: string; motivo: string };

/** (a) NCM existe, está vigente e tem 8 dígitos. */
export function validarNcm(bruto: string | undefined | null, hoje = new Date().toISOString().slice(0, 10)): ValidacaoNcm {
  const codigo = (bruto ?? "").replace(/\D/g, "");
  if (!codigo) return { ok: false, codigo, motivo: "NCM não informado." };
  if (codigo.length !== 8) return { ok: false, codigo, motivo: `NCM com ${codigo.length} dígitos; o NCM tem 8.` };
  const item = NCM.itens[codigo];
  if (!item) return { ok: false, codigo, motivo: `NCM ${codigo} não existe na tabela vigente (${NCM.ato}).` };
  const [descricao, inicio, fim] = item;
  if (fim < hoje) return { ok: false, codigo, motivo: `NCM ${codigo} saiu de vigência em ${fim}.` };
  if (inicio > hoje) return { ok: false, codigo, motivo: `NCM ${codigo} só entra em vigência em ${inicio}.` };
  return { ok: true, codigo, descricao: limparDescricao(descricao), caminho: caminhoNcm(codigo) };
}

/** Descrições da hierarquia: capítulo, posição, subposições, item. */
export function caminhoNcm(codigo: string): string[] {
  const out: string[] = [];
  for (const n of [2, 4, 5, 6, 7]) {
    const d = NCM.hierarquia[codigo.slice(0, n)];
    if (d) out.push(limparDescricao(d));
  }
  const item = NCM.itens[codigo];
  if (item) out.push(limparDescricao(item[0]));
  return out;
}

export function limparDescricao(d: string): string {
  return d
    .replace(/<[^>]+>/g, "")
    .replace(/^[-\s]+/, "")
    .trim();
}

export const VERSOES = {
  ncm: `${NCM.versao} (${NCM.ato})`,
  cclasstrib: `Tabela cClassTrib/CST publicada em ${CCLASSTRIB.publicacaoMaisRecente} (IT 2025.002)`,
};
