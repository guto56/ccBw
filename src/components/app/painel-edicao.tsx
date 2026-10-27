"use client";

import { useEffect, useMemo, useState } from "react";
import { Botao } from "@/components/ui/botao";
import { CampoEntrada, CampoSelecao } from "@/components/ui/campo-danfe";
import { IconeErro } from "@/components/ui/icones";
import { Visto } from "@/components/ui/visto";
import { db, type Classificacao, type Cliente } from "@/lib/local/db";
import type { LinhaLote } from "@/lib/local/consultas";
import { ErroSessao, reclassificarProduto } from "@/lib/local/classificacao";
import { ROTULO_TRATAMENTO, type Sugestao, type Tratamento } from "@/lib/fiscal/tipos";

interface CodigoOficial {
  cClassTrib: string;
  cst: string;
  nome: string;
  pRedIBS: number;
  pRedCBS: number;
  tratamento: Tratamento;
  url: string | null;
}

let listaCache: Promise<{ publicacao: string; lista: CodigoOficial[] }> | null = null;
function codigosOficiais() {
  return (listaCache ??= fetch("/api/cclasstrib").then((r) => {
    if (!r.ok) throw new Error("falha");
    return r.json();
  }));
}

type EstadoNcm = { ok: true; descricao: string } | { ok: false; motivo: string } | null;

export function PainelEdicao({ linha, cliente, aoFechar }: { linha: LinhaLote; cliente: Cliente; aoFechar: () => void }) {
  const c = linha.classificacao!;
  const [ncm, setNcm] = useState(c.ncmFinal ?? c.ncmSugerido ?? linha.produto.ncm);
  const [remoto, setRemoto] = useState<{ codigo: string; estado: EstadoNcm } | null>(null);
  const [codigos, setCodigos] = useState<{ publicacao: string; lista: CodigoOficial[] } | null>(null);
  const [codigo, setCodigo] = useState(c.cClassTrib);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [ocupado, setOcupado] = useState<"reclassificar" | "salvar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    codigosOficiais()
      .then(setCodigos)
      .catch(() => setErro("Não consegui carregar a tabela de cClassTrib. Recarregue a página."));
  }, []);

  const digitos = ncm.replace(/\D/g, "");
  const estadoNcm: EstadoNcm =
    digitos.length !== 8 ? (digitos ? { ok: false, motivo: "O NCM tem 8 dígitos." } : null) : remoto?.codigo === digitos ? remoto.estado : null;

  useEffect(() => {
    const d = ncm.replace(/\D/g, "");
    if (d.length !== 8) return;
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`/api/ncm?codigo=${d}`)
        .then((r) => r.json())
        .then((j) => vivo && setRemoto({ codigo: d, estado: j.ok ? { ok: true, descricao: j.descricao } : { ok: false, motivo: j.motivo } }))
        .catch(() => vivo && setRemoto({ codigo: d, estado: { ok: false, motivo: "Não foi possível consultar a tabela NCM agora." } }));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [ncm]);

  const grupos = useMemo(() => {
    const ordem: Tratamento[] = ["zero", "reducao60", "integral", "outro"];
    const lista = codigos?.lista ?? [];
    return ordem.map((t) => ({ t, itens: lista.filter((x) => x.tratamento === t) })).filter((g) => g.itens.length);
  }, [codigos]);

  const escolhido = codigos?.lista.find((x) => x.cClassTrib === codigo);

  async function reclassificar() {
    setErro(null);
    setOcupado("reclassificar");
    try {
      const s = await reclassificarProduto(linha.produto, ncm.replace(/\D/g, ""), cliente.segmento);
      setSugestao(s);
      if (s.cClassTrib) setCodigo(s.cClassTrib);
    } catch (e) {
      setErro(e instanceof ErroSessao ? e.message : "A reclassificação falhou. Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  async function salvar() {
    if (!estadoNcm?.ok) return setErro("Informe um NCM vigente de 8 dígitos antes de aprovar.");
    if (!escolhido) return setErro("Escolha o cClassTrib.");
    setOcupado("salvar");
    const usaSugestao = sugestao && sugestao.cClassTrib === escolhido.cClassTrib;
    const atualizacao: Partial<Classificacao> = {
      tratamento: escolhido.tratamento,
      cst: escolhido.cst,
      cClassTrib: escolhido.cClassTrib,
      pRedIBS: escolhido.pRedIBS,
      pRedCBS: escolhido.pRedCBS,
      ncmFinal: ncm.replace(/\D/g, ""),
      status: "aprovado",
      origem: "contador",
      confianca: "alta",
      justificativa: usaSugestao ? sugestao!.justificativa : `Definido pelo contador: ${escolhido.nome}`,
      fonte: usaSugestao ? sugestao!.fonte : `Tabela cClassTrib ${escolhido.cClassTrib} (CST ${escolhido.cst}, publicação ${codigos?.publicacao})`,
      fonteUrl: escolhido.url,
      alertas: usaSugestao ? sugestao!.alertas : [],
      atualizadoEm: Date.now(),
    };
    await db.classificacoes.update(c.produtoId, atualizacao);
    setOcupado(null);
    aoFechar();
  }

  return (
    <div className="max-w-4xl">
      <p className="text-tabela text-grafite-2">
        Editando <span className="text-grafite">{linha.produto.descricao}</span>. Ao salvar, o item fica aprovado por você.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <CampoEntrada
          rotulo="NCM"
          value={ncm}
          onChange={(e) => setNcm(e.target.value)}
          codigo
          inputMode="numeric"
          autoFocus
          erro={estadoNcm && !estadoNcm.ok ? estadoNcm.motivo : null}
          ajuda={estadoNcm?.ok ? estadoNcm.descricao : "8 dígitos, com ou sem pontos."}
        />
        <CampoSelecao rotulo="cClassTrib" value={codigo} onChange={(e) => setCodigo(e.target.value)}>
          <option value="">{codigos ? "Escolha o código" : "Carregando a tabela oficial…"}</option>
          {grupos.map((g) => (
            <optgroup key={g.t} label={ROTULO_TRATAMENTO[g.t]}>
              {g.itens.map((x) => (
                <option key={x.cClassTrib} value={x.cClassTrib}>
                  {x.cClassTrib} · CST {x.cst} · {x.nome.length > 90 ? `${x.nome.slice(0, 89)}…` : x.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </CampoSelecao>
      </div>
      {escolhido && (
        <p className="medida mt-2 text-tabela text-grafite-2">
          {ROTULO_TRATAMENTO[escolhido.tratamento]} · redução IBS {escolhido.pRedIBS}% e CBS {escolhido.pRedCBS}%. {escolhido.nome}
        </p>
      )}
      {sugestao && (
        <p className="medida mt-2 text-tabela">
          Pelo NCM {ncm}, o motor sugere <span className="codigo">{sugestao.cClassTrib || "—"}</span>: {sugestao.justificativa}
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-tabela text-erro">
          <IconeErro tamanho={13} />
          {erro}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Botao tamanho="p" onClick={salvar} carregando={ocupado === "salvar"} disabled={!estadoNcm?.ok || !escolhido}>
          <Visto tamanho={14} className="text-sobre-caneta" />
          Salvar e aprovar
        </Botao>
        <Botao tamanho="p" variante="secundario" onClick={reclassificar} carregando={ocupado === "reclassificar"} disabled={!estadoNcm?.ok}>
          Reclassificar pelo NCM
        </Botao>
        <Botao tamanho="p" variante="discreto" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
