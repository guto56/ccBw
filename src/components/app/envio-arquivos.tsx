"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { CampoSelecao } from "@/components/ui/campo-danfe";
import { IconeAlerta, IconeEnviar, IconeErro, IconeRelogio } from "@/components/ui/icones";
import { Visto } from "@/components/ui/visto";
import { db, novoId, type Cliente, type Produto } from "@/lib/local/db";
import { Deduplicador, type ProdutoUnico } from "@/lib/parser/nfe";
import { adivinharMapeamento, CAMPOS_PLANILHA, ncmDePlanilha, type CampoPlanilha } from "@/lib/parser/planilha";
import type { RespostaWorker, SituacaoArquivo } from "@/lib/parser/protocolo";

type Aba = "xml" | "planilha";

interface LinhaProgresso {
  arquivo: string;
  situacao: SituacaoArquivo;
  mensagem: string;
}

function iconeSituacao(s: SituacaoArquivo) {
  if (s === "ok") return <Visto tamanho={14} />;
  if (s === "ignorado") return <IconeAlerta tamanho={13} className="text-revisar-texto" />;
  if (s === "erro") return <IconeErro tamanho={13} className="text-erro" />;
  return <IconeRelogio tamanho={13} className="text-grafite-3" />;
}

export function EnvioArquivos({ cliente }: { cliente: Cliente }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("xml");
  const [arrastando, setArrastando] = useState(false);
  const [progresso, setProgresso] = useState<LinhaProgresso[]>([]);
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState<{ produtos: ProdutoUnico[]; notas: number; arquivos: number; ignorados: number; nome: string } | null>(null);
  const [planilha, setPlanilha] = useState<{ arquivo: string; cabecalho: string[]; linhas: string[][] } | null>(null);
  const [mapa, setMapa] = useState<Partial<Record<CampoPlanilha, number>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const worker = useRef<Worker | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const limpar = () => {
    setProgresso([]);
    setResultado(null);
    setPlanilha(null);
    setErro(null);
  };

  const processar = useCallback(
    (arquivos: File[]) => {
      if (!arquivos.length) return;
      limpar();
      worker.current?.terminate();
      const w = new Worker(new URL("../../workers/parser.worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      setLendo(true);
      const nomeLote =
        arquivos.length === 1 ? arquivos[0].name.replace(/\.[^.]+$/, "") : `${arquivos.length} arquivos de ${new Date().toLocaleDateString("pt-BR")}`;
      w.onmessage = (ev: MessageEvent<RespostaWorker>) => {
        const m = ev.data;
        if (m.tipo === "progresso") {
          setProgresso((p) => {
            const i = p.findIndex((x) => x.arquivo === m.arquivo);
            const linha = { arquivo: m.arquivo, situacao: m.situacao, mensagem: m.mensagem };
            if (i >= 0) {
              const n = [...p];
              n[i] = linha;
              return n;
            }
            return [...p, linha];
          });
        } else if (m.tipo === "fim-xml") {
          setLendo(false);
          if (!m.notas) {
            setErro(
              arquivos.length === 1
                ? `O arquivo ${arquivos[0].name} não tem XML de NF-e. Envie os XMLs de saída do cliente.`
                : "Nenhum dos arquivos tem XML de NF-e ou NFC-e. Envie os XMLs de saída do cliente (layout 4.00).",
            );
          } else setResultado({ produtos: m.produtos, notas: m.notas, arquivos: m.arquivos, ignorados: m.ignorados, nome: nomeLote });
          w.terminate();
        } else if (m.tipo === "planilha") {
          setLendo(false);
          setPlanilha(m);
          setMapa(adivinharMapeamento(m.cabecalho));
          w.terminate();
        } else if (m.tipo === "erro") {
          setLendo(false);
          setErro(m.mensagem);
          w.terminate();
        }
      };
      w.onerror = () => {
        setLendo(false);
        setErro("O leitor de arquivos parou. Recarregue a página e tente de novo.");
      };
      if (aba === "xml") w.postMessage({ tipo: "xml", arquivos });
      else w.postMessage({ tipo: "planilha", arquivo: arquivos[0] });
    },
    [aba],
  );

  function aoSoltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    processar([...e.dataTransfer.files]);
  }

  const mapaCompleto = CAMPOS_PLANILHA.filter((c) => c.obrigatorio).every((c) => mapa[c.campo] !== undefined);

  function produtosDaPlanilha(): ProdutoUnico[] {
    if (!planilha) return [];
    const dedup = new Deduplicador();
    const v = (l: string[], c: CampoPlanilha) => (mapa[c] !== undefined ? (l[mapa[c]!] ?? "").trim() : "");
    for (const l of planilha.linhas) {
      const descricao = v(l, "descricao");
      const codigo = v(l, "codigo");
      if (!descricao && !codigo) continue;
      dedup.adicionar({ codigo, descricao, ncm: ncmDePlanilha(v(l, "ncm")), cest: v(l, "cest").replace(/\D/g, ""), cfop: "", ean: v(l, "ean"), unidade: v(l, "unidade") });
    }
    return dedup.produtos;
  }

  async function criarLote(produtos: ProdutoUnico[], origem: "xml" | "planilha", nome: string, arquivos: number, notas: number) {
    setCriando(true);
    const loteId = novoId();
    const linhas: Produto[] = produtos.map((p, i) => ({
      id: novoId(),
      loteId,
      ordem: i,
      codigo: p.codigo,
      descricao: p.descricao,
      ncm: p.ncm.replace(/\D/g, ""),
      cest: p.cest,
      cfop: p.cfop,
      ean: p.ean,
      unidade: p.unidade,
      ocorrencias: p.ocorrencias,
    }));
    await db.transaction("rw", db.lotes, db.produtos, async () => {
      await db.lotes.add({ id: loteId, clienteId: cliente.id, nome, origem, arquivos, notas, criadoEm: Date.now(), classificadoEm: null, situacao: "lido" });
      await db.produtos.bulkAdd(linhas);
    });
    router.push(`/app/lotes/${loteId}?classificar=1`);
  }

  const ok = progresso.filter((p) => p.situacao === "ok" && !p.arquivo.endsWith(".zip")).length;
  const avisos = progresso.filter((p) => p.situacao === "ignorado" || p.situacao === "erro");

  return (
    <section aria-labelledby="titulo-envio" className="rounded-campo border border-linha bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha px-4 pt-3">
        <h2 id="titulo-envio" className="pb-3 text-titulo-3 font-bold">
          Enviar produtos do cliente
        </h2>
        <div role="tablist" aria-label="Tipo de arquivo" className="flex gap-1">
          {(
            [
              ["xml", "Notas (XML ou ZIP)"],
              ["planilha", "Planilha do ERP"],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={aba === v}
              onClick={() => {
                setAba(v);
                limpar();
              }}
              className={`-mb-px h-10 border-b-2 px-3 text-tabela ${aba === v ? "border-caneta font-medium text-grafite" : "border-transparent text-grafite-2 hover:text-grafite"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {!planilha && !resultado && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={aoSoltar}
            className={`flex flex-col items-center justify-center gap-3 rounded-campo border border-dashed px-4 py-10 text-center transition-colors ${
              arrastando ? "border-caneta bg-caneta-suave" : "border-linha-forte"
            }`}
          >
            <IconeEnviar tamanho={28} className="text-grafite-3" />
            <div>
              <p className="font-medium">{aba === "xml" ? "Arraste os XMLs de saída ou um .zip com eles" : "Arraste a planilha de produtos exportada do ERP"}</p>
              <p className="mt-1 text-tabela text-grafite-2">
                {aba === "xml"
                  ? "NF-e (modelo 55) e NFC-e (modelo 65), layout 4.00. A leitura é feita neste computador."
                  : "CSV ou XLSX, uma linha por produto. Na próxima tela você indica qual coluna é qual."}
              </p>
            </div>
            <Botao variante="secundario" onClick={() => entrada.current?.click()} carregando={lendo}>
              {lendo ? "Lendo arquivos" : "Escolher arquivos"}
            </Botao>
            <input
              ref={entrada}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label={aba === "xml" ? "Escolher XMLs ou ZIP" : "Escolher planilha"}
              multiple={aba === "xml"}
              accept={aba === "xml" ? ".xml,.zip,text/xml,application/zip" : ".csv,.xlsx,.xls,.ods,.txt"}
              onChange={(e) => {
                processar([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {erro && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-campo bg-erro-suave px-3 py-2 text-tabela text-grafite">
            <IconeErro tamanho={15} className="mt-0.5 shrink-0 text-erro" />
            {erro}
          </p>
        )}

        {progresso.length > 0 && (
          <div className="mt-4" aria-live="polite">
            <p className="text-tabela text-grafite-2">
              <span className="numeros font-medium text-grafite">{ok}</span> {ok === 1 ? "nota lida" : "notas lidas"}
              {avisos.length > 0 && (
                <>
                  {" "}
                  · <span className="numeros font-medium text-revisar-texto">{avisos.length}</span> {avisos.length === 1 ? "arquivo ignorado" : "arquivos ignorados"}
                </>
              )}
            </p>
            <ul tabIndex={0} aria-label="Arquivos lidos" className="mt-2 max-h-48 overflow-y-auto rounded-campo border border-linha text-tabela">
              {[...avisos, ...progresso.filter((p) => p.situacao !== "ignorado" && p.situacao !== "erro")].slice(0, 400).map((p, i) => (
                <li key={p.arquivo} className={`flex flex-wrap items-center gap-x-2 px-3 py-1 sm:flex-nowrap ${i % 2 ? "" : "bg-faixa"}`}>
                  <span className="shrink-0">{iconeSituacao(p.situacao)}</span>
                  <span className="codigo min-w-0 flex-1 truncate text-mini">{p.arquivo}</span>
                  <span className={`w-full pl-6 text-mini sm:w-auto sm:shrink-0 sm:pl-0 ${p.situacao === "ok" ? "text-grafite-2" : p.situacao === "erro" ? "text-erro" : "text-revisar-texto"}`}>{p.mensagem}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-campo border border-linha bg-papel px-4 py-3">
            <p>
              <span className="numeros font-bold">{resultado.produtos.length}</span> produtos únicos em <span className="numeros">{resultado.notas}</span> notas.{" "}
              <span className="text-grafite-2">Só esta lista vai para a classificação; os XMLs ficam aqui.</span>
            </p>
            <div className="flex gap-2">
              <Botao variante="discreto" onClick={limpar}>
                Enviar outros
              </Botao>
              <Botao onClick={() => criarLote(resultado.produtos, "xml", resultado.nome, resultado.arquivos, resultado.notas)} carregando={criando}>
                Classificar produtos
              </Botao>
            </div>
          </div>
        )}

        {planilha && (
          <div className="mt-1">
            <p className="text-tabela text-grafite-2">
              <span className="codigo">{planilha.arquivo}</span>: <span className="numeros">{planilha.linhas.length}</span> linhas. Indique qual coluna corresponde a cada campo.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {CAMPOS_PLANILHA.map((c) => (
                <CampoSelecao
                  key={c.campo}
                  rotulo={`${c.rotulo}${c.obrigatorio ? "" : " (opcional)"}`}
                  value={mapa[c.campo] ?? ""}
                  onChange={(e) => setMapa((m) => ({ ...m, [c.campo]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                >
                  <option value="">{c.obrigatorio ? "Escolha a coluna" : "Não tem"}</option>
                  {planilha.cabecalho.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Coluna ${i + 1}`}
                    </option>
                  ))}
                </CampoSelecao>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto rounded-campo border border-linha">
              <table className="w-full text-tabela">
                <caption className="sr-only">Prévia das primeiras linhas com as colunas escolhidas</caption>
                <thead>
                  <tr className="border-b border-linha text-left text-rotulo text-grafite-3">
                    {CAMPOS_PLANILHA.map((c) => (
                      <th key={c.campo} className="px-3 py-1.5 font-normal">
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planilha.linhas.slice(0, 5).map((l, i) => (
                    <tr key={i} className={i % 2 ? "" : "bg-faixa"}>
                      {CAMPOS_PLANILHA.map((c) => (
                        <td key={c.campo} className={`max-w-64 truncate px-3 py-1 ${["ncm", "cest", "ean", "codigo"].includes(c.campo) ? "codigo" : ""}`}>
                          {mapa[c.campo] !== undefined ? (c.campo === "ncm" ? ncmDePlanilha(l[mapa[c.campo]!] ?? "") : l[mapa[c.campo]!]) || "—" : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!mapaCompleto && <p className="mt-2 text-tabela text-revisar-texto">Escolha as colunas de código, descrição e NCM para continuar.</p>}
            <div className="mt-4 flex gap-2">
              <Botao variante="discreto" onClick={limpar}>
                Trocar planilha
              </Botao>
              <Botao
                disabled={!mapaCompleto}
                carregando={criando}
                onClick={() => {
                  const ps = produtosDaPlanilha();
                  if (!ps.length) return setErro("Nenhuma linha com código ou descrição nas colunas escolhidas. Confira o mapeamento.");
                  criarLote(ps, "planilha", planilha.arquivo.replace(/\.[^.]+$/, ""), 1, 0);
                }}
              >
                Classificar produtos
              </Botao>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
