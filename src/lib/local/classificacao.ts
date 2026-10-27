"use client";

import { db, type Classificacao, type Produto } from "./db";
import type { ProdutoEntrada, Segmento, Sugestao } from "@/lib/fiscal/tipos";

const TAMANHO_LOTE = 400;

export class ErroSessao extends Error {}

function entrada(p: Produto, ncm?: string): ProdutoEntrada {
  return {
    id: p.id,
    codigo: p.codigo.slice(0, 60),
    descricao: p.descricao.slice(0, 300),
    ncm: (ncm ?? p.ncm).slice(0, 20),
    cest: p.cest?.slice(0, 20) || undefined,
    cfop: p.cfop?.slice(0, 10) || undefined,
    ean: p.ean?.slice(0, 20) || undefined,
    unidade: p.unidade?.slice(0, 10) || undefined,
  };
}

async function chamar(produtos: ProdutoEntrada[], segmento: Segmento): Promise<{ id: string; sugestao: Sugestao }[]> {
  const r = await fetch("/api/classificar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segmento, produtos }),
  });
  if (r.status === 401) throw new ErroSessao("Sessão expirada. Entre de novo com a senha do escritório.");
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro ?? `O servidor recusou a classificação (HTTP ${r.status}). Tente de novo em instantes.`);
  }
  return (await r.json()).resultados;
}

/** Classifica todos os produtos de um lote em blocos e grava no IndexedDB. */
export async function classificarLoteLocal(loteId: string, segmento: Segmento, aoProgredir: (feitos: number, total: number) => void) {
  const produtos = await db.produtos.where("[loteId+ordem]").between([loteId, -Infinity], [loteId, Infinity]).toArray();
  await db.lotes.update(loteId, { situacao: "classificando" });
  let feitos = 0;
  aoProgredir(0, produtos.length);
  try {
    for (let i = 0; i < produtos.length; i += TAMANHO_LOTE) {
      const bloco = produtos.slice(i, i + TAMANHO_LOTE);
      const res = await chamar(
        bloco.map((p) => entrada(p)),
        segmento,
      );
      const agora = Date.now();
      const linhas: Classificacao[] = res.map((r) => ({ ...r.sugestao, produtoId: r.id, loteId, atualizadoEm: agora }));
      await db.classificacoes.bulkPut(linhas);
      feitos += bloco.length;
      aoProgredir(feitos, produtos.length);
    }
    await db.lotes.update(loteId, { situacao: "classificado", classificadoEm: Date.now() });
  } catch (e) {
    await db.lotes.update(loteId, { situacao: feitos ? "classificado" : "lido" });
    throw e;
  }
}

/** Reclassifica um produto com outro NCM (edição do contador). Não aprova. */
export async function reclassificarProduto(p: Produto, ncm: string, segmento: Segmento): Promise<Sugestao> {
  const [r] = await chamar([entrada(p, ncm)], segmento);
  return r.sugestao;
}
