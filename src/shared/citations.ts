// Validador pós-geração: encontra toda citação normativa ou jurisprudencial num texto e confere se
// ela existe na base jurídica (/legal). Citação fora da base é inválida; jurisprudência é sempre inválida.
import { findExcerpt, getNorma, unitExists } from "./legal";

export type CitationKind = "artigo" | "norma" | "paragrafo_solto" | "jurisprudencia";

export interface Citation {
  kind: CitationKind;
  raw: string;
  start: number;
  end: number;
  norma: string | null;
  artigos: string[];
  paragrafos: string[];
  incisos: string[];
  alineas: string[];
  valid: boolean;
  reason?: string;
}

const ORD = String.raw`\d+(?:\.\d+)?(?:-[A-Z])?\s*(?:º|°|ª|o(?![a-z]))?`;
const ROMAN = String.raw`[IVXL]+`;

const JURIS = new RegExp(
  [
    String.raw`\bS[úu]mulas?\b(?:\s+(?:vinculante\s+)?n?[º°o.]?\s*\d+)?(?:\s+d[oa]\s+\w+)?`,
    String.raw`\bSTJ\b`,
    String.raw`\bSTF\b`,
    String.raw`\bTJ[A-Z]{2}\b`,
    String.raw`\bTRF-?\d?\b`,
    String.raw`\bTST\b`,
    String.raw`\bREsp\b[^.;]*`,
    String.raw`\bAg(?:Rg|Int)\b[^.;]*`,
    String.raw`\bRE\s+\d[\d.]*`,
    String.raw`\bjurisprud[êe]ncia\w*`,
    String.raw`\bac[óo]rd[ãa]os?\b`,
    String.raw`\bprecedentes?\b`,
    String.raw`\bTema\s+(?:n[º°o.]?\s*)?\d+`,
    String.raw`\bApela[çc][ãa]o\s+C[íi]vel\b`,
    String.raw`\bRecurso\s+(?:Especial|Extraordin[áa]rio)\b`,
    String.raw`\bADI(?:N)?\s*\d*`,
    String.raw`\bTribuna(?:l|is)\b`,
    String.raw`\bdecis[ãa]o\s+judicial\b`,
  ].join("|"),
  "gi",
);

const NORMA_RX = new RegExp(
  [
    // CTB por nome
    String.raw`(?<ctb>\bCTB\b|C[óo]digo\s+de\s+Tr[âa]nsito\s+Brasileiro)`,
    // Lei n
    String.raw`(?<lei>\bLei(?:\s+(?:Federal|Complementar))?\s*(?:n[º°o.]?\s*)?(?<leinum>\d[\d.]*)(?:\s*\/\s*(?<leiano>\d{2,4})|,\s*de\s*\d{1,2}º?\s*de\s*[a-zç]+\s*de\s*(?<leiano2>\d{4}))?)`,
    // Resolução (CONTRAN ou outra)
    String.raw`(?<res>\bResolu[çc](?:[ãa]o|[õo]es)\s*(?:do\s+)?(?<resorg>[A-Z][A-Za-z]+\s*)?(?:n[º°o.]?\s*)?(?<resnum>\d[\d.]*)(?:\s*\/\s*(?<resano>\d{2,4})|,\s*de\s*\d{1,2}º?\s*de\s*[a-zç]+\s*de\s*(?<resano2>\d{4}))?)`,
    // demais atos normativos
    String.raw`(?<outro>\b(?:Decreto(?:-Lei)?|Portaria|Delibera[çc][ãa]o|Instru[çc][ãa]o\s+Normativa|Medida\s+Provis[óo]ria|Emenda\s+Constitucional|Of[íi]cio\s+Circular|Nota\s+T[ée]cnica)\b[^,;.]*?\d[\d.\/]*)`,
    String.raw`(?<cf>\bConstitui[çc][ãa]o(?:\s+Federal|\s+da\s+Rep[úu]blica)?\b|\bCF(?:\/88)?\b)`,
    String.raw`(?<cdc>C[óo]digo\s+(?:de\s+Defesa\s+do\s+Consumidor|Civil|Penal|de\s+Processo\s+\w+)|\bCDC\b|\bLGPD\b)`,
  ].join("|"),
  "g",
);

