import { XMLParser } from "fast-xml-parser";

/** Campos do produto que saem do XML. Destinatário, valores e impostos são ignorados. */
export interface ItemNota {
  cProd: string;
  cEAN: string;
  xProd: string;
  NCM: string;
  CEST: string;
  CFOP: string;
  uCom: string;
}

export type ResultadoXml =
  | { ok: true; modelo: "55" | "65"; chave: string; itens: ItemNota[] }
  | { ok: false; motivo: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false, // mantém zeros à esquerda (NCM 07133319)
  parseAttributeValue: false,
  trimValues: true,
  isArray: (nome) => nome === "det",
  processEntities: true,
  htmlEntities: true,
});

const txt = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? "" : String(v).trim());

export function lerXmlNfe(conteudo: string): ResultadoXml {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(conteudo);
  } catch {
    return { ok: false, motivo: "não é um XML válido" };
  }
  const raiz = (doc.nfeProc as Record<string, unknown> | undefined)?.NFe ?? doc.NFe;
  const inf = (raiz as Record<string, unknown> | undefined)?.infNFe as Record<string, unknown> | undefined;
  if (!inf) {
    if (doc.procEventoNFe || doc.evento) return { ok: false, motivo: "é um evento (cancelamento, carta de correção), não uma NF-e" };
    if (doc.cteProc || doc.CTe) return { ok: false, motivo: "é um CT-e, não uma NF-e" };
    if (doc.resNFe) return { ok: false, motivo: "é um resumo de NF-e sem os itens; baixe o XML completo" };
    return { ok: false, motivo: "não tem o grupo infNFe de uma NF-e/NFC-e" };
  }
  const versao = txt(inf["@versao"]);
  if (versao && versao !== "4.00") return { ok: false, motivo: `layout ${versao}; o Carimbo lê o layout 4.00` };
  const ide = (inf.ide ?? {}) as Record<string, unknown>;
  const modelo = txt(ide.mod);
  if (modelo !== "55" && modelo !== "65") return { ok: false, motivo: `modelo ${modelo || "ausente"}; só NF-e (55) e NFC-e (65)` };
  const det = (inf.det ?? []) as Record<string, unknown>[];
  const itens: ItemNota[] = [];
  for (const d of det) {
    const p = (d.prod ?? {}) as Record<string, unknown>;
    itens.push({
      cProd: txt(p.cProd),
      cEAN: txt(p.cEAN),
      xProd: txt(p.xProd),
      NCM: txt(p.NCM),
      CEST: txt(p.CEST),
      CFOP: txt(p.CFOP),
      uCom: txt(p.uCom),
    });
  }
  if (!itens.length) return { ok: false, motivo: "a nota não tem itens" };
  const chave = txt(inf["@Id"]).replace(/^NFe/, "");
  return { ok: true, modelo, chave, itens };
}

export interface ProdutoUnico {
  chave: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cest: string;
  cfop: string;
  ean: string;
  unidade: string;
  ocorrencias: number;
}

export function eanValido(ean: string): boolean {
  const d = ean.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) return false;
  const digitos = d.split("").map(Number);
  const dv = digitos.pop()!;
  const soma = digitos.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === dv;
}

/** Deduplica por EAN válido; sem EAN, por cProd + NCM. */
export function chaveProduto(codigo: string, ncm: string, ean: string): string {
  return eanValido(ean) ? `ean:${ean.replace(/\D/g, "")}` : `cod:${codigo.trim().toUpperCase()}|${ncm.replace(/\D/g, "")}`;
}

export class Deduplicador {
  private mapa = new Map<string, ProdutoUnico>();

  adicionar(p: Omit<ProdutoUnico, "chave" | "ocorrencias">) {
    const chave = chaveProduto(p.codigo, p.ncm, p.ean);
    const atual = this.mapa.get(chave);
    if (atual) {
      atual.ocorrencias++;
      if (!atual.ncm && p.ncm) atual.ncm = p.ncm;
      if (!atual.cest && p.cest) atual.cest = p.cest;
      return;
    }
    this.mapa.set(chave, { ...p, ean: eanValido(p.ean) ? p.ean.replace(/\D/g, "") : "", chave, ocorrencias: 1 });
  }

  adicionarItemNota(i: ItemNota) {
    this.adicionar({ codigo: i.cProd, descricao: i.xProd, ncm: i.NCM, cest: i.CEST, cfop: i.CFOP, ean: i.cEAN, unidade: i.uCom });
  }

  get produtos(): ProdutoUnico[] {
    return [...this.mapa.values()];
  }

  get tamanho() {
    return this.mapa.size;
  }
}
