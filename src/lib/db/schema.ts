/**
 * Schema Postgres (Drizzle). Pronto para Supabase ou qualquer Postgres via DATABASE_URL.
 *
 * Na versão de teste, clientes/lotes/produtos/classificacoes ficam no navegador do contador
 * (IndexedDB, mesmo formato, ver src/lib/local/db.ts) e só cache_ia usa o servidor.
 * Ver PROGRESSO.md, decisão "Persistência".
 */
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  razaoSocial: text("razao_social").notNull(),
  cnpj: text("cnpj").notNull().unique(),
  segmento: text("segmento").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const lotes = pgTable(
  "lotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    origem: text("origem").notNull(), // xml | planilha
    arquivos: integer("arquivos").notNull().default(0),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    classificadoEm: timestamp("classificado_em", { withTimezone: true }),
  },
  (t) => [index("lotes_cliente_idx").on(t.clienteId)],
);

export const produtos = pgTable(
  "produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loteId: uuid("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    descricao: text("descricao").notNull(),
    ncm: text("ncm").notNull(),
    cest: text("cest"),
    cfop: text("cfop"),
    ean: text("ean"),
    unidade: text("unidade"),
    ocorrencias: integer("ocorrencias").notNull().default(1),
  },
  (t) => [index("produtos_lote_idx").on(t.loteId)],
);

export const classificacoes = pgTable("classificacoes", {
  produtoId: uuid("produto_id")
    .primaryKey()
    .references(() => produtos.id, { onDelete: "cascade" }),
  tratamento: text("tratamento").notNull(),
  cst: text("cst").notNull(),
  cClassTrib: text("c_class_trib").notNull(),
  confianca: text("confianca").notNull(),
  justificativa: text("justificativa").notNull(),
  fonte: text("fonte").notNull(),
  status: text("status").notNull(),
  origem: text("origem").notNull(),
  ncmSugerido: text("ncm_sugerido"),
  alertas: jsonb("alertas").$type<string[]>().notNull().default([]),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const cacheIa = pgTable(
  "cache_ia",
  {
    chave: text("chave").notNull(),
    modelo: text("modelo").notNull(),
    resposta: jsonb("resposta").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chave, t.modelo] })],
);
