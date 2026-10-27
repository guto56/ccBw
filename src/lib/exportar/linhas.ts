import type { LinhaLote } from "@/lib/local/consultas";
import type { Cliente, Lote } from "@/lib/local/db";
import { formatarCnpj, formatarNcm } from "@/lib/fiscal/texto";
import { ROTULO_CONFIANCA, ROTULO_STATUS, ROTULO_TRATAMENTO } from "@/lib/fiscal/tipos";
import versoes from "../../../data/fontes/versoes.json";

export const AVISO_RESPONSABILIDADE =
  "Sugestões para revisão do contador responsável. O Carimbo sugere o tratamento de IBS/CBS com base nas tabelas oficiais e na LC 214/2025; a decisão e a responsabilidade pela classificação são do contador.";

export const VERSOES_TEXTO = `Tabela NCM: ${versoes.ncm.versao} (${versoes.ncm.ato}). Tabela cClassTrib/CST: publicação de ${versoes.cclasstrib.publicacaoMaisRecente.split("-").reverse().join("/")}.`;

export const CABECALHO = ["Código", "Descrição", "NCM", "CEST", "Tratamento", "CST IBS/CBS", "cClassTrib", "Confiança", "Justificativa", "Fonte", "Status"] as const;

export function linhaExportacao({ produto: p, classificacao: c }: LinhaLote): string[] {
  const ncm = c?.ncmFinal ?? p.ncm;
  return [
    p.codigo,
    p.descricao,
    ncm ? formatarNcm(ncm) : "",
    p.cest,
    c && c.cClassTrib ? ROTULO_TRATAMENTO[c.tratamento] : "",
    c?.cst ?? "",
    c?.cClassTrib ?? "",
    c ? ROTULO_CONFIANCA[c.confianca] : "",
    c ? [c.justificativa, ...c.alertas].join(" ") : "Não classificado",
    c?.fonte ?? "",
    c ? ROTULO_STATUS[c.status] : "Não classificado",
  ];
}

export function nomeArquivo(cliente: Cliente, lote: Lote, ext: string) {
  const base = `carimbo-${cliente.razaoSocial}-${lote.nome}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base}.${ext}`;
}

export function cabecalhoCliente(cliente: Cliente, lote: Lote) {
  return [
    ["Cliente", cliente.razaoSocial],
    ["CNPJ", formatarCnpj(cliente.cnpj)],
    ["Lote", lote.nome],
    ["Gerado em", new Date().toLocaleString("pt-BR")],
    ["Fontes", VERSOES_TEXTO],
    ["Aviso", AVISO_RESPONSABILIDADE],
  ];
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
