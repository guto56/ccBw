"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { classesBotao } from "@/components/ui/botao";
import { Furos } from "@/components/ui/furos";
import { IconeMais } from "@/components/ui/icones";
import { db } from "@/lib/local/db";
import { useClientes } from "@/lib/local/consultas";
import { formatarCnpj } from "@/lib/fiscal/texto";
import { SEGMENTOS } from "@/lib/fiscal/tipos";

export default function InicioApp() {
  const clientes = useClientes();
  const lotes = useLiveQuery(() => db.lotes.orderBy("criadoEm").reverse().limit(12).toArray(), []);

  if (clientes === undefined) return <p className="px-6 py-8 text-grafite-2">Carregando…</p>;

  if (clientes.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 md:px-6">
        <h1 className="text-titulo-2 font-bold">Nenhum cliente ainda</h1>
        <p className="medida mt-2 text-grafite-2">Crie o primeiro para enviar as notas. Você vai precisar da razão social, do CNPJ e do segmento (mercado, farmácia, pet shop, agropecuária).</p>
        <Link href="/app/clientes/novo" className={classesBotao("primario", "m", "mt-6")}>
          <IconeMais tamanho={14} />
          Criar o primeiro cliente
        </Link>
        <p className="mt-8 text-tabela text-grafite-2">Os dados dos clientes ficam guardados neste navegador. Os XMLs são lidos aqui mesmo e não vão para o servidor.</p>
      </div>
    );
  }

  const porId = new Map(clientes.map((c) => [c.id, c]));
  const seg = Object.fromEntries(SEGMENTOS.map((s) => [s.valor, s.rotulo]));

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-titulo-2 font-bold">Lotes recentes</h1>
          <p className="text-grafite-2">
            {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"} no escritório. Escolha um na lista para enviar notas.
          </p>
        </div>
        <Link href="/app/clientes/novo" className={classesBotao("secundario", "m")}>
          <IconeMais tamanho={14} />
          Novo cliente
        </Link>
      </div>

      {lotes && lotes.length > 0 ? (
        <div className="mt-6 flex overflow-hidden rounded-campo border border-linha bg-superficie">
          <Furos />
          <table className="w-full text-tabela">
            <caption className="sr-only">Lotes recentes</caption>
            <thead>
              <tr className="h-9 border-b border-linha text-left text-rotulo text-grafite-3">
                <th className="px-3 font-normal">Lote</th>
                <th className="px-3 font-normal">Cliente</th>
                <th className="hidden px-3 font-normal sm:table-cell">Segmento</th>
                <th className="px-3 text-right font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l, i) => {
                const c = porId.get(l.clienteId);
                return (
                  <tr key={l.id} className={`h-9 ${i % 2 ? "" : "bg-faixa"}`}>
                    <td className="px-3">
                      <Link href={`/app/lotes/${l.id}`} className="text-caneta underline-offset-2 hover:underline">
                        {l.nome}
                      </Link>
                    </td>
                    <td className="max-w-0 truncate px-3 sm:max-w-none">
                      {c?.razaoSocial ?? "—"} <span className="codigo hidden text-grafite-3 lg:inline">{c ? formatarCnpj(c.cnpj) : ""}</span>
                    </td>
                    <td className="hidden px-3 text-grafite-2 sm:table-cell">{c ? seg[c.segmento] : "—"}</td>
                    <td className="px-3 text-right text-grafite-2">{l.situacao === "classificado" ? "Classificado" : l.situacao === "classificando" ? "Classificando" : "Aguardando classificação"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-grafite-2">Nenhum lote ainda. Abra um cliente e envie os XMLs ou a planilha de produtos.</p>
      )}
    </div>
  );
}