interface NormaHit {
  start: number;
  end: number;
  raw: string;
  id: string | null;
  reason?: string;
}

function normaId(m: RegExpExecArray): { id: string | null; reason?: string } {
  const g = m.groups ?? {};
  if (g.ctb) return { id: "CTB" };
  if (g.lei) {
    const num = (g.leinum ?? "").replace(/\./g, "");
    if (num === "9503") return { id: "CTB" };
    return { id: null, reason: `lei fora da base (${m[0].trim()})` };
  }
  if (g.res) {
    const org = (g.resorg ?? "").trim().toUpperCase();
    const num = (g.resnum ?? "").replace(/\./g, "");
    const ano = g.resano ?? g.resano2 ?? "";
    const anoFull = ano.length === 2 ? `20${ano}` : ano;
    if (org && org !== "CONTRAN") return { id: null, reason: `resolução de outro órgão (${m[0].trim()})` };
    const id = `RES_CONTRAN_${num}_${anoFull || "2022"}`;
    const n = getNorma(id);
    if (!n) return { id: null, reason: `resolução fora da base (${m[0].trim()})` };
    if (anoFull && n.ano !== anoFull) return { id: null, reason: `ano não confere (${m[0].trim()})` };
    if (n.status !== "baixado") return { id: null, reason: `norma pendente (${m[0].trim()})` };
    return { id };
  }
  return { id: null, reason: `ato normativo fora da base (${m[0].trim()})` };
}

function findNormas(text: string): NormaHit[] {
  const out: NormaHit[] = [];
  NORMA_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NORMA_RX.exec(text))) {
    const r = normaId(m);
    out.push({ start: m.index, end: m.index + m[0].length, raw: m[0], id: r.id, reason: r.reason });
  }
  return out;
}

function cleanOrd(s: string): string {
  return s.replace(/\s+/g, "").replace(/[º°ªo]$/, "").replace(/\./g, "");
}

function listOf(s: string, item: RegExp): string[] {
  return [...s.matchAll(item)].map((x) => x[0]);
}

// Partes que antecedem "do art. N": "§ 1º do", "parágrafo único do", "inciso II do § 1º do"
const PRE_PART = new RegExp(
  String.raw`(?:(?:o|a|os|as|no|na|nos|nas|do|da|pelo|pela)\s+)?(?:(?:§§?\s*${ORD}(?:\s*(?:,|e)\s*${ORD})*|par[áa]grafo\s+[úu]nico|incisos?\s+${ROMAN}(?:\s*(?:,|e)\s*${ROMAN})*|al[íi]neas?\s+["“]?[a-z]["”]?|caput)\s+d[oa]\s+)+$`,
  "i",
);
// Partes que seguem "art. N": ", § 1º", ", II", ", parágrafo único", ", inciso II", ", alínea "a"", ", caput"
const POST_PART = new RegExp(
  String.raw`^(?:\s*,\s*(?:§§?\s*${ORD}(?:\s*(?:,|e)\s*${ORD})*|par[áa]grafo\s+[úu]nico|incisos?\s+${ROMAN}(?:\s*(?:,|e)\s*${ROMAN})*|${ROMAN}(?=\s*[,;.)]|\s+d[oa]\s|\s+e\s)|al[íi]neas?\s+["“]?[a-z]["”]?|caput))+`,
  "i",
);
const ART_RX = new RegExp(String.raw`\b(?:arts?\.|artigos?)\s*(${ORD}(?:\s*(?:,|e)\s*(?!§)${ORD})*)`, "gi");

function parseParts(s: string) {
  const paragrafos: string[] = [];
  const incisos: string[] = [];
  const alineas: string[] = [];
  for (const m of s.matchAll(new RegExp(String.raw`§§?\s*(${ORD}(?:\s*(?:,|e)\s*${ORD})*)`, "gi"))) {
    paragrafos.push(...listOf(m[1]!, new RegExp(ORD, "g")).map(cleanOrd));
  }
  if (/par[áa]grafo\s+[úu]nico/i.test(s)) paragrafos.push("unico");
  for (const m of s.matchAll(new RegExp(String.raw`incisos?\s+(${ROMAN}(?:\s*(?:,|e)\s*${ROMAN})*)`, "gi"))) {
    incisos.push(...listOf(m[1]!, new RegExp(ROMAN, "g")));
  }
  for (const m of s.matchAll(new RegExp(String.raw`,\s*(${ROMAN})(?=\s*[,;.)]|\s+d[oa]\s|\s+e\s|\s*$)`, "g"))) {
    if (!incisos.includes(m[1]!)) incisos.push(m[1]!);
  }
  for (const m of s.matchAll(/al[íi]neas?\s+["“]?([a-z])["”]?/gi)) alineas.push(m[1]!);
  return { paragrafos, incisos, alineas };
}

