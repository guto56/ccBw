"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Classificacao, type Produto } from "./db";
import type { Status, Tratamento } from "@/lib/fiscal/tipos";

export function useClientes() {
  return useLiveQuery(() => db.clientes.orderBy("razaoSocial").toArray(), []);
}

export function useCliente(id: string | undefined) {
  return useLiveQuery(() => (id ? db.clientes.get(id) : undefined), [id]);
}

export function useLotesDoCliente(clienteId: string | undefined) {
  return useLiveQuery(
    () => (clienteId ? db.lotes.where("clienteId").equals(clienteId).reverse().sortBy("criadoEm") : []),
    [clienteId],
  );
}

export function useLote(id: string | undefined) {
  return useLiveQuery(() => (id ? db.lotes.get(id) : undefined), [id]);
}

export interface LinhaLote {
  produto: Produto;
  classificacao: Classificacao | undefined;
}

export function useLinhasDoLote(loteId: string | undefined) {
  return useLiveQuery(async () => {
    if (!loteId) return [];
    const [produtos, cls] = await Promise.all([
      db.produtos.where("[loteId+ordem]").between([loteId, -Infinity], [loteId, Infinity]).toArray(),
      db.classificacoes.where("loteId").equals(loteId).toArray(),
    ]);
    const porId = new Map(cls.map((c) => [c.produtoId, c]));
    return produtos.map((p) => ({ produto: p, classificacao: porId.get(p.id) }));
  }, [loteId]);
}

export type Contagens = Record<Tratamento | "revisar" | "ncm_invalido" | "aprovado" | "sugerido" | "total", number>;

export function contar(linhas: LinhaLote[]): Contagens {
  const c: Contagens = { integral: 0, reducao60: 0, zero: 0, outro: 0, revisar: 0, ncm_invalido: 0, aprovado: 0, sugerido: 0, total: linhas.length };
  for (const { classificacao: k } of linhas) {
    if (!k) continue;
    const st: Status = k.status;
    c[st]++;
    if (st !== "ncm_invalido") c[k.tratamento]++;
  }
  return c;
}
