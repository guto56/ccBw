import type { ProdutoEntrada } from "@/lib/fiscal/tipos";

/** Seis produtos reais de mercado usados na demonstração da página inicial. */
export const ITENS_DEMO: ProdutoEntrada[] = [
  { id: "d1", codigo: "000184", descricao: "ARROZ TIPO 1 TIO JOAO 5KG", ncm: "10063021", ean: "7893500018230", unidade: "UN" },
  { id: "d2", codigo: "000231", descricao: "OLEO DE SOJA SOYA 900ML", ncm: "15079011", ean: "7891080000058", unidade: "UN" },
  { id: "d3", codigo: "000317", descricao: "SABONETE LUX BOTANICALS 85G", ncm: "34011190", ean: "7891150064934", unidade: "UN" },
  { id: "d4", codigo: "000402", descricao: "REFRIGERANTE COCA COLA 2L", ncm: "22021000", ean: "7894900011517", unidade: "UN" },
  { id: "d5", codigo: "000455", descricao: "RACAO PEDIGREE ADULTO 1KG", ncm: "23091000", ean: "7896029012742", unidade: "UN" },
  { id: "d6", codigo: "000518", descricao: "BISCOITO DE POLVILHO 100G", ncm: "1905", ean: "", unidade: "UN" },
];
