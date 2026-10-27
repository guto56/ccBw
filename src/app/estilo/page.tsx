"use client";

import Link from "next/link";
import { useState } from "react";
import { Botao } from "@/components/ui/botao";
import { CampoDanfe, CampoEntrada, CampoSelecao } from "@/components/ui/campo-danfe";
import { Furos } from "@/components/ui/furos";
import { IconeAlerta, IconeBaixar, IconeBusca, IconeEnviar, IconeErro, IconeLapis, IconePasta } from "@/components/ui/icones";
import { Marca } from "@/components/ui/marca";
import { NumeroAnimado } from "@/components/ui/numero-animado";
import { SeloStatus } from "@/components/ui/selo-status";
import { ToggleTema } from "@/components/ui/toggle-tema";
import { Visto } from "@/components/ui/visto";

const TOKENS = [
  ["--papel", "#F6F8F5", "Fundo"],
  ["--faixa", "#E3EEE4", "Faixas do formulário contínuo"],
  ["--grafite", "#1E2733", "Texto e linhas de campo"],
  ["--caneta", "#1F3FB0", "Única cor de ação"],
  ["--ok", "#2E7A4E", "Tratamento confirmado"],
  ["--revisar", "#A86A12", "Precisa de revisão"],
  ["--erro", "#A8321F", "NCM inválido ou falha"],
];

const ESCALA = [
  ["text-display", "Display, só na página inicial"],
  ["text-titulo-1", "Título 1"],
  ["text-titulo-2", "Título 2"],
  ["text-titulo-3", "Título 3"],
  ["text-corpo", "Corpo, 15 px"],
  ["text-tabela", "Tabela, 13 px"],
  ["text-rotulo", "Rótulo de campo, 11 px"],
];

