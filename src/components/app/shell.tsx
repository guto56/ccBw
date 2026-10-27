"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Marca } from "@/components/ui/marca";
import { ToggleTema } from "@/components/ui/toggle-tema";
import { IconeBusca, IconeMais, IconePasta, IconeSair } from "@/components/ui/icones";
import { useClientes } from "@/lib/local/consultas";
import { formatarCnpj, normalizar } from "@/lib/fiscal/texto";
import { FaixaTopo } from "./faixa-topo";
import { ProvedorFaixa } from "./contexto-faixa";

function ListaClientes({ aoNavegar }: { aoNavegar?: () => void }) {
  const clientes = useClientes();
  const [busca, setBusca] = useState("");
  const pathname = usePathname();
  const filtrados = useMemo(() => {
    const q = normalizar(busca);
    const d = busca.replace(/\D/g, "");
    return (clientes ?? []).filter((c) => !q || normalizar(c.razaoSocial).includes(q) || (d.length >= 3 && c.cnpj.includes(d)));
  }, [clientes, busca]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Buscar cliente por nome ou CNPJ</span>
          <IconeBusca className="absolute top-1/2 left-2.5 -translate-y-1/2 text-grafite-3" tamanho={14} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente"
            className="h-9 w-full rounded-campo border border-linha bg-superficie pr-2 pl-8 text-tabela text-grafite outline-none placeholder:text-grafite-3 focus:border-caneta"
          />
        </label>
      </div>
      <nav aria-label="Clientes" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {clientes === undefined ? (
          <p className="px-2 py-2 text-tabela text-grafite-3">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="px-2 py-2 text-tabela text-grafite-2">{busca ? "Nenhum cliente com esse nome ou CNPJ." : "Nenhum cliente ainda."}</p>
        ) : (
          <ul className="space-y-px">
            {filtrados.map((c) => {
              const ativo = pathname?.startsWith(`/app/clientes/${c.id}`);
              return (
                <li key={c.id}>
                  <Link
                    href={`/app/clientes/${c.id}`}
                    onClick={aoNavegar}
                    aria-current={ativo ? "page" : undefined}
                    className={`group flex items-start gap-2 rounded-campo px-2 py-1.5 ${ativo ? "bg-superficie shadow-[inset_0_0_0_1px_var(--linha)]" : "hover:bg-superficie/70"}`}
                  >
                    <IconePasta tamanho={15} className={`mt-0.5 shrink-0 ${ativo ? "text-caneta" : "text-grafite-3"}`} />
                    <span className="min-w-0">
                      <span className={`block truncate text-tabela ${ativo ? "font-medium text-grafite" : "text-grafite"}`}>{c.razaoSocial}</span>
                      <span className="codigo block text-rotulo text-grafite-3">{formatarCnpj(c.cnpj)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  async function sair() {
    await fetch("/api/sair", { method: "POST" });
    router.replace("/entrar");
  }

  const rodape = (
    <div className="flex items-center justify-between border-t border-linha px-3 py-2">
      <ToggleTema />
      <button type="button" onClick={sair} className="inline-flex h-9 items-center gap-1.5 rounded-campo px-2 text-tabela text-grafite-2 hover:text-grafite">
        <IconeSair tamanho={14} />
        Sair
      </button>
    </div>
  );

  return (
    <ProvedorFaixa>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-linha bg-papel-2 md:flex">
          <div className="flex h-14 items-center px-4">
            <Link href="/app" aria-label="Carimbo, início do app">
              <Marca tamanho={24} />
            </Link>
          </div>
          <div className="px-3 pb-3">
            <Link
              href="/app/clientes/novo"
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-campo border border-linha-forte bg-superficie text-tabela font-medium text-grafite hover:border-caneta hover:text-caneta"
            >
              <IconeMais tamanho={14} />
              Novo cliente
            </Link>
          </div>
          <ListaClientes />
          {rodape}
        </aside>

        {aberto && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Clientes">
            <button type="button" aria-label="Fechar lista de clientes" className="absolute inset-0 bg-grafite/30" onClick={() => setAberto(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-papel-2 shadow-folha">
              <div className="flex h-14 items-center justify-between px-4">
                <Marca tamanho={22} />
                <button type="button" onClick={() => setAberto(false)} className="h-9 px-2 text-tabela text-caneta">
                  Fechar
                </button>
              </div>
              <div className="px-3 pb-3">
                <Link href="/app/clientes/novo" onClick={() => setAberto(false)} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-campo border border-linha-forte bg-superficie text-tabela font-medium">
                  <IconeMais tamanho={14} />
                  Novo cliente
                </Link>
              </div>
              <ListaClientes aoNavegar={() => setAberto(false)} />
              {rodape}
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center justify-between border-b border-linha px-4 md:hidden">
            <Link href="/app" aria-label="Carimbo, início do app">
              <Marca tamanho={22} />
            </Link>
            <button type="button" onClick={() => setAberto(true)} className="inline-flex h-9 items-center gap-1.5 rounded-campo border border-linha px-2.5 text-tabela">
              <IconePasta tamanho={14} />
              Clientes
            </button>
          </div>
          <FaixaTopo />
          <main id="conteudo" className="min-w-0 flex-1">
            {children}
          </main>
          <footer className="border-t border-linha px-4 py-3 text-mini text-grafite-2 md:px-6">
            Sugestões para revisão do contador responsável. O Carimbo não substitui a análise profissional.{" "}
            <Link href="/termos" className="text-caneta underline">
              Termos
            </Link>
          </footer>
        </div>
      </div>
    </ProvedorFaixa>
  );
}
