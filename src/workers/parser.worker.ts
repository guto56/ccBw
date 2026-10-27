/// <reference lib="webworker" />
/**
 * Lê os XMLs e planilhas no navegador. O conteúdo bruto nunca sai daqui: só a lista de produtos
 * (código, EAN, descrição, NCM, CEST, CFOP, unidade) volta para a página.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { Deduplicador, lerXmlNfe } from "@/lib/parser/nfe";
import { decodificarTexto, lerCsv } from "@/lib/parser/planilha";
import type { PedidoWorker, RespostaWorker } from "@/lib/parser/protocolo";

const enviar = (m: RespostaWorker) => (self as unknown as Worker).postMessage(m);

async function processarXml(arquivos: File[]) {
  const dedup = new Deduplicador();
  let notas = 0;
  let ignorados = 0;
  let total = 0;

  const lerUm = (nome: string, conteudo: string, origem?: string) => {
    total++;
    const r = lerXmlNfe(conteudo);
    const rotulo = origem ? `${origem} › ${nome}` : nome;
    if (!r.ok) {
      ignorados++;
      enviar({ tipo: "progresso", arquivo: rotulo, situacao: "ignorado", mensagem: `Ignorado: ${r.motivo}.`, notas: 0, itens: 0 });
      return;
    }
    notas++;
    for (const i of r.itens) dedup.adicionarItemNota(i);
    enviar({ tipo: "progresso", arquivo: rotulo, situacao: "ok", mensagem: `${r.modelo === "65" ? "NFC-e" : "NF-e"} com ${r.itens.length} ${r.itens.length === 1 ? "item" : "itens"}`, notas: 1, itens: r.itens.length });
  };

  for (const f of arquivos) {
    const nome = f.name;
    const ext = nome.toLowerCase().split(".").pop();
    try {
      if (ext === "zip") {
        enviar({ tipo: "progresso", arquivo: nome, situacao: "lendo", mensagem: "Abrindo o .zip", notas: 0, itens: 0 });
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const xmls = Object.values(zip.files).filter((z) => !z.dir && z.name.toLowerCase().endsWith(".xml"));
        if (!xmls.length) {
          enviar({ tipo: "progresso", arquivo: nome, situacao: "erro", mensagem: `O arquivo ${nome} não tem XML de NF-e. Envie os XMLs de saída do cliente.`, notas: 0, itens: 0 });
          continue;
        }
        const antes = notas;
        for (const z of xmls) lerUm(z.name.split("/").pop() ?? z.name, await z.async("string"), nome);
        enviar({
          tipo: "progresso",
          arquivo: nome,
          situacao: notas > antes ? "ok" : "erro",
          mensagem: notas > antes ? `${notas - antes} notas lidas de ${xmls.length} XMLs` : `O arquivo ${nome} não tem XML de NF-e válido. Envie os XMLs de saída do cliente.`,
          notas: 0,
          itens: 0,
        });
      } else if (ext === "xml") {
        lerUm(nome, decodificarTexto(await f.arrayBuffer()));
      } else {
        ignorados++;
        enviar({ tipo: "progresso", arquivo: nome, situacao: "ignorado", mensagem: "Ignorado: envie .xml ou .zip de notas (planilhas vão na outra aba).", notas: 0, itens: 0 });
      }
    } catch (e) {
      enviar({ tipo: "progresso", arquivo: nome, situacao: "erro", mensagem: `Não consegui abrir ${nome}: ${(e as Error).message}. Confira se o arquivo não está corrompido.`, notas: 0, itens: 0 });
    }
  }
  enviar({ tipo: "fim-xml", produtos: dedup.produtos, notas, arquivos: total, ignorados });
}

async function processarPlanilha(f: File) {
  const ext = f.name.toLowerCase().split(".").pop();
  const bytes = await f.arrayBuffer();
  let linhas: string[][];
  if (ext === "csv" || ext === "txt") {
    linhas = lerCsv(decodificarTexto(bytes));
  } else if (ext === "xlsx" || ext === "xls" || ext === "ods") {
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    linhas = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][])
      .map((l) => l.map((c) => String(c ?? "").trim()))
      .filter((l) => l.some((c) => c));
  } else {
    enviar({ tipo: "erro", mensagem: `O arquivo ${f.name} não é uma planilha. Envie CSV ou XLSX exportado do ERP do cliente.` });
    return;
  }
  if (linhas.length < 2) {
    enviar({ tipo: "erro", mensagem: `A planilha ${f.name} está vazia ou só tem cabeçalho. Exporte a lista de produtos com uma linha por produto.` });
    return;
  }
  enviar({ tipo: "planilha", arquivo: f.name, cabecalho: linhas[0], linhas: linhas.slice(1) });
}

self.onmessage = (ev: MessageEvent<PedidoWorker>) => {
  const p = ev.data;
  const tarefa = p.tipo === "xml" ? processarXml(p.arquivos) : processarPlanilha(p.arquivo);
  tarefa.catch((e) => enviar({ tipo: "erro", mensagem: `Falha ao ler os arquivos: ${(e as Error).message}` }));
};
