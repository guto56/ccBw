"use client";

import { useEffect, useRef, useState } from "react";
import { Botao } from "@/components/ui/botao";
import { Furos } from "@/components/ui/furos";
import { IconeErro } from "@/components/ui/icones";
import { ITENS_DEMO } from "@/lib/demo/itens";
import { formatarNcm } from "@/lib/fiscal/texto";
import { ROTULO_TRATAMENTO, type Sugestao } from "@/lib/fiscal/tipos";

type Resultado = { id: string; sugestao: Sugestao };

const COR: Record<string, string> = { zero: "text-ok", reducao60: "text-ok", integral: "text-grafite", outro: "text-grafite-2" };

function reduzMovimento() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Trecho de DANFE com seis produtos. "Classificar" roda o motor de regras de verdade (/api/demo). */
export function DemoDanfe() {
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [preenchidos, setPreenchidos] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [selecionado, setSelecionado] = useState<string>("d1");
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function classificar() {
    setCarregando(true);
    setErro(null);
    setPreenchidos(0);
    try {
      const r = await fetch("/api/demo", { method: "POST" });
      const j = (await r.json()) as { resultados: Resultado[] };
      setResultados(j.resultados);
      if (reduzMovimento()) setPreenchidos(j.resultados.length);
      else {
        let n = 0;
        timer.current = setInterval(() => {
          n++;
          setPreenchidos(n);
          if (n >= j.resultados.length && timer.current) clearInterval(timer.current);
        }, 150);
      }
    } catch {
      setErro("Não consegui falar com o servidor agora. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const porId = new Map((resultados ?? []).map((r) => [r.id, r.sugestao]));
  const sel = porId.get(selecionado);
  const pronto = resultados && preenchidos >= resultados.length;
  const resumo = pronto
    ? (["zero", "reducao60", "integral"] as const)
        .map((t) => [t, resultados!.filter((r) => r.sugestao.tratamento === t && r.sugestao.status !== "ncm_invalido").length] as const)
        .filter(([, n]) => n)
        .map(([t, n]) => `${n} ${ROTULO_TRATAMENTO[t].toLowerCase()}`)
        .concat(resultados!.some((r) => r.sugestao.status === "ncm_invalido") ? [`${resultados!.filter((r) => r.sugestao.status === "ncm_invalido").length} NCM inválido`] : [])
        .join(" · ")
    : null;

  return (
    <div className="relative">
      <div className="flex rounded-campo border border-linha-forte bg-superficie shadow-folha">
        <Furos className="rounded-l-campo" deslizando={carregando} />
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[1fr_auto] border-b border-linha-forte">
            <div className="border-r border-linha px-3 pt-1 pb-2">
              <span className="text-rotulo text-grafite-3">Emitente</span>
              <p className="text-tabela font-medium">MERCADINHO BOA VISTA LTDA</p>
              <p className="codigo text-rotulo text-grafite-2">12.345.678/0001-95 · CRT 1 Simples Nacional</p>
            </div>
            <div className="px-3 pt-1 pb-2 text-right">
              <span className="text-rotulo text-grafite-3">NFC-e nº</span>
              <p className="codigo text-tabela">000.004.012</p>
              <p className="text-rotulo text-grafite-2">série 1</p>
            </div>
          </div>
          <p className="border-b border-linha px-3 py-1 text-rotulo text-grafite-3">Dados dos produtos</p>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-tabela sm:table-auto">
              <caption className="sr-only">Produtos da nota de demonstração e a classificação sugerida</caption>
              <thead>
                <tr className="h-8 border-b border-linha text-left text-rotulo text-grafite-3">
                  <th className="w-[46%] px-3 font-normal sm:w-auto">Descrição</th>
                  <th className="hidden px-2 font-normal sm:table-cell">NCM</th>
                  <th className="hidden px-2 font-normal sm:table-cell">CST</th>
                  <th className="px-2 font-normal">cClassTrib</th>
                  <th className="px-3 font-normal">Tratamento</th>
                </tr>
              </thead>
              <tbody>
                {ITENS_DEMO.map((p, i) => {
                  const s = i < preenchidos ? porId.get(p.id) : undefined;
                  const ativo = Boolean(pronto) && selecionado === p.id;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => pronto && setSelecionado(p.id)}
                      className={`h-11 sm:h-9 ${i % 2 === 0 ? "bg-faixa" : ""} ${pronto ? "cursor-pointer" : ""} ${ativo ? "shadow-[inset_0_0_0_2px_var(--caneta)]" : ""}`}
                    >
                      <td className="truncate px-3">
                        {pronto ? (
                          <button type="button" onClick={() => setSelecionado(p.id)} className="block w-full truncate text-left" aria-pressed={ativo}>
                            {p.descricao}
                          </button>
                        ) : (
                          p.descricao
                        )}
                        <span className="codigo block text-rotulo text-grafite-3 sm:hidden">NCM {p.ncm.length === 8 ? formatarNcm(p.ncm) : p.ncm}</span>
                      </td>
                      <td className="codigo hidden px-2 whitespace-nowrap sm:table-cell">{p.ncm.length === 8 ? formatarNcm(p.ncm) : p.ncm}</td>
                      <td className={`codigo hidden px-2 sm:table-cell ${s ? "imprimindo" : ""}`}>{s ? s.cst || "—" : <span className="text-linha-forte">···</span>}</td>
                      <td className={`codigo px-2 ${s ? "imprimindo" : ""}`}>{s ? s.cClassTrib || "—" : <span className="text-linha-forte">······</span>}</td>
                      <td className={`truncate px-3 sm:whitespace-nowrap ${s ? `imprimindo ${COR[s.tratamento]}` : ""}`}>
                        {s ? (
                          s.status === "ncm_invalido" ? (
                            <span className="inline-flex items-center gap-1 text-erro">
                              <IconeErro tamanho={13} />
                              NCM inválido
                            </span>
                          ) : (
                            ROTULO_TRATAMENTO[s.tratamento]
                          )
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-px border-t border-linha-forte p-2 sm:grid-cols-[3fr_2fr]">
            <div className="relative min-h-[4.5rem] rounded-campo border border-linha px-2.5 pt-4 pb-1.5">
              <span className="absolute top-1 left-2.5 text-rotulo text-grafite-3">Justificativa</span>
              <p className="text-tabela" aria-live="polite">
                {pronto && sel ? sel.justificativa : "Clique em Classificar para ver o motor preencher os códigos."}
              </p>
            </div>
            <div className="relative min-h-[4.5rem] rounded-campo border border-linha px-2.5 pt-4 pb-1.5">
              <span className="absolute top-1 left-2.5 text-rotulo text-grafite-3">Fonte</span>
              <p className="text-mini text-grafite-2">{pronto && sel ? sel.fonte : "LC 214/2025 e tabela oficial cClassTrib"}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Botao onClick={classificar} carregando={carregando} tamanho="m">
          {pronto ? "Classificar de novo" : "Classificar"}
        </Botao>
        <p className="text-tabela text-grafite-2" aria-live="polite">
          {erro ?? (resumo ? `${resumo}. Clique numa linha para ver o motivo.` : "Motor de regras real, sem IA, nos seis itens desta nota.")}
        </p>
      </div>
    </div>
  );
}
