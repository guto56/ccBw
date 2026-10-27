import "server-only";
import { createHash } from "node:crypto";
import type { RespostaIA } from "./tipos";

export interface CacheIA {
  ler(chaves: string[], modelo: string): Promise<Map<string, RespostaIA>>;
  gravar(itens: { chave: string; resposta: RespostaIA }[], modelo: string): Promise<void>;
}

export function chaveCache(tipo: string, ncm: string, descricaoNormalizada: string, extra = ""): string {
  return createHash("sha256").update(`${tipo}|${ncm}|${descricaoNormalizada}|${extra}`).digest("hex");
}

/** Cache em memória do processo: usado quando não há DATABASE_URL. */
export function cacheMemoria(limite = 20_000): CacheIA {
  const m = new Map<string, RespostaIA>();
  return {
    async ler(chaves, modelo) {
      const out = new Map<string, RespostaIA>();
      for (const c of chaves) {
        const v = m.get(`${modelo}:${c}`);
        if (v) out.set(c, v);
      }
      return out;
    },
    async gravar(itens, modelo) {
      for (const { chave, resposta } of itens) {
        if (m.size >= limite) m.delete(m.keys().next().value as string);
        m.set(`${modelo}:${chave}`, resposta);
      }
    },
  };
}

/** Cache na tabela cache_ia (Postgres/Supabase). */
export function cachePostgres(url: string): CacheIA {
  let sqlPromise: Promise<import("postgres").Sql> | null = null;
  const sql = () =>
    (sqlPromise ??= import("postgres").then(async ({ default: postgres }) => {
      const s = postgres(url, { max: 3, prepare: false, idle_timeout: 20 });
      await s`create table if not exists cache_ia (
        chave text not null, modelo text not null, resposta jsonb not null,
        criado_em timestamptz not null default now(), primary key (chave, modelo))`;
      return s;
    }));
  return {
    async ler(chaves, modelo) {
      const out = new Map<string, RespostaIA>();
      if (!chaves.length) return out;
      try {
        const s = await sql();
        const linhas = await s<{ chave: string; resposta: RespostaIA }[]>`
          select chave, resposta from cache_ia where modelo = ${modelo} and chave = any(${chaves})`;
        for (const l of linhas) out.set(l.chave, l.resposta);
      } catch (e) {
        console.error("[cache_ia] leitura falhou:", (e as Error).message);
      }
      return out;
    },
    async gravar(itens, modelo) {
      if (!itens.length) return;
      try {
        const s = await sql();
        const linhas = itens.map((i) => ({ chave: i.chave, modelo, resposta: s.json(i.resposta as never) }));
        await s`insert into cache_ia ${s(linhas, "chave", "modelo", "resposta")} on conflict (chave, modelo) do nothing`;
      } catch (e) {
        console.error("[cache_ia] gravação falhou:", (e as Error).message);
      }
    },
  };
}

let instancia: CacheIA | null = null;
export function cachePadrao(): CacheIA {
  return (instancia ??= process.env.DATABASE_URL ? cachePostgres(process.env.DATABASE_URL) : cacheMemoria());
}
