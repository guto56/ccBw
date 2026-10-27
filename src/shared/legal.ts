// Acesso à base jurídica versionada em /legal. Todo texto jurídico exibido ou impresso sai daqui.
import excerptsData from "../../legal/excerpts.json";
import thesesData from "../../legal/theses.json";
import ctbArtigos from "../../legal/ctb_artigos.json";

export type UnitKind = "caput" | "paragrafo" | "inciso" | "alinea" | "sancao";

export interface Unit {
  tipo: UnitKind;
  chave: string;
  texto: string;
  filhos: Unit[];
}

export interface Excerpt {
  id: string;
  norma: string;
  artigo: string;
  texto: string;
  estrutura: Unit[];
  fonte_url: string;
  acessado_em: string;
  sha256_fonte: string;
  status: string;
}

export interface Norma {
  id: string;
  nome: string;
  nome_curto: string;
  tipo: string;
  numero: string;
  ano: string;
  status: string;
  fonte: { url: string; acessado_em: string };
}

export interface Selector {
  caput?: boolean;
  paragrafo?: string;
  inciso?: string;
  alinea?: string;
  incisos?: boolean;
}

export interface ExcerptRef {
  excerpt: string;
  seletor: Selector;
}

export interface Thesis {
  id: string;
  titulo: string;
  condicao_de_aplicacao: { regra: string; descricao: string };
  pecas: PieceType[];
  fundamento: ExcerptRef[];
  fundamento_variavel?: string;
  peso: number;
  acessoria: boolean;
  texto_modelo: string;
  pedido: string;
  status: "rascunho" | "revisado" | "suspensa";
}

export type PieceType = "defesa_previa" | "recurso_jari" | "recurso_segunda_instancia";

export interface PieceTemplate {
  titulo: string;
  destinatario: string;
  fundamento: ExcerptRef[];
  pedido_final: string;
}

export interface Fundamento {
  ref: ExcerptRef;
  citacao: string;
  texto: string;
  fonte_url: string;
  acessado_em: string;
}

const EXCERPTS = new Map<string, Excerpt>((excerptsData.excerpts as Excerpt[]).map((e) => [e.id, e]));
const NORMAS = new Map<string, Norma>((excerptsData.normas as Norma[]).map((n) => [n.id, n]));
const CTB_ARTIGOS = new Set<string>(ctbArtigos.artigos);

export const THESES: Thesis[] = thesesData.teses as Thesis[];
export const PIECES = thesesData.pecas as Record<PieceType, PieceTemplate>;
export const NOTICES = thesesData.avisos as Record<string, { fundamento: ExcerptRef[] }>;

export function listExcerpts(): Excerpt[] {
  return [...EXCERPTS.values()];
}

export function listNormas(): Norma[] {
  return [...NORMAS.values()];
}

export function getNorma(id: string): Norma | undefined {
  return NORMAS.get(id);
}

export function getExcerpt(id: string): Excerpt {
  const e = EXCERPTS.get(id);
  if (!e) throw new Error(`trecho inexistente na base: ${id}`);
  return e;
}

export function findExcerpt(norma: string, artigo: string): Excerpt | undefined {
  for (const e of EXCERPTS.values()) if (e.norma === norma && e.artigo === artigo) return e;
  return undefined;
}

export function ctbArticleExists(artigo: string): boolean {
  return CTB_ARTIGOS.has(artigo);
}

export function getThesis(id: string): Thesis | undefined {
  return THESES.find((t) => t.id === id);
}

function ordinal(n: string): string {
  const num = Number.parseInt(n, 10);
  return Number.isFinite(num) && num < 10 && /^\d+$/.test(n) ? `${n}º` : n;
}

export function articleLabel(artigo: string): string {
  const [base, suffix] = artigo.split("-");
  return suffix ? `${ordinal(base ?? artigo)}-${suffix}` : ordinal(artigo);
}

function paragraphLabel(key: string): string {
  if (key === "unico") return "parágrafo único";
  const [num, suffix] = key.split("-");
  return `§ ${ordinal(num ?? key)}${suffix ? `-${suffix}` : ""}`;
}