function sentenceBounds(text: string, pos: number): [number, number] {
  let s = pos;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1]!) ) s--;
  // recua sobre abreviações ("art.", "nº.", "Sr.") que não encerram frase
  while (s > 0 && /\b(?:arts?|n|nº|Sr|Sra|Ilmo|Ilma|Exmo|fls|p|inc)\.$/i.test(text.slice(Math.max(0, s - 6), s))) {
    s--;
    while (s > 0 && !/[.!?\n]/.test(text[s - 1]!)) s--;
  }
  let e = pos;
  while (e < text.length && !/[!?\n]/.test(text[e]!) && !(text[e] === "." && isSentenceEnd(text, e))) e++;
  return [s, e];
}

const ABBREV = /(?:^|[^A-Za-zÀ-ÿ])(?:arts?|n|nº|Sr|Sra|Ilmo|Ilma|Exmo|fls|p|inc|al)$/i;
function isSentenceEnd(text: string, dot: number): boolean {
  const before = text.slice(Math.max(0, dot - 8), dot);
  if (ABBREV.test(before)) return false;
  const next = text.slice(dot + 1, dot + 4);
  if (/^\d/.test(next)) return false; // 9.503, 1.025
  if (/^\s*[\da-zà-ÿ]/.test(next)) return false; // frase não começa com número ou minúscula
  return /^(\s|$)/.test(next);
}

