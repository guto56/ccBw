"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFaixa } from "@/components/app/contexto-faixa";
import { TabelaRevisao } from "@/components/app/tabela-revisao";
import { Botao } from "@/components/ui/botao";
import { IconeBaixar, IconeErro } from "@/components/ui/icones";
import { contar, useCliente, useLinhasDoLote, useLote } from "@/lib/local/consultas";
import { classificarLoteLocal, ErroSessao } from "@/lib/local/classificacao";
import { formatarCnpj } from "@/lib/fiscal/texto";

function PaginaLote() {
  const { id } = useParams<{ id: string }>();
  const busca = useSearchParams();
  const router = useRouter();
  const lote = useLote(id);
  const cliente = useCliente(lote?.clienteId);
  const linhas = useLinhasDoLote(id);
  const { setResumo, setFiltro } = useFaixa();
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const iniciou = useRef(false);

  const contagens = useMemo(() => contar(linhas ?? []), [linhas]);

  useEffect(() => {
    if (lote && cliente) setResumo({ loteId: lote.id, nome: lote.nome, cliente: cliente.razaoSocial, contagens });
  }, [lote, cliente, contagens, setResumo]);

  useEffect(
    () => () => {
      setResumo(null);
      setFiltro("todos");
    },
    [setResumo, setFiltro],
  );

  const classificar = useCallback(async () => {
    if (!lote || !cliente) return;
    setErro(null);
    try {
      await classificarLoteLocal(lote.id, cliente.segmento, (feitos, total) => setProgresso({ feitos, total }));
      setProgresso(null);
      setImprimindo(true);
    } catch (e) {
      setProgresso(null);
      if (e instanceof ErroSessao) {
        router.push(`/entrar?para=${encodeURIComponent(`/app/lotes/${lote.id}`)}`);
        return;
      }
      setErro((e as Error).message || "A classificação falhou. Tente de novo.");
    }
  }, [lote, cliente, router]);

  useEffect(() => {
    if (iniciou.current || !lote || !cliente) return;
    if (busca.get("classificar") === "1" && lote.situacao === "lido") {
      iniciou.current = true;
      router.replace(`/app/lotes/${lote.id}`);
      queueMicrotask(classificar);
    }
  }, [lote, cliente, busca, classificar, router]);

  const terminarImpressao = useCallback(() => setImprimindo(false), []);

  async function baixar(tipo: "xlsx" | "csv" | "pdf") {
    if (!linhas || !cliente || !lote) return;
    setBaixando(tipo);
    try {
      if (tipo === "pdf") (await import("@/lib/exportar/pdf")).baixarPdf(linhas, cliente, lote);
      else await (await import("@/lib/exportar/planilha")).baixarPlanilha(tipo, linhas, cliente, lote);
    } catch {
      setErro("Não foi possível gerar o arquivo. Tente de novo.");
    } finally {
      setBaixando(null);
    }
  }

  if (lote === undefined || linhas === undefined) return <p className="px-6 py-8 text-grafite-2">Carregando o lote…</p>;
  if (lote === null || !lote) {
    return (
      <div className="px-6 py-8">
        <p className="font-medium">Lote não encontrado neste navegador.</p>
        <Link href="/app" className="text-caneta underline">
          Voltar aos clientes
        </Link>
      </div>
    );
  }

  const classificado = linhas.some((l) => l.classificacao);
  const emAndamento = progresso !== null || lote.situacao === "classificando";

  return (
    <div className="px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-titulo-2 font-bold break-words">{lote.nome}</h1>
          <p className="text-tabela text-grafite-2">
            {cliente ? (
              <Link href={`/app/clientes/${cliente.id}`} className="text-caneta hover:underline">
                {cliente.razaoSocial}
              </Link>
            ) : (
              "—"
            )}{" "}
            {cliente && <span className="codigo">{formatarCnpj(cliente.cnpj)}</span>} · {lote.origem === "xml" ? `${lote.notas} notas` : "planilha"} ·{" "}
            <span className="numeros">{linhas.length.toLocaleString("pt-BR")}</span> produtos únicos · {new Date(lote.criadoEm).toLocaleDateString("pt-BR")}
          </p>
        </div>
        {classificado && !emAndamento && (
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" tamanho="p" onClick={() => baixar("xlsx")} carregando={baixando === "xlsx"}>
              <IconeBaixar tamanho={14} />
              Baixar planilha
            </Botao>
            <Botao variante="secundario" tamanho="p" onClick={() => baixar("csv")} carregando={baixando === "csv"}>
              CSV
            </Botao>
            <Botao variante="secundario" tamanho="p" onClick={() => baixar("pdf")} carregando={baixando === "pdf"}>
              Relatório PDF
            </Botao>
          </div>
        )}
      </div>

      <p className="mt-2 text-mini text-grafite-2">Sugestões para revisão do contador responsável. Nada é aprovado sem a sua confirmação.</p>

      {erro && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-campo bg-erro-suave px-3 py-2 text-tabela">
          <IconeErro tamanho={15} className="mt-0.5 shrink-0 text-erro" />
          {erro}
        </p>
      )}

      {!classificado && !emAndamento && (
        <div className="mt-6 max-w-xl rounded-campo border border-linha bg-superficie px-5 py-5">
          <h2 className="text-titulo-3 font-bold">Pronto para classificar</h2>
          <p className="mt-1 text-grafite-2">
            {linhas.length.toLocaleString("pt-BR")} produtos. Primeiro entram as regras da LC 214/2025 e das tabelas oficiais; a IA só é chamada para NCM inválido, condição de anexo ambígua ou descrição vaga.
          </p>
          <Botao className="mt-4" onClick={classificar}>
            Classificar produtos
          </Botao>
        </div>
      )}

      {emAndamento && (
        <div className="mt-6 max-w-xl" aria-live="polite">
          <p className="font-medium">
            Classificando{progresso ? ` ${progresso.feitos.toLocaleString("pt-BR")} de ${progresso.total.toLocaleString("pt-BR")}` : ""}…
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-faixa" role="progressbar" aria-valuemin={0} aria-valuemax={progresso?.total ?? 1} aria-valuenow={progresso?.feitos ?? 0} aria-label="Progresso da classificação">
            <div className="h-full bg-caneta transition-[width] duration-300" style={{ width: progresso && progresso.total ? `${(progresso.feitos / progresso.total) * 100}%` : "4%" }} />
          </div>
          <p className="mt-2 text-tabela text-grafite-2">Itens ambíguos vão para a IA em lotes; isso pode levar alguns segundos.</p>
        </div>
      )}

      {classificado && cliente && !emAndamento && (
        <div className="mt-4">
          <TabelaRevisao linhas={linhas} cliente={cliente} animarImpressao={imprimindo} aoTerminarImpressao={terminarImpressao} />
        </div>
      )}
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-grafite-2">Carregando o lote…</p>}>
      <PaginaLote />
    </Suspense>
  );
}