/** Rótulo legível da citação, ex.: "CTB, art. 281, § 1º, II". */
export function citationLabel(ref: ExcerptRef): string {
  const e = getExcerpt(ref.excerpt);
  const n = getNorma(e.norma);
  const parts = [`${n?.nome_curto ?? e.norma}, art. ${articleLabel(e.artigo)}`];
  const s = ref.seletor;
  if (s.paragrafo) parts.push(paragraphLabel(s.paragrafo));
  if (s.inciso) parts.push(s.inciso);
  if (s.alinea) parts.push(`alínea "${s.alinea}"`);
  if (!s.paragrafo && !s.inciso && s.caput) parts.push("caput");
  return parts.join(", ");
}

function withChildren(u: Unit, force = false): string[] {
  const out = [u.texto];
  if (force || u.texto.trimEnd().endsWith(":")) {
    for (const c of u.filhos) out.push(...withChildren(c, false));
  }
  return out;
}

/** Sanções (Infração - …; Penalidade - …) que se aplicam a um inciso: o primeiro grupo de sanções depois dele. */
function sanctionsAfter(siblings: Unit[], index: number): string[] {
  const out: string[] = [];
  for (let i = index + 1; i < siblings.length; i++) {
    const s = siblings[i]!;
    if (s.tipo === "sancao") out.push(s.texto);
    else if (out.length) break;
  }
  return out;
}

/** Texto literal do dispositivo selecionado, com o cabeçalho necessário para leitura (caput ou parágrafo). */
export function selectText(ref: ExcerptRef): string {
  const e = getExcerpt(ref.excerpt);
  const s = ref.seletor;
  const caput = e.estrutura[0];
  if (!caput) throw new Error(`trecho vazio: ${e.id}`);
  let container: Unit = caput;
  const lines: string[] = [];
  if (s.paragrafo) {
    const p = e.estrutura.find((u) => u.tipo === "paragrafo" && u.chave === s.paragrafo);
    if (!p) throw new Error(`parágrafo ${s.paragrafo} não existe em ${e.id}`);
    container = p;
    if (!s.inciso) return withChildren(p, Boolean(s.incisos)).join("\n");
    lines.push(p.texto);
  }
  if (s.inciso) {
    const idx = container.filhos.findIndex((u) => u.tipo === "inciso" && u.chave === s.inciso);
    if (idx < 0) throw new Error(`inciso ${s.inciso} não existe em ${e.id}`);
    const inc = container.filhos[idx]!;
    if (container === caput) lines.push(caput.texto);
    if (s.alinea) {
      const al = inc.filhos.find((u) => u.tipo === "alinea" && u.chave === s.alinea);
      if (!al) throw new Error(`alínea ${s.alinea} não existe em ${e.id}`);
      lines.push(inc.texto, al.texto);
    } else {
      lines.push(...withChildren(inc));
    }
    lines.push(...sanctionsAfter(container.filhos, idx));
    return lines.join("\n");
  }
  return withChildren(caput, Boolean(s.incisos)).join("\n");
}

export function resolveFundamento(ref: ExcerptRef): Fundamento {
  const e = getExcerpt(ref.excerpt);
  return { ref, citacao: citationLabel(ref), texto: selectText(ref), fonte_url: e.fonte_url, acessado_em: e.acessado_em };
}

/** Verifica se um dispositivo (parágrafo/inciso/alínea) existe na estrutura do trecho. */
export function unitExists(e: Excerpt, sel: { paragrafo?: string; inciso?: string; alinea?: string }): boolean {
  let scope: Unit[] = e.estrutura;
  let container: Unit | undefined = e.estrutura[0];
  if (sel.paragrafo) {
    container = e.estrutura.find((u) => u.tipo === "paragrafo" && u.chave === sel.paragrafo);
    if (!container) return false;
  }
  if (sel.inciso) {
    const candidates = sel.paragrafo ? container!.filhos : [...(e.estrutura[0]?.filhos ?? []), ...e.estrutura.flatMap((u) => u.filhos)];
    const inc = candidates.find((u) => u.tipo === "inciso" && u.chave === sel.inciso);
    if (!inc) return false;
    container = inc;
  }
  if (sel.alinea) {
    scope = container?.filhos ?? [];
    if (!scope.some((u) => u.tipo === "alinea" && u.chave === sel.alinea)) return false;
  }
  return true;
}
