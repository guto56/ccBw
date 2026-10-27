"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { CampoDanfe } from "@/components/ui/campo-danfe";
import { Furos } from "@/components/ui/furos";
import { IconeAlerta, IconeBusca, IconeLapis, IconeTeclado } from "@/components/ui/icones";
import { SeloStatus } from "@/components/ui/selo-status";
import { Visto } from "@/components/ui/visto";
import { db, type Classificacao, type Cliente } from "@/lib/local/db";
import type { LinhaLote } from "@/lib/local/consultas";
import { formatarNcm, normalizar } from "@/lib/fiscal/texto";
import { ROTULO_CONFIANCA, ROTULO_TRATAMENTO, type Tratamento } from "@/lib/fiscal/tipos";
import { useFaixa, type Filtro } from "./contexto-faixa";
import { PainelEdicao } from "./painel-edicao";

const ALTURA_LINHA = 36;

const COR_TRATAMENTO: Record<Tratamento, string> = {
  zero: "text-ok font-medium",
  reducao60: "text-ok font-medium",
  integral: "text-grafite",
  outro: "text-grafite-2",
};

const GRADE = "md:grid-cols-[minmax(0,1fr)_6.25rem_7.75rem_2.75rem_4.5rem_4rem_9.75rem]";

function passaFiltro(l: LinhaLote, f: Filtro): boolean {
  const c = l.classificacao;
  if (f === "todos") return true;
  if (!c) return false;
  if (f === "revisar" || f === "ncm_invalido" || f === "sugerido" || f === "aprovado") return c.status === f;
  return c.tratamento === f && c.status !== "ncm_invalido";
}

const descricoesNcm = new Map<string, Promise<string>>();
function descricaoNcm(ncm: string): Promise<string> {
  if (!descricoesNcm.has(ncm)) {
    descricoesNcm.set(
      ncm,
      fetch(`/api/ncm?codigo=${encodeURIComponent(ncm)}`)
        .then((r) => r.json())
        .then((j) => (j.ok ? j.descricao : j.motivo))
        .catch(() => "Não foi possível consultar a tabela NCM agora."),
    );
  }
  return descricoesNcm.get(ncm)!;
}

function DescricaoNcm({ ncm }: { ncm: string }) {
  const [t, setT] = useState<{ ncm: string; texto: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    if (ncm) descricaoNcm(ncm).then((d) => vivo && setT({ ncm, texto: d }));
    return () => {
      vivo = false;
    };
  }, [ncm]);
  if (!ncm) return <>NCM não informado.</>;
  return <>{t?.ncm === ncm ? t.texto : "Consultando…"}</>;
}

interface PropsLinha {
  linha: LinhaLote;
  indice: number;
  focada: boolean;
  expandida: boolean;
  editando: boolean;
  animarVisto: boolean;
  imprimir: { atraso: number } | null;
  cliente: Cliente;
  aoFocar: (i: number) => void;
  aoExpandir: (id: string) => void;
  aoAprovar: (l: LinhaLote) => void;
  aoRevisar: (l: LinhaLote) => void;
  aoEditar: (id: string | null) => void;
}