export default function Estilo() {
  const [n, setN] = useState(412);
  const [vistoChave, setVistoChave] = useState(0);
  const [imprimir, setImprimir] = useState(0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Carimbo, página inicial">
          <Marca />
        </Link>
        <ToggleTema />
      </div>
      <h1 className="mt-8 text-titulo-1 font-bold">Sistema visual</h1>
      <p className="medida mt-2 text-grafite-2">O formulário contínuo da matricial, o DANFE com campos em caixas e a caneta azul do contador. Alterne o tema para ver a versão da mesa à noite.</p>

      <section className="mt-10" aria-labelledby="s-cores">
        <h2 id="s-cores" className="text-titulo-2 font-bold">Cores</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOKENS.map(([t, hex, uso]) => (
            <li key={t} className="rounded-campo border border-linha bg-superficie p-2">
              <div className="h-14 rounded-campo border border-linha" style={{ background: `var(${t})` }} />
              <p className="codigo mt-2 text-tabela">{t}</p>
              <p className="text-mini text-grafite-2">
                <span className="codigo">{hex}</span> no tema claro · {uso}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="s-tipo">
        <h2 id="s-tipo" className="text-titulo-2 font-bold">Tipografia</h2>
        <p className="mt-1 text-grafite-2">Schibsted Grotesk 400, 500 e 700 na interface. IBM Plex Mono só para código fiscal, com algarismos tabulares.</p>
        <div className="mt-4 space-y-2">
          {ESCALA.map(([c, r]) => (
            <p key={c} className={`${c} ${c === "text-display" ? "font-bold tracking-[-0.025em]" : c.startsWith("text-titulo") ? "font-bold" : ""}`}>
              {r}
            </p>
          ))}
          <p className="codigo text-corpo">NCM 1006.30.21 · CST 200 · cClassTrib 200003 · CNPJ 12.345.678/0001-95</p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="s-botoes">
        <h2 id="s-botoes" className="text-titulo-2 font-bold">Botões</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Botao>Classificar produtos</Botao>
          <Botao variante="secundario">
            <IconeBaixar tamanho={14} />
            Baixar planilha
          </Botao>
          <Botao variante="discreto">Enviar outros</Botao>
          <Botao variante="perigo">Excluir cliente</Botao>
          <Botao carregando>Classificando</Botao>
          <Botao disabled>Em breve</Botao>
          <Botao tamanho="p" variante="secundario">
            <IconeLapis tamanho={13} />
            Editar
          </Botao>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="s-campos">
        <h2 id="s-campos" className="text-titulo-2 font-bold">Campos de DANFE</h2>
        <div className="mt-4 grid gap-px sm:grid-cols-4">
          <CampoDanfe rotulo="NCM" codigo>
            1006.30.21
          </CampoDanfe>
          <CampoDanfe rotulo="CST IBS/CBS" codigo>
            200
          </CampoDanfe>
          <CampoDanfe rotulo="cClassTrib" codigo>
            200003
          </CampoDanfe>
          <CampoDanfe rotulo="Confiança">Alta</CampoDanfe>
          <CampoDanfe rotulo="Justificativa" className="sm:col-span-4">
            NCM 1006.30.21 listado no Anexo I da LC 214/2025 com alíquota zero de IBS e CBS; a descrição corresponde ao item do anexo.
          </CampoDanfe>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <CampoEntrada rotulo="Razão social" defaultValue="MERCADINHO BOA VISTA LTDA" />
          <CampoEntrada rotulo="CNPJ" codigo defaultValue="12.345.678/0001-90" erro="Os dígitos verificadores não conferem." />
          <CampoSelecao rotulo="Segmento" defaultValue="mercado">
            <option value="mercado">Mercado</option>
            <option value="farmacia">Farmácia</option>
          </CampoSelecao>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="s-status">
        <h2 id="s-status" className="text-titulo-2 font-bold">Status e faixa</h2>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <SeloStatus status="sugerido" />
          <SeloStatus status="revisar" />
          <SeloStatus status="ncm_invalido" />
          <span key={vistoChave}>
            <SeloStatus status="aprovado" animar={vistoChave > 0} />
          </span>
          <Botao tamanho="p" variante="discreto" onClick={() => setVistoChave((k) => k + 1)}>
            Desenhar o visto de novo
          </Botao>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-campo border border-linha bg-papel px-4 py-2 text-tabela">
          <span>
            <span className="numeros text-titulo-3 font-bold">66</span> dias até <span className="codigo">01/01/2027</span>
          </span>
          <span className="text-grafite-2">
            Integral <NumeroAnimado valor={n} className="font-bold text-grafite" />
          </span>
          <span className="inline-flex items-center gap-1 text-grafite-2">
            <IconeAlerta tamanho={13} className="text-revisar-texto" /> Revisar <span className="font-bold text-revisar-texto">23</span>
          </span>
          <span className="inline-flex items-center gap-1 text-grafite-2">
            <IconeErro tamanho={13} className="text-erro" /> NCM inválido <span className="font-bold text-erro">5</span>
          </span>
          <Botao tamanho="p" variante="discreto" onClick={() => setN((x) => x + 1)}>
            Somar 1
          </Botao>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="s-folha">
        <div className="flex items-center justify-between">
          <h2 id="s-folha" className="text-titulo-2 font-bold">Tabela formulário contínuo</h2>
          <Botao tamanho="p" variante="secundario" onClick={() => setImprimir((k) => k + 1)}>
            Imprimir de novo
          </Botao>
        </div>
        <div key={imprimir} className="mt-4 flex overflow-hidden rounded-campo border border-linha bg-superficie shadow-folha">
          <Furos deslizando={imprimir > 0} />
          <table className="w-full text-tabela">
            <caption className="sr-only">Exemplo de tabela</caption>
            <thead>
              <tr className="h-9 border-b border-linha text-left text-rotulo text-grafite-3">
                <th className="px-3 font-normal">Descrição</th>
                <th className="px-3 font-normal">NCM</th>
                <th className="px-3 font-normal">cClassTrib</th>
                <th className="px-3 font-normal">Tratamento</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["ARROZ TIPO 1 TIO JOAO 5KG", "1006.30.21", "200003", "Alíquota zero"],
                ["FEIJAO CARIOCA 1KG", "0713.33.19", "200003", "Alíquota zero"],
                ["SABONETE LUX 85G", "3401.11.90", "200035", "Redução 60%"],
                ["REFRIGERANTE COCA COLA 2L", "2202.10.00", "000001", "Integral"],
                ["RACAO PEDIGREE ADULTO 1KG", "2309.10.00", "000001", "Integral"],
              ].map((l, i) => (
                <tr key={l[0]} className={`h-9 ${i % 2 === 0 ? "bg-faixa" : ""} ${imprimir ? "imprimindo" : ""}`} style={imprimir ? { animationDelay: `${i * 60}ms` } : undefined}>
                  <td className="px-3">{l[0]}</td>
                  <td className="codigo px-3">{l[1]}</td>
                  <td className="codigo px-3">{l[2]}</td>
                  <td className={`px-3 ${l[3] === "Integral" ? "" : "font-medium text-ok-texto"}`}>{l[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 mb-16" aria-labelledby="s-icones">
        <h2 id="s-icones" className="text-titulo-2 font-bold">Ícones</h2>
        <div className="mt-4 flex flex-wrap gap-5 text-grafite-2">
          <IconePasta tamanho={20} />
          <IconeBusca tamanho={20} />
          <IconeEnviar tamanho={20} />
          <IconeBaixar tamanho={20} />
          <IconeLapis tamanho={20} />
          <IconeAlerta tamanho={20} />
          <IconeErro tamanho={20} />
          <Visto tamanho={22} />
        </div>
      </section>
    </div>
  );
}
