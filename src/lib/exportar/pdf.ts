import type { LinhaLote } from "@/lib/local/consultas";
import { contar } from "@/lib/local/consultas";
import type { Cliente, Lote } from "@/lib/local/db";
import { formatarCnpj, formatarNcm } from "@/lib/fiscal/texto";
import { ROTULO_STATUS } from "@/lib/fiscal/tipos";
import { AVISO_RESPONSABILIDADE, baixarBlob, nomeArquivo, VERSOES_TEXTO } from "./linhas";

const GRAFITE: [number, number, number] = [30, 39, 51];
const CANETA: [number, number, number] = [31, 63, 176];
const FAIXA: [number, number, number] = [227, 238, 228];

export async function gerarPdf(linhas: LinhaLote[], cliente: Cliente, lote: Lote): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 48;
  const largura = doc.internal.pageSize.getWidth();
  let y = margem;

  doc.setTextColor(...GRAFITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Relatório do lote", margem, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 18;
  doc.text(`${cliente.razaoSocial} · CNPJ ${formatarCnpj(cliente.cnpj)}`, margem, y);
  y += 14;
  doc.text(`Lote: ${lote.nome} · gerado em ${new Date().toLocaleString("pt-BR")}`, margem, y);
  y += 20;

  doc.setFillColor(...FAIXA);
  const aviso = doc.splitTextToSize(AVISO_RESPONSABILIDADE, largura - margem * 2 - 16);
  doc.rect(margem, y, largura - margem * 2, aviso.length * 12 + 12, "F");
  doc.setFont("helvetica", "bold");
  doc.text(aviso, margem + 8, y + 16);
  doc.setFont("helvetica", "normal");
  y += aviso.length * 12 + 28;

  const c = contar(linhas);
  const pct = (n: number) => (c.total ? `${((n / c.total) * 100).toFixed(1).replace(".", ",")}%` : "0%");
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    head: [["Resumo por tratamento", "Itens", "% do lote"]],
    body: [
      ["Integral", String(c.integral), pct(c.integral)],
      ["Redução 60%", String(c.reducao60), pct(c.reducao60)],
      ["Alíquota zero", String(c.zero), pct(c.zero)],
      ["Outro (monofásico, imunidade)", String(c.outro), pct(c.outro)],
      ["NCM inválido", String(c.ncm_invalido), pct(c.ncm_invalido)],
      ["Total de produtos", String(c.total), "100%"],
    ],
    styles: { font: "helvetica", fontSize: 9, textColor: GRAFITE, cellPadding: 4 },
    headStyles: { fillColor: [255, 255, 255], textColor: GRAFITE, fontStyle: "bold", lineWidth: { bottom: 0.8 }, lineColor: GRAFITE },
    alternateRowStyles: { fillColor: FAIXA },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.text(`Situação: ${c.aprovado} aprovados, ${c.sugerido} sugeridos aguardando aprovação, ${c.revisar} para revisar.`, margem, y + 8);
  y += 28;

  const pendentes = linhas.filter((l) => l.classificacao && (l.classificacao.status === "revisar" || l.classificacao.status === "ncm_invalido"));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Itens para revisar (${pendentes.length})`, margem, y);
  doc.setFont("helvetica", "normal");
  if (pendentes.length) {
    autoTable(doc, {
      startY: y + 8,
      margin: { left: margem, right: margem },
      head: [["Código", "Descrição", "NCM", "Situação", "Motivo"]],
      body: pendentes.map(({ produto: p, classificacao: k }) => [
        p.codigo,
        p.descricao,
        (k!.ncmFinal ?? p.ncm) ? formatarNcm(k!.ncmFinal ?? p.ncm) : "—",
        ROTULO_STATUS[k!.status],
        [k!.justificativa, ...k!.alertas].join(" ").slice(0, 300),
      ]),
      styles: { font: "helvetica", fontSize: 7.5, textColor: GRAFITE, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [255, 255, 255], textColor: GRAFITE, fontStyle: "bold", lineWidth: { bottom: 0.8 }, lineColor: GRAFITE },
      alternateRowStyles: { fillColor: FAIXA },
      columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 130 }, 2: { cellWidth: 58, font: "courier" }, 3: { cellWidth: 58 } },
    });
  } else {
    doc.setFontSize(10);
    doc.text("Nenhum item pendente de revisão.", margem, y + 18);
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(90, 100, 110);
    const rodape = doc.splitTextToSize(`${VERSOES_TEXTO} Carimbo · página ${i} de ${paginas}`, largura - margem * 2);
    doc.text(rodape, margem, doc.internal.pageSize.getHeight() - 28);
    doc.setDrawColor(...CANETA);
  }
  return doc.output("blob");
}

export async function baixarPdf(linhas: LinhaLote[], cliente: Cliente, lote: Lote) {
  baixarBlob(await gerarPdf(linhas, cliente, lote), nomeArquivo(cliente, lote, "pdf"));
}
