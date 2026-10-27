"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { EnvioArquivos } from "@/components/app/envio-arquivos";
import { FormCliente } from "@/components/app/form-cliente";
import { Botao } from "@/components/ui/botao";
import { CampoDanfe } from "@/components/ui/campo-danfe";
import { Furos } from "@/components/ui/furos";
import { IconeLapis, IconeLixeira } from "@/components/ui/icones";
import { db } from "@/lib/local/db";
import { useCliente, useLotesDoCliente } from "@/lib/local/consultas";
import { formatarCnpj } from "@/lib/fiscal/texto";
import { SEGMENTOS } from "@/lib/fiscal/tipos";

export default function PaginaCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const cliente = useCliente(id);
  const lotes = useLotesDoCliente(id);
  const [editando, setEditando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  if (cliente === undefined) {
    return (
      <div className="px-4 py-8 md:px-6">
        <p className="text-grafite-2">Procurando o cliente neste navegador…</p>
        <p className="mt-2 text-tabela text-grafite-3">
          Se ele não aparecer, pode ter sido criado em outro computador. <Link href="/app" className="text-caneta underline">Voltar ao início</Link>
        </p>
      </div>
    );
  }

  async function excluir() {
    const ids = (await db.lotes.where("clienteId").equals(id).toArray()).map((l) => l.id);
    await db.transaction("rw", [db.clientes, db.lotes, db.produtos, db.classificacoes], async () => {
      for (const l of ids) {
        await db.produtos.where("loteId").equals(l).delete();
        await db.classificacoes.where("loteId").equals(l).delete();
      }
      await db.lotes.where("clienteId").equals(id).delete();
      await db.clientes.delete(id);
    });
    router.push("/app");
  }

  const segmento = SEGMENTOS.find((s) => s.valor === cliente.segmento)?.rotulo;

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-titulo-2 font-bold break-words">{cliente.razaoSocial}</h1>
        {!editando && (
          <div className="flex gap-2">
            <Botao variante="secundario" tamanho="p" onClick={() => setEditando(true)}>
              <IconeLapis tamanho={13} />
              Editar
            </Botao>
            <Botao variante="perigo" tamanho="p" onClick={() => setConfirmarExclusao(true)}>
              <IconeLixeira tamanho={13} />
              Excluir
            </Botao>
          </div>
        )}
      </div>

      {confirmarExclusao && (
        <div role="alertdialog" aria-labelledby="t-excluir" className="mt-3 rounded-campo border border-erro/50 bg-erro-suave px-4 py-3">
          <p id="t-excluir" className="font-medium">
            Excluir {cliente.razaoSocial} e {lotes?.length ?? 0} {lotes?.length === 1 ? "lote" : "lotes"} deste navegador?
          </p>
          <p className="text-tabela text-grafite-2">As classificações aprovadas também serão apagadas. Baixe as planilhas antes, se precisar delas.</p>
          <div className="mt-2 flex gap-2">
            <Botao variante="perigo" tamanho="p" onClick={excluir}>
              Excluir cliente
            </Botao>
            <Botao variante="discreto" tamanho="p" onClick={() => setConfirmarExclusao(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}

      {editando ? (
        <div className="mt-4 max-w-2xl">
          <FormCliente cliente={cliente} aoSalvar={() => setEditando(false)} />
          <Botao variante="discreto" className="mt-2" onClick={() => setEditando(false)}>
            Cancelar
          </Botao>
        </div>
      ) : (
        <div className="mt-3 grid max-w-3xl grid-cols-2 gap-px sm:grid-cols-[2fr_1fr]">
          <CampoDanfe rotulo="CNPJ" codigo>
            {formatarCnpj(cliente.cnpj)}
          </CampoDanfe>
          <CampoDanfe rotulo="Segmento">{segmento}</CampoDanfe>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <EnvioArquivos cliente={cliente} />

        <section aria-labelledby="t-lotes">
          <h2 id="t-lotes" className="text-titulo-3 font-bold">
            Lotes
          </h2>
          {lotes === undefined ? null : lotes.length === 0 ? (
            <p className="mt-2 text-grafite-2">Nenhum lote ainda. Envie os XMLs ou a planilha ao lado.</p>
          ) : (
            <div className="mt-2 flex overflow-hidden rounded-campo border border-linha bg-superficie">
              <Furos />
              <ul className="min-w-0 flex-1 text-tabela">
                {lotes.map((l, i) => (
                  <li key={l.id} className={`flex h-9 items-center justify-between gap-3 px-3 ${i % 2 ? "" : "bg-faixa"}`}>
                    <Link href={`/app/lotes/${l.id}`} className="min-w-0 truncate text-caneta hover:underline">
                      {l.nome}
                    </Link>
                    <span className="shrink-0 text-grafite-2">
                      {new Date(l.criadoEm).toLocaleDateString("pt-BR")} · {l.situacao === "classificado" ? "Classificado" : "Aguardando"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
