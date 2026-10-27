/** Utilidades de texto puras, usadas no motor, no parser e na interface. */

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sem acento, sem pontuação, espaços simples. */
export function normalizar(s: string): string {
  return semAcento(s)
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PARADAS = new Set(
  (
    "a o as os de da do das dos e em no na nos nas para p c com sem por um uma ou que se sua seu suas seus " +
    "ao aos a classificado classificados classificada classificadas codigo codigos subposicao subposicoes posicao posicoes " +
    "ncm sh demais outros outras outro outra mesmo mesmos legislacao especifica conformidade requisitos relativos " +
    "comumente denominado denominada tipo kg g gr ml l lt un und cx pct pc fd tp unid emb " +
    "vegetal vegetais animal animais natural naturais origem produto produtos demais residuos preparacoes"
  ).split(" "),
);

/** Radical grosseiro: 4 primeiros caracteres de cada palavra significativa. */
export function radicais(s: string): Set<string> {
  const out = new Set<string>();
  for (const p of normalizar(s).split(" ")) {
    if (p.length < 3 || PARADAS.has(p) || /^\d/.test(p)) continue;
    out.add(p.slice(0, 4));
  }
  return out;
}

export function temAlgum(descNorm: string, termos: readonly string[]): string | null {
  const palavras = ` ${descNorm} `;
  for (const t of termos) {
    if (palavras.includes(` ${t} `) || (t.endsWith("*") && palavras.includes(` ${t.slice(0, -1)}`))) return t.replace("*", "");
  }
  return null;
}

export function formatarNcm(ncm: string): string {
  const d = ncm.replace(/\D/g, "");
  if (d.length !== 8) return ncm;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}

export function apenasDigitos(s: string | undefined | null): string {
  return (s ?? "").replace(/\D/g, "");
}

/** CNPJ: valida dígitos verificadores. */
export function cnpjValido(cnpj: string): boolean {
  const d = apenasDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, c, i) => s + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(cnpj: string): string {
  const d = apenasDigitos(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
