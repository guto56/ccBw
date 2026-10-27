"use client";

import { useSyncExternalStore } from "react";
import { NumeroAnimado } from "@/components/ui/numero-animado";
import { IconeAlerta, IconeErro } from "@/components/ui/icones";
import { useFaixa, type Filtro } from "./contexto-faixa";

const PRAZO = Date.UTC(2027, 0, 1, 3); // 01/01/2027 00:00 em Brasília

export function diasAte2027(agora: number): number {
  return Math.max(0, Math.ceil((PRAZO - agora) / 86_400_000));
}

const semAssinatura = () => () => {};

/** Dias até a virada, calculado só no navegador (o valor muda a cada dia). */
function useDias(): number | null {
  return useSyncExternalStore(semAssinatura, () => diasAte2027(Date.now()), () => null);
}

const ITENS: { filtro: Filtro; rotulo: string; chave: "integral" | "reducao60" | "zero" | "revisar" | "ncm_invalido"; cor: string }[] = [
  { filtro: "integral", rotulo: "Integral", chave: "integral", cor: "text-grafite" },
  { filtro: "reducao60", rotulo: "Redução 60%", chave: "reducao60", cor: "text-ok" },
  { filtro: "zero", rotulo: "Alíquota zero", chave: "zero", cor: "text-ok" },
  { filtro: "revisar", rotulo: "Revisar", chave: "revisar", cor: "text-revisar-texto" },
  { filtro: "ncm_invalido", rotulo: "NCM inválido", chave: "ncm_invalido", cor: "text-erro" },
];

export function FaixaTopo() {
  const { resumo, filtro, setFiltro } = useFaixa();
  const dias = useDias();
  return (
    <div className="sticky top-0 z-20 border-b border-linha bg-papel/95 backdrop-blur-[2px]">
      <div className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 md:px-6">
        <p className="text-tabela text-grafite-2">
          <span className="numeros text-titulo-3 font-bold text-grafite">{dias ?? "—"}</span> dias até{" "}
          <span className="codigo text-grafite">01/01/2027</span>
        </p>
        {resumo ? (
          <nav aria-label="Resumo do lote e filtros" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
            <span className="mr-2 hidden max-w-56 truncate text-tabela text-grafite-2 lg:inline" title={`${resumo.cliente} · ${resumo.nome}`}>
              {resumo.nome}
            </span>
            {ITENS.map((i) => {
              const ativo = filtro === i.filtro;
              const n = resumo.contagens[i.chave];
              return (
                <button
                  key={i.filtro}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setFiltro(ativo ? "todos" : i.filtro)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-campo border px-2.5 text-tabela transition-colors ${
                    ativo ? "border-caneta bg-caneta-suave text-grafite" : "border-transparent text-grafite-2 hover:border-linha"
                  }`}
                >
                  {i.chave === "revisar" && <IconeAlerta tamanho={13} className="text-revisar-texto" />}
                  {i.chave === "ncm_invalido" && <IconeErro tamanho={13} className="text-erro" />}
                  <span>{i.rotulo}</span>
                  <NumeroAnimado valor={n} className={`font-bold ${n ? i.cor : "text-grafite-3"}`} />
                </button>
              );
            })}
            {filtro !== "todos" && (
              <button type="button" onClick={() => setFiltro("todos")} className="ml-1 h-9 px-2 text-tabela text-caneta underline">
                Limpar filtro
              </button>
            )}
          </nav>
        ) : (
          <p className="text-tabela text-grafite-3">Abra um lote para ver o resumo da classificação.</p>
        )}
      </div>
    </div>
  );
}