export function extractCitations(text: string): Citation[] {
  const out: Citation[] = [];
  const normas = findNormas(text);
  const consumedNormas = new Set<number>();

  ART_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ART_RX.exec(text))) {
    const artStart = m.index;
    let artEnd = m.index + m[0].length;
    const artigos = listOf(m[1]!, new RegExp(ORD, "g")).map(cleanOrd);
    const [sStart, sEnd] = sentenceBounds(text, artStart);
    // partes antes ("§ 1º do art. ...")
    const before = text.slice(sStart, artStart);
    const pre = PRE_PART.exec(before);
    const start = pre ? sStart + pre.index : artStart;
    // partes depois (", § 1º, II")
    const post = POST_PART.exec(text.slice(artEnd, sEnd));
    if (post) artEnd += post[0].length;
    const parts = parseParts((pre?.[0] ?? "") + " " + (post?.[0] ?? ""));
    // norma: a primeira que aparece logo depois, antes de outro "art."; senão a última antes, na mesma frase
    const nextArt = (() => {
      const rx = new RegExp(ART_RX.source, "gi");
      rx.lastIndex = artEnd;
      const n = rx.exec(text);
      return n ? n.index : text.length;
    })();
    let hitIdx = normas.findIndex((n) => n.start >= artEnd && n.start <= Math.min(sEnd, nextArt) && n.start - artEnd <= 40);
    let end = artEnd;
    if (hitIdx >= 0) {
      end = normas[hitIdx]!.end;
    } else {
      for (let i = normas.length - 1; i >= 0; i--) {
        if (normas[i]!.end <= start && normas[i]!.start >= sStart) {
          hitIdx = i;
          break;
        }
      }
    }
    const hit = hitIdx >= 0 ? normas[hitIdx]! : null;
    if (hitIdx >= 0) consumedNormas.add(hitIdx);
    const c: Citation = {
      kind: "artigo",
      raw: text.slice(start, end),
      start,
      end,
      norma: hit?.id ?? null,
      artigos,
      ...parts,
      valid: false,
    };
    validate(c, hit);
    out.push(c);
  }

  // normas citadas sem artigo
  normas.forEach((n, i) => {
    if (consumedNormas.has(i)) return;
    const inside = out.some((c) => n.start >= c.start && n.end <= c.end);
    if (inside) return;
    out.push({
      kind: "norma",
      raw: n.raw,
      start: n.start,
      end: n.end,
      norma: n.id,
      artigos: [],
      paragrafos: [],
      incisos: [],
      alineas: [],
      valid: n.id !== null,
      reason: n.reason,
    });
  });

  // "§ 2º" ou "inciso III" soltos, sem artigo
  const LOOSE = new RegExp(String.raw`§§?\s*${ORD}|\bincisos?\s+${ROMAN}\b|\bal[íi]neas?\s+["“]?[a-z]["”]?(?=[\s,.;])`, "gi");
  for (const l of text.matchAll(LOOSE)) {
    const pos = l.index ?? 0;
    if (out.some((c) => pos >= c.start && pos < c.end)) continue;
    out.push({
      kind: "paragrafo_solto",
      raw: l[0],
      start: pos,
      end: pos + l[0].length,
      norma: null,
      artigos: [],
      paragrafos: [],
      incisos: [],
      alineas: [],
      valid: false,
      reason: "dispositivo citado sem indicar artigo e norma",
    });
  }

  JURIS.lastIndex = 0;
  let j: RegExpExecArray | null;
  while ((j = JURIS.exec(text))) {
    out.push({
      kind: "jurisprudencia",
      raw: j[0],
      start: j.index,
      end: j.index + j[0].length,
      norma: null,
      artigos: [],
      paragrafos: [],
      incisos: [],
      alineas: [],
      valid: false,
      reason: "jurisprudência não é permitida no MVP",
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

function validate(c: Citation, hit: NormaHit | null): void {
  if (!hit) {
    c.reason = "artigo citado sem indicar a norma";
    return;
  }
  if (!hit.id) {
    c.reason = hit.reason ?? "norma fora da base";
    return;
  }
  for (const art of c.artigos) {
    const ex = findExcerpt(hit.id, art);
    if (!ex) {
      c.reason = `art. ${art} da norma ${hit.id} não está na base`;
      return;
    }
    if (c.artigos.length === 1) {
      const paragrafos = c.paragrafos.length ? c.paragrafos : [undefined];
      for (const p of paragrafos) {
        if (p && !unitExists(ex, { paragrafo: p })) {
          c.reason = `§ ${p} do art. ${art} (${hit.id}) não existe na base`;
          return;
        }
        for (const inc of c.incisos) {
          if (!unitExists(ex, { paragrafo: p, inciso: inc }) && !unitExists(ex, { inciso: inc })) {
            c.reason = `inciso ${inc} do art. ${art} (${hit.id}) não existe na base`;
            return;
          }
        }
      }
    }
  }
  c.valid = true;
}

export interface ValidationResult {
  ok: boolean;
  citations: Citation[];
  invalid: Citation[];
}

export function validateText(text: string): ValidationResult {
  const citations = extractCitations(text);
  const invalid = citations.filter((c) => !c.valid);
  return { ok: invalid.length === 0, citations, invalid };
}

/** Divide em frases sem quebrar abreviações como "art." e números como "9.503". */
export function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i]!;
    if ((ch === "." || ch === "!" || ch === "?") && (ch !== "." || isSentenceEnd(paragraph, i))) {
      const next = paragraph.slice(i + 1).match(/^\s*(\S)/);
      if (!next || /[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“(]/.test(next[1]!)) {
        out.push(paragraph.slice(last, i + 1).trim());
        last = i + 1;
      }
    }
  }
  const rest = paragraph.slice(last).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export interface SanitizeResult {
  text: string;
  removed: { sentence: string; citations: Citation[] }[];
}

/** Remove as frases que contêm citação inválida ou jurisprudência. */
export function removeInvalidCitations(text: string): SanitizeResult {
  const removed: SanitizeResult["removed"] = [];
  const paragraphs = text.split("\n").map((p) => {
    const kept: string[] = [];
    for (const s of splitSentences(p)) {
      const v = validateText(s);
      if (v.ok) kept.push(s);
      else removed.push({ sentence: s, citations: v.invalid });
    }
    return kept.join(" ");
  });
  return { text: paragraphs.filter((p) => p.trim()).join("\n"), removed };
}
