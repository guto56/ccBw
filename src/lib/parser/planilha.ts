import { normalizar } from "@/lib/fiscal/texto";

export type CampoPlanilha = "codigo" | "descricao" | "ncm" | "cest" | "ean" | "unidade";

export const CAMPOS_PLANILHA: { campo: CampoPlanilha; rotulo: string; obrigatorio: boolean }[] = [
  { campo: "codigo", rotulo: "Código do produto", obrigatorio: true },
  { campo: "descricao", rotulo: "Descrição", obrigatorio: true },
  { campo: "ncm", rotulo: "NCM", obrigatorio: true },
  { campo: "cest", rotulo: "CEST", obrigatorio: false },
  { campo: "ean", rotulo: "EAN / GTIN", obrigatorio: false },
  { campo: "unidade", rotulo: "Unidade", obrigatorio: false },
];

const PISTAS: Record<CampoPlanilha, RegExp> = {
  codigo: /^(cod|codigo|cod produto|codigo do produto|codigo interno|sku|cprod|referencia|ref|id)$/,
  descricao: /(descri|^nome|^produto$|xprod|^item$)/,
  ncm: /(ncm|classificacao fiscal|class fiscal|nbm)/,
  cest: /cest/,
  ean: /(ean|gtin|barra)/,
  unidade: /^(un|und|unid|unidade|ucom|medida|um)$/,
};

export function adivinharMapeamento(cabecalho: string[]): Partial<Record<CampoPlanilha, number>> {
  const m: Partial<Record<CampoPlanilha, number>> = {};
  const usados = new Set<number>();
  for (const { campo } of CAMPOS_PLANILHA) {
    const i = cabecalho.findIndex((c, idx) => !usados.has(idx) && PISTAS[campo].test(normalizar(c)));
    if (i >= 0) {
      m[campo] = i;
      usados.add(i);
    }
  }
  if (m.codigo === undefined) {
    const i = cabecalho.findIndex((c, idx) => !usados.has(idx) && /cod/.test(normalizar(c)));
    if (i >= 0) m.codigo = i;
  }
  return m;
}

/** CSV com detecção de separador (; , tab) e aspas. */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", ",", "\t"].map((s) => [s, primeira.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas.map((l) => l.map((x) => x.trim()));
}

/** Decodifica bytes de planilha: UTF-8, ou Windows-1252 se aparecerem caracteres inválidos. */
export function decodificarTexto(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(bytes);
}

/** NCM vindo de planilha: tira pontos; célula numérica que perdeu o zero à esquerda volta a ter 8 dígitos. */
export function ncmDePlanilha(v: string): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 7 ? `0${d}` : d;
}
