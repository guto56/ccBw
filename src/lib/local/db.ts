"use client";

import Dexie, { type EntityTable } from "dexie";
import type { Segmento, Sugestao } from "@/lib/fiscal/tipos";

/**
 * Banco local do contador (IndexedDB). Mesmo formato das tabelas Postgres em src/lib/db/schema.ts.
 * Os dados dos clientes ficam neste computador; o servidor só vê a lista de produtos na hora de
 * classificar.
 */
export interface Cliente {
  id: string;
  razaoSocial: string;
  cnpj: string;
  segmento: Segmento;
  criadoEm: number;
}

export interface Lote {
  id: string;
  clienteId: string;
  nome: string;
  origem: "xml" | "planilha";
  arquivos: number;
  notas: number;
  criadoEm: number;
  classificadoEm: number | null;
  situacao: "lido" | "classificando" | "classificado";
}

export interface Produto {
  id: string;
  loteId: string;
  ordem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cest: string;
  cfop: string;
  ean: string;
  unidade: string;
  ocorrencias: number;
}

export interface Classificacao extends Sugestao {
  produtoId: string;
  loteId: string;
  /** NCM final escolhido pelo contador (quando editou). */
  ncmFinal?: string;
  atualizadoEm: number;
}

export const db = new Dexie("carimbo") as Dexie & {
  clientes: EntityTable<Cliente, "id">;
  lotes: EntityTable<Lote, "id">;
  produtos: EntityTable<Produto, "id">;
  classificacoes: EntityTable<Classificacao, "produtoId">;
};

db.version(1).stores({
  clientes: "id, cnpj, razaoSocial, criadoEm",
  lotes: "id, clienteId, criadoEm",
  produtos: "id, loteId, [loteId+ordem]",
  classificacoes: "produtoId, loteId, status",
});

export const novoId = () => crypto.randomUUID();
