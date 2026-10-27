// Coerência entre descrição, dispositivo, natureza, valor e pontos.
// Natureza, valores e pontos são lidos do texto literal da base (CTB arts. 167, 252, 258 e 259).
import { ctbArticleExists, getExcerpt, type ExcerptRef } from "../legal";
import { formatBRL as money } from "../format";

export type Natureza = "gravissima" | "grave" | "media" | "leve";

export interface ParsedArticle {
  artigo: string | null;
  inciso: string | null;
  paragrafo: string | null;
}

function strip(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

export function parseArticle(raw: string | null): ParsedArticle {
  if (!raw) return { artigo: null, inciso: null, paragrafo: null };
  const t = strip(raw);
  const num = t.match(/(\d{1,3}(?:-[A-Z])?)/);
  const artigo = num ? num[1]! : null;
  let paragrafo: string | null = null;
  if (/PARAGRAFO\s+UNICO|§\s*UNICO|\bP\.?\s*U\.?(?=$|[\s,;.])/.test(t)) paragrafo = "unico";
  else {
    const p = t.match(/§\s*(\d+)/);
    if (p) paragrafo = p[1]!;
  }
  let inciso: string | null = null;
  if (artigo) {
    const after = t.slice(t.indexOf(artigo) + artigo.length);
    const r = after.match(/(?:^|[\s,\-\/]|INC(?:ISO)?\.?\s*)(?=[IVX])(X{0,3}(?:IX|IV|V?I{0,3}))(?=$|[\s,;.\-\/])/);
    if (r && r[1]) inciso = r[1];
  }
  return { artigo, inciso, paragrafo };
}

const POINT_WORDS: Record<string, number> = { sete: 7, cinco: 5, quatro: 4, "três": 3, tres: 3 };
const NATUREZA_BY_WORD: Record<string, Natureza> = { "gravíssima": "gravissima", grave: "grave", "média": "media", leve: "leve" };

/** Valores das multas por natureza, lidos do art. 258 do CTB. */
export function finesFromBase(): Record<Natureza, number> {
  const e = getExcerpt("CTB_ART_258");
  const out = {} as Record<Natureza, number>;
  for (const inc of e.estrutura[0]!.filhos) {
    const m = inc.texto.match(/natureza\s+(gravíssima|grave|média|leve),\s+punida\s+com\s+multa\s+no\s+valor\s+de\s+R\$\s*([\d.]+,\d{2})/);
    if (m) out[NATUREZA_BY_WORD[m[1]!]!] = Number(m[2]!.replace(/\./g, "").replace(",", "."));
  }
  return out;
}

/** Pontos por natureza, lidos do art. 259 do CTB. */
export function pointsFromBase(): Record<Natureza, number> {
  const e = getExcerpt("CTB_ART_259");
  const out = {} as Record<Natureza, number>;
  for (const inc of e.estrutura[0]!.filhos) {
    const m = inc.texto.match(/-\s*(gravíssima|grave|média|leve)\s*-\s*([a-zà-ÿ]+)\s+pontos/);
    if (m) out[NATUREZA_BY_WORD[m[1]!]!] = POINT_WORDS[m[2]!]!;
  }
  return out;
}

function naturezaFromText(t: string): Natureza | null {
  const m = t.match(/Infração\s*-\s*(gravíssima|grave|média|leve)/) ?? t.match(/infração\s+(gravíssima|grave|média|leve)/);
  return m ? NATUREZA_BY_WORD[m[1]!]! : null;
}

export interface Dispositivo {
  chave: string;
  ref: ExcerptRef;
  rotulo: string;
  natureza: Natureza;
  tema: "cinto" | "celular" | "uma_mao";
}

/** Natureza lida do texto literal do dispositivo selecionado. */
function naturezaOf(ref: ExcerptRef): Natureza {
  const e = getExcerpt(ref.excerpt);
  const caput = e.estrutura[0]!;
  if (ref.seletor.paragrafo) {
    const p = e.estrutura.find((u) => u.chave === ref.seletor.paragrafo)!;
    const n = naturezaFromText(p.texto);
    if (n) return n;
  }
  if (ref.seletor.inciso) {
    const idx = caput.filhos.findIndex((u) => u.tipo === "inciso" && u.chave === ref.seletor.inciso);
    for (let i = idx + 1; i < caput.filhos.length; i++) {
      const s = caput.filhos[i]!;
      if (s.tipo === "sancao") {
        const n = naturezaFromText(s.texto);
        if (n) return n;
      }
    }
  }
  for (const s of caput.filhos) {
    if (s.tipo === "sancao") {
      const n = naturezaFromText(s.texto);
      if (n) return n;
    }
  }
  throw new Error(`natureza não encontrada para ${ref.excerpt}`);
}

const TABLE: Omit<Dispositivo, "natureza">[] = [
  { chave: "167", ref: { excerpt: "CTB_ART_167", seletor: { caput: true } }, rotulo: "art. 167 do CTB", tema: "cinto" },
  { chave: "252:V", ref: { excerpt: "CTB_ART_252", seletor: { inciso: "V" } }, rotulo: "art. 252, V, do CTB", tema: "uma_mao" },
  { chave: "252:VI", ref: { excerpt: "CTB_ART_252", seletor: { inciso: "VI" } }, rotulo: "art. 252, VI, do CTB", tema: "celular" },
  { chave: "252:unico", ref: { excerpt: "CTB_ART_252", seletor: { paragrafo: "unico" } }, rotulo: "art. 252, parágrafo único, do CTB", tema: "celular" },
];

export const DISPOSITIVOS: Dispositivo[] = TABLE.map((d) => ({ ...d, natureza: naturezaOf(d.ref) }));

export function lookupDispositivo(p: ParsedArticle): Dispositivo | null {
  if (!p.artigo) return null;
  if (p.artigo === "167") return DISPOSITIVOS.find((d) => d.chave === "167")!;
  if (p.artigo === "252") {
    if (p.paragrafo === "unico") return DISPOSITIVOS.find((d) => d.chave === "252:unico")!;
    if (p.inciso) return DISPOSITIVOS.find((d) => d.chave === `252:${p.inciso}`) ?? null;
  }
  return null;
}

const NATUREZA_LABEL: Record<Natureza, string> = { gravissima: "gravíssima", grave: "grave", media: "média", leve: "leve" };
export function naturezaLabel(n: Natureza): string {
  return NATUREZA_LABEL[n];
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function descriptionTopics(desc: string | null) {
  const d = norm(desc ?? "");
  return {
    cinto: /cinto/.test(d),
    celular: /celular|telefone/.test(d),
    segurar: /segur|manus|manuse/.test(d),
    fone: /\bfones?\b/.test(d),
  };
}

export interface Incoerencia {
  /** Frase para o usuário (linguagem simples). */
  simples: string;
  /** Frase para a peça (pode citar dispositivos da base). */
  peca: string;
}

export interface EnquadramentoResult {
  dispositivo: Dispositivo | null;
  artigoInexistente: boolean;
  incoerencias: Incoerencia[];
  conferido: boolean;
}


export function checkEnquadramento(input: { artigo: string | null; descricao: string | null; valor: number | null; pontos: number | null }): EnquadramentoResult {
  const parsed = parseArticle(input.artigo);
  const res: EnquadramentoResult = { dispositivo: null, artigoInexistente: false, incoerencias: [], conferido: false };
  if (!parsed.artigo) return res;
  if (!ctbArticleExists(parsed.artigo)) {
    res.artigoInexistente = true;
    res.incoerencias.push({
      simples: `O artigo indicado (${input.artigo}) não existe no Código de Trânsito.`,
      peca: `O dispositivo indicado (${input.artigo}) não corresponde a nenhum artigo do CTB.`,
    });
    res.conferido = true;
    return res;
  }
  const disp = lookupDispositivo(parsed);
  const topics = descriptionTopics(input.descricao);
  if (parsed.artigo === "252" && topics.cinto) {
    res.incoerencias.push({
      simples: "A descrição fala em cinto de segurança, mas o artigo indicado (252) trata de outras condutas ao dirigir.",
      peca: "A descrição refere-se ao cinto de segurança, conduta que não está prevista no art. 252 do CTB.",
    });
  }
  if (parsed.artigo === "167" && topics.celular && !topics.cinto) {
    res.incoerencias.push({
      simples: "A descrição fala em celular, mas o artigo indicado (167) é o do cinto de segurança.",
      peca: "A descrição refere-se a telefone celular, mas o art. 167 do CTB trata do uso do cinto de segurança.",
    });
  }
  if (!disp) {
    res.conferido = res.incoerencias.length > 0;
    return res;
  }
  res.dispositivo = disp;
  res.conferido = true;
  if (disp.chave === "252:VI" && topics.celular && topics.segurar) {
    res.incoerencias.push({
      simples: "A descrição diz que o condutor segurava ou manuseava o celular, mas o artigo indicado (252, VI) é o de usar o celular, infração média. Segurar ou manusear é outra infração (gravíssima).",
      peca: "A descrição narra o condutor segurando ou manuseando telefone celular, hipótese do art. 252, parágrafo único, do CTB, mas o enquadramento indicado é o art. 252, VI, do CTB.",
    });
  }
  if (disp.chave === "252:V" && topics.celular && topics.segurar) {
    res.incoerencias.push({
      simples: "A descrição fala em segurar ou manusear o celular, mas o artigo indicado (252, V) é o de dirigir com uma das mãos, infração média.",
      peca: "A descrição narra o condutor segurando ou manuseando telefone celular, hipótese do art. 252, parágrafo único, do CTB, mas o enquadramento indicado é o art. 252, V, do CTB.",
    });
  }
  if (disp.chave === "252:unico" && topics.celular && !topics.segurar) {
    res.incoerencias.push({
      simples: "O artigo indicado (252, parágrafo único) exige que o condutor esteja segurando ou manuseando o celular, mas a descrição não diz isso.",
      peca: "O art. 252, parágrafo único, do CTB exige que o condutor esteja segurando ou manuseando telefone celular, circunstância que a descrição da autuação não registra.",
    });
  }
  const fines = finesFromBase();
  const points = pointsFromBase();
  const expectedValue = fines[disp.natureza];
  const expectedPoints = points[disp.natureza];
  const nat = naturezaLabel(disp.natureza);
  if (input.pontos != null && expectedPoints != null && input.pontos !== expectedPoints) {
    res.incoerencias.push({
      simples: `A notificação indica ${input.pontos} pontos, mas a infração do ${disp.rotulo} é ${nat} e vale ${expectedPoints} pontos.`,
      peca: `A notificação atribui ${input.pontos} pontos, enquanto a infração do ${disp.rotulo} tem natureza ${nat}, à qual o art. 259 do CTB atribui ${expectedPoints} pontos.`,
    });
  }
  if (input.valor != null && expectedValue != null) {
    const accepted = [expectedValue, expectedValue * 0.8, expectedValue * 0.6].map((v) => Math.round(v * 100) / 100);
    if (!accepted.some((v) => Math.abs(v - input.valor!) <= 0.01)) {
      res.incoerencias.push({
        simples: `O valor da multa (${money(input.valor)}) não corresponde a uma infração ${nat}, que é de ${money(expectedValue)}.`,
        peca: `O valor indicado (${money(input.valor)}) não corresponde ao previsto no art. 258 do CTB para a infração de natureza ${nat} (${money(expectedValue)}).`,
      });
    }
  }
  return res;
}