const Linha = memo(function Linha({ linha, indice, focada, expandida, editando, animarVisto, imprimir, cliente, aoFocar, aoExpandir, aoAprovar, aoRevisar, aoEditar }: PropsLinha) {
  const { produto: p, classificacao: c } = linha;
  const ncmMostrado = c?.ncmFinal ?? p.ncm;
  const idDetalhe = `detalhe-${p.id}`;
  return (
    <div
      role="row"
      data-indice={indice}
      tabIndex={focada ? 0 : -1}
      aria-selected={focada}
      aria-expanded={expandida}
      aria-controls={expandida ? idDetalhe : undefined}
      onFocus={() => aoFocar(indice)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        aoFocar(indice);
        aoExpandir(p.id);
      }}
      className={`relative cursor-default outline-none ${indice % 2 === 0 ? "bg-faixa" : ""} ${focada ? "shadow-[inset_0_0_0_2px_var(--caneta)]" : ""} ${
        imprimir ? "imprimindo" : ""
      }`}
      style={imprimir ? { animationDelay: `${imprimir.atraso}ms` } : undefined}
    >
      <div className={`grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1 md:py-0 ${GRADE}`}>
        <div role="gridcell" className="min-w-0">
          <span className="block truncate text-tabela text-grafite" title={p.descricao}>
            {p.descricao || <span className="text-grafite-3">Sem descrição</span>}
          </span>
          <span className="codigo block truncate text-rotulo text-grafite-3 md:hidden">
            NCM {ncmMostrado ? formatarNcm(ncmMostrado) : "—"} · {c ? `${c.cst || "—"} · ${c.cClassTrib || "—"}` : "—"}
          </span>
        </div>
        <div role="gridcell" className="codigo hidden text-tabela md:block">
          {ncmMostrado ? formatarNcm(ncmMostrado) : <span className="text-grafite-3">—</span>}
          {c?.ncmSugerido && c.ncmSugerido !== ncmMostrado && <span className="sr-only">, NCM sugerido {c.ncmSugerido}</span>}
        </div>
        <div role="gridcell" className={`hidden truncate text-tabela md:block ${c ? COR_TRATAMENTO[c.tratamento] : ""}`}>
          {c ? (c.status === "ncm_invalido" && !c.cClassTrib ? <span className="text-grafite-3">—</span> : ROTULO_TRATAMENTO[c.tratamento]) : <span className="text-grafite-3">…</span>}
        </div>
        <div role="gridcell" className="codigo hidden text-tabela md:block">
          {c?.cst || <span className="text-grafite-3">—</span>}
        </div>
        <div role="gridcell" className="codigo hidden text-tabela md:block">
          {c?.cClassTrib || <span className="text-grafite-3">—</span>}
        </div>
        <div role="gridcell" className={`hidden text-tabela md:block ${c?.confianca === "baixa" ? "text-revisar-texto" : "text-grafite-2"}`}>
          {c ? ROTULO_CONFIANCA[c.confianca] : ""}
        </div>
        <div role="gridcell" className="flex items-center justify-end gap-1">
          {c && (
            <>
              <span className="md:hidden">
                <SeloStatus status={c.status} animar={animarVisto} />
              </span>
              {c.status === "aprovado" ? (
                <span className="hidden md:inline">
                  <SeloStatus status="aprovado" animar={animarVisto} />
                </span>
              ) : (
                <>
                  <span className="hidden w-[6.25rem] md:inline">
                    <SeloStatus status={c.status} />
                  </span>
                  <button
                    type="button"
                    onClick={() => aoAprovar(linha)}
                    disabled={c.status === "ncm_invalido"}
                    title={c.status === "ncm_invalido" ? "Corrija o NCM antes de aprovar" : "Aprovar (a)"}
                    aria-label={`Aprovar ${p.descricao}`}
                    className="hidden h-7 w-7 items-center justify-center rounded-campo border border-linha-forte bg-superficie text-caneta hover:border-caneta disabled:opacity-35 md:inline-flex"
                  >
                    <Visto tamanho={14} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {expandida && c && (
        <div id={idDetalhe} role="gridcell" aria-colspan={7} className="block border-t border-linha bg-superficie px-3 pt-3 pb-4">
          {editando ? (
            <PainelEdicao linha={linha} cliente={cliente} aoFechar={() => aoEditar(null)} />
          ) : (
            <>
              <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
                <CampoDanfe rotulo="Justificativa" className="sm:col-span-2">
                  {c.justificativa}
                </CampoDanfe>
                <CampoDanfe rotulo="Fonte legal" className="sm:col-span-2">
                  {c.fonte}
                  {c.fonteUrl && (
                    <>
                      {" "}
                      <a href={c.fonteUrl} target="_blank" rel="noreferrer" className="text-caneta underline">
                        Ver na lei
                      </a>
                    </>
                  )}
                </CampoDanfe>
                <CampoDanfe rotulo="NCM na tabela vigente" className="sm:col-span-2">
                  <span className="codigo">{ncmMostrado ? formatarNcm(ncmMostrado) : "—"}</span> <DescricaoNcm ncm={ncmMostrado} />
                </CampoDanfe>
                <CampoDanfe rotulo="Código · EAN" codigo>
                  {p.codigo || "—"} · {p.ean || "sem GTIN"}
                </CampoDanfe>
                <CampoDanfe rotulo="CEST · unidade · notas">
                  <span className="codigo">{p.cest || "—"}</span> · {p.unidade || "—"} · {p.ocorrencias} {p.ocorrencias === 1 ? "ocorrência" : "ocorrências"}
                </CampoDanfe>
                <CampoDanfe rotulo="Redução IBS · CBS">
                  <span className="numeros">
                    {c.pRedIBS}% · {c.pRedCBS}%
                  </span>
                </CampoDanfe>
                <CampoDanfe rotulo="Decidido por">
                  {c.origem === "regra" ? "Regra determinística" : c.origem === "ia" ? "IA, aguardando o contador" : "Contador"}
                </CampoDanfe>
                {c.ncmSugerido && (
                  <CampoDanfe rotulo="NCM sugerido pela IA" codigo>
                    {formatarNcm(c.ncmSugerido)}
                  </CampoDanfe>
                )}
                <CampoDanfe rotulo="Confiança">{ROTULO_CONFIANCA[c.confianca]}</CampoDanfe>
              </div>
              {c.alertas.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.alertas.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-tabela text-grafite">
                      <IconeAlerta tamanho={13} className="mt-1 shrink-0 text-revisar-texto" />
                      <span className="medida">{a}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Botao tamanho="p" onClick={() => aoAprovar(linha)} disabled={c.status === "ncm_invalido" || c.status === "aprovado"}>
                  <Visto tamanho={14} className="text-sobre-caneta" />
                  {c.status === "aprovado" ? "Aprovado" : "Aprovar"}
                </Botao>
                <Botao tamanho="p" variante="secundario" onClick={() => aoEditar(p.id)}>
                  <IconeLapis tamanho={13} />
                  Editar
                </Botao>
                <Botao tamanho="p" variante="secundario" onClick={() => aoRevisar(linha)} disabled={c.status === "revisar"}>
                  <IconeAlerta tamanho={13} />
                  Marcar para revisar
                </Botao>
                {c.status === "ncm_invalido" && <p className="self-center text-tabela text-erro">Corrija o NCM em Editar para poder aprovar.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export function TabelaRevisao({
  linhas,
  cliente,
  animarImpressao,
  aoTerminarImpressao,
}: {
  linhas: LinhaLote[];
  cliente: Cliente;
  animarImpressao: boolean;
  aoTerminarImpressao: () => void;
}) {
  const { filtro, setFiltro } = useFaixa();
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState(0);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState("");
  const [mostrarAtalhos, setMostrarAtalhos] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);

  const visiveis = useMemo(() => {
    const q = normalizar(busca);
    const d = busca.replace(/\D/g, "");
    return linhas.filter(
      (l) =>
        passaFiltro(l, filtro) &&
        (!q || normalizar(l.produto.descricao).includes(q) || normalizar(l.produto.codigo) === q || (d.length >= 4 && (l.classificacao?.ncmFinal ?? l.produto.ncm).startsWith(d))),
    );
  }, [linhas, filtro, busca]);

  // eslint-disable-next-line react-hooks/incompatible-library -- a lista é virtualizada de propósito
  const virt = useVirtualizer({
    count: visiveis.length,
    getScrollElement: () => rolagem.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 12,
    getItemKey: (i) => visiveis[i]?.produto.id ?? i,
  });

  useEffect(() => {
    setFoco((f) => Math.min(f, Math.max(0, visiveis.length - 1)));
  }, [visiveis.length]);

  // Impressão: só as linhas visíveis entram animadas; o total fica abaixo de 1,2 s.
  const itensVirtuais = virt.getVirtualItems();
  const qtdImpressao = Math.min(itensVirtuais.length, 24);
  const passo = qtdImpressao ? Math.min(40, 900 / qtdImpressao) : 0;
  useEffect(() => {
    if (!animarImpressao) return;
    const t = setTimeout(aoTerminarImpressao, 1150);
    return () => clearTimeout(t);
  }, [animarImpressao, aoTerminarImpressao]);

  const anunciar = (t: string) => {
    setAviso("");
    requestAnimationFrame(() => setAviso(t));
  };

  const aprovar = useCallback(async (l: LinhaLote) => {
    const c = l.classificacao;
    if (!c) return;
    if (c.status === "ncm_invalido") return anunciar("Corrija o NCM antes de aprovar este item.");
    if (c.status === "aprovado") return;
    await db.classificacoes.update(c.produtoId, { status: "aprovado", atualizadoEm: Date.now() } as Partial<Classificacao>);
    setVistos((s) => new Set(s).add(c.produtoId));
    anunciar(`Aprovado: ${l.produto.descricao}`);
  }, []);

  const revisar = useCallback(async (l: LinhaLote) => {
    const c = l.classificacao;
    if (!c || c.status === "ncm_invalido") return;
    await db.classificacoes.update(c.produtoId, { status: "revisar", atualizadoEm: Date.now() } as Partial<Classificacao>);
    anunciar(`Marcado para revisar: ${l.produto.descricao}`);
  }, []);

  const aoExpandir = useCallback((id: string) => {
    setExpandida((e) => (e === id ? null : id));
    setEditando(null);
  }, []);

  const aoEditar = useCallback((id: string | null) => {
    if (id) setExpandida(id);
    setEditando(id);
  }, []);

  const focarLinha = useCallback(
    (i: number) => {
      const alvo = Math.max(0, Math.min(visiveis.length - 1, i));
      setFoco(alvo);
      virt.scrollToIndex(alvo, { align: "auto" });
      requestAnimationFrame(() => {
        (rolagem.current?.querySelector(`[data-indice="${alvo}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
      });
    },
    [visiveis.length, virt],
  );

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement;
    if (alvo.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const l = visiveis[foco];
    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        focarLinha(foco + 1);
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        focarLinha(foco - 1);
        break;
      case "a":
        if (l) {
          e.preventDefault();
          aprovar(l);
        }
        break;
      case "r":
        if (l) {
          e.preventDefault();
          revisar(l);
        }
        break;
      case "e":
        if (l) {
          e.preventDefault();
          aoEditar(l.produto.id);
        }
        break;
      case "Enter":
      case " ":
        if (l && alvo.getAttribute("role") === "row") {
          e.preventDefault();
          aoExpandir(l.produto.id);
        }
        break;
      case "Escape":
        setEditando(null);
        setExpandida(null);
        break;
      case "?":
        setMostrarAtalhos((m) => !m);
        break;
    }
  }

  const sugeridosNoFiltro = visiveis.filter((l) => l.classificacao?.status === "sugerido");

  async function aprovarEmMassa() {
    const ids = sugeridosNoFiltro.map((l) => l.produto.id);
    if (!ids.length) return;
    const agora = Date.now();
    await db.classificacoes.where("produtoId").anyOf(ids).modify({ status: "aprovado", atualizadoEm: agora });
    anunciar(`${ids.length} ${ids.length === 1 ? "item aprovado" : "itens aprovados"}.`);
  }

  const rotuloFiltro: Record<Filtro, string> = {
    todos: "Todos",
    integral: "Integral",
    reducao60: "Redução 60%",
    zero: "Alíquota zero",
    outro: "Outro",
    revisar: "Revisar",
    ncm_invalido: "NCM inválido",
    sugerido: "Sugeridos",
    aprovado: "Aprovados",
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Buscar por descrição, código ou NCM</span>
          <IconeBusca className="absolute top-1/2 left-2.5 -translate-y-1/2 text-grafite-3" tamanho={14} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar descrição, código ou NCM"
            className="h-9 w-full rounded-campo border border-linha-forte bg-superficie pr-2 pl-8 text-tabela outline-none placeholder:text-grafite-3 focus:border-caneta"
          />
        </label>
        <label className="sr-only" htmlFor="filtro-status">
          Filtrar por situação
        </label>
        <select
          id="filtro-status"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="h-9 rounded-campo border border-linha-forte bg-superficie px-2 text-tabela outline-none focus:border-caneta"
        >
          {(Object.keys(rotuloFiltro) as Filtro[]).map((f) => (
            <option key={f} value={f}>
              {rotuloFiltro[f]}
            </option>
          ))}
        </select>
        <p className="text-tabela text-grafite-2">
          <span className="numeros font-medium text-grafite">{visiveis.length.toLocaleString("pt-BR")}</span> de <span className="numeros">{linhas.length.toLocaleString("pt-BR")}</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Botao tamanho="p" variante="secundario" onClick={aprovarEmMassa} disabled={!sugeridosNoFiltro.length} title="Aprova só os itens sugeridos por regra no filtro atual. Itens decididos pela IA precisam de revisão individual.">
            <Visto tamanho={14} />
            Aprovar sugeridos do filtro ({sugeridosNoFiltro.length.toLocaleString("pt-BR")})
          </Botao>
          <button
            type="button"
            onClick={() => setMostrarAtalhos((m) => !m)}
            aria-expanded={mostrarAtalhos}
            className="hidden h-8 items-center gap-1.5 rounded-campo px-2 text-tabela text-grafite-2 hover:text-grafite md:inline-flex"
          >
            <IconeTeclado tamanho={15} />
            Atalhos
          </button>
        </div>
      </div>

      {mostrarAtalhos && (
        <p className="mb-3 rounded-campo border border-linha bg-superficie px-3 py-2 text-tabela text-grafite-2">
          <kbd className="codigo text-grafite">j</kbd>/<kbd className="codigo text-grafite">k</kbd> navegam · <kbd className="codigo text-grafite">Enter</kbd> abre a linha ·{" "}
          <kbd className="codigo text-grafite">a</kbd> aprova · <kbd className="codigo text-grafite">e</kbd> edita · <kbd className="codigo text-grafite">r</kbd> marca para revisar ·{" "}
          <kbd className="codigo text-grafite">Esc</kbd> fecha
        </p>
      )}

      <div className="flex overflow-hidden rounded-campo border border-linha bg-superficie shadow-folha">
        <div
          ref={rolagem}
          onKeyDown={teclado}
          className="relative h-[calc(100dvh-15rem)] min-h-[26rem] w-full overflow-auto overscroll-contain"
          role="grid"
          aria-label={`Produtos do lote, ${rotuloFiltro[filtro].toLowerCase()}`}
          aria-rowcount={visiveis.length}
        >
          <div role="rowgroup" className="sticky top-0 z-10 border-b border-linha bg-papel-2 pl-[22px]">
            <div role="row" className={`grid h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-rotulo text-grafite-3 ${GRADE}`}>
              <span role="columnheader">Descrição</span>
              <span role="columnheader" className="hidden md:block">
                NCM
              </span>
              <span role="columnheader" className="hidden md:block">
                Tratamento
              </span>
              <span role="columnheader" className="hidden md:block">
                CST
              </span>
              <span role="columnheader" className="hidden md:block">
                cClassTrib
              </span>
              <span role="columnheader" className="hidden md:block">
                Confiança
              </span>
              <span role="columnheader" className="text-right">
                Ação
              </span>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-medium">Nenhum produto neste filtro.</p>
              <p className="mt-1 text-tabela text-grafite-2">
                {busca ? "Tente outra busca ou " : ""}
                <button type="button" className="text-caneta underline" onClick={() => (setFiltro("todos"), setBusca(""))}>
                  mostrar todos
                </button>
                .
              </p>
            </div>
          ) : (
            <div role="rowgroup" className="relative" style={{ height: virt.getTotalSize() }}>
              <Furos deslizando={animarImpressao} absoluto />
              {itensVirtuais.map((v) => {
                const l = visiveis[v.index];
                const ordemTela = v.index - (itensVirtuais[0]?.index ?? 0);
                return (
                  <div key={v.key} role="none" data-index={v.index} ref={virt.measureElement} className="absolute right-0 left-[22px]" style={{ transform: `translateY(${v.start}px)` }}>
                    <Linha
                      linha={l}
                      indice={v.index}
                      focada={foco === v.index}
                      expandida={expandida === l.produto.id}
                      editando={editando === l.produto.id}
                      animarVisto={vistos.has(l.produto.id)}
                      imprimir={animarImpressao && ordemTela < qtdImpressao ? { atraso: Math.round(ordemTela * passo) } : null}
                      cliente={cliente}
                      aoFocar={setFoco}
                      aoExpandir={aoExpandir}
                      aoAprovar={aprovar}
                      aoRevisar={revisar}
                      aoEditar={aoEditar}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {aviso}
      </p>
    </div>
  );
}
