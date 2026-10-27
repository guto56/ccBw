import type { LinhaLote } from "@/lib/local/consultas";
import type { Cliente, Lote } from "@/lib/local/db";
import { baixarBlob, CABECALHO, cabecalhoCliente, linhaExportacao, nomeArquivo } from "./linhas";

export async function gerarXlsx(linhas: LinhaLote[], cliente: Cliente, lote: Lote): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const dados = [CABECALHO as unknown as string[], ...linhas.map(linhaExportacao)];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  // NCM, CST, cClassTrib e código como texto: preserva zeros à esquerda no ERP.
  for (let r = 1; r < dados.length; r++) {
    for (const col of [0, 2, 3, 5, 6]) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (ws[ref]) ws[ref].t = "s";
    }
  }
  ws["!cols"] = [10, 42, 12, 10, 14, 10, 11, 10, 80, 60, 12].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: `A1:K${dados.length}` };
  XLSX.utils.book_append_sheet(wb, ws, "Classificação");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cabecalhoCliente(cliente, lote)), "Sobre");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function celulaCsv(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(linhas: LinhaLote[]): Blob {
  const corpo = [CABECALHO as unknown as string[], ...linhas.map(linhaExportacao)].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
  return new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8" });
}

export async function baixarPlanilha(formato: "xlsx" | "csv", linhas: LinhaLote[], cliente: Cliente, lote: Lote) {
  const blob = formato === "xlsx" ? await gerarXlsx(linhas, cliente, lote) : gerarCsv(linhas);
  baixarBlob(blob, nomeArquivo(cliente, lote, formato));
}
