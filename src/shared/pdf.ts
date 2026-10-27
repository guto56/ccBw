// Renderiza o DocumentModel em PDF (A4) com fonte TTF embutida. Roda no navegador e no Node (testes).
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocumentModel } from "./document";

export interface PdfFonts {
  regular: Uint8Array;
  semibold: Uint8Array;
  italic: Uint8Array;
}

const A4: [number, number] = [595.28, 841.89];
const M = { left: 72, right: 72, top: 72, bottom: 80 };
const INK = rgb(0.08, 0.09, 0.1);
const MUTED = rgb(0.38, 0.4, 0.43);

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: { regular: PDFFont; semibold: PDFFont; italic: PDFFont };
  pages: PDFPage[];
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage(A4);
  ctx.pages.push(ctx.page);
  ctx.y = A4[1] - M.top;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= width) line = test;
      else {
        if (line) out.push(line);
        // palavra maior que a linha (ex.: URL): quebra por caracteres
        let rest = w;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let i = rest.length;
          while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > width) i--;
          out.push(rest.slice(0, i));
          rest = rest.slice(i);
        }
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

function text(ctx: Ctx, s: string, opts: { font?: PDFFont; size?: number; indent?: number; gap?: number; color?: ReturnType<typeof rgb>; align?: "left" | "center" } = {}) {
  const font = opts.font ?? ctx.fonts.regular;
  const size = opts.size ?? 11;
  const leading = size * 1.45;
  const indent = opts.indent ?? 0;
  const width = A4[0] - M.left - M.right - indent;
  for (const line of wrap(s, font, size, width)) {
    if (ctx.y - leading < M.bottom) newPage(ctx);
    const w = font.widthOfTextAtSize(line, size);
    const x = opts.align === "center" ? (A4[0] - w) / 2 : M.left + indent;
    ctx.page.drawText(line, { x, y: ctx.y - size, size, font, color: opts.color ?? INK });
    ctx.y -= leading;
  }
  ctx.y -= opts.gap ?? 6;
}

function heading(ctx: Ctx, s: string) {
  if (ctx.y - 60 < M.bottom) newPage(ctx);
  ctx.y -= 6;
  text(ctx, s, { font: ctx.fonts.semibold, size: 11.5, gap: 8 });
}

export async function renderPdf(doc: DocumentModel, fontBytes: PdfFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${doc.titulo} — ${doc.referencia[0] ?? ""}`);
  pdf.setCreator("ContraMulta");
  pdf.setProducer("ContraMulta (pdf-lib)");
  pdf.setLanguage("pt-BR");
  const fonts = {
    regular: await pdf.embedFont(fontBytes.regular, { subset: true }),
    semibold: await pdf.embedFont(fontBytes.semibold, { subset: true }),
    italic: await pdf.embedFont(fontBytes.italic, { subset: true }),
  };
  const ctx: Ctx = { pdf, page: undefined as unknown as PDFPage, y: 0, fonts, pages: [] };
  newPage(ctx);

  text(ctx, doc.destinatario, { gap: 22 });
  text(ctx, doc.titulo, { font: fonts.semibold, size: 13, align: "center", gap: 18 });
  for (const r of doc.referencia) text(ctx, r, { size: 10.5, gap: 1, color: MUTED });
  ctx.y -= 14;
  text(ctx, doc.qualificacao, { gap: 14 });

  heading(ctx, "1. DOS FATOS");
  for (const p of doc.fatos) text(ctx, p, { gap: 9 });

  heading(ctx, "2. DO DIREITO");
  doc.direito.forEach((s, i) => {
    text(ctx, `2.${i + 1}. ${s.titulo}`, { font: fonts.semibold, size: 11, gap: 6 });
    for (const p of s.paragrafos) text(ctx, p, { gap: 8 });
    for (const f of s.fundamentos) {
      text(ctx, `“${f.texto.replace(/\n/g, " ")}”`, { font: fonts.italic, size: 10, indent: 24, gap: 1 });
      text(ctx, `(${f.citacao})`, { size: 9, indent: 24, color: MUTED, gap: 8 });
    }
    ctx.y -= 4;
  });

  heading(ctx, "3. DOS PEDIDOS");
  text(ctx, "Diante do exposto, requer:", { gap: 6 });
  doc.pedidos.forEach((p, i) => text(ctx, `${String.fromCharCode(97 + i)}) ${p}${i === doc.pedidos.length - 1 ? "." : ";"}`, { indent: 12, gap: 4 }));
  ctx.y -= 16;
  for (const l of doc.fecho) {
    if (l === "") {
      ctx.y -= 26;
      continue;
    }
    text(ctx, l, { gap: 4 });
  }

  // Página final, só para o usuário
  newPage(ctx);
  text(ctx, "Antes de protocolar", { font: fonts.semibold, size: 13, gap: 4 });
  text(ctx, "Esta página é para você. Não a entregue ao órgão.", { size: 10, color: MUTED, gap: 16 });
  text(ctx, "Anexos", { font: fonts.semibold, size: 11, gap: 6 });
  for (const a of doc.anexos) {
    if (ctx.y - 20 < M.bottom) newPage(ctx);
    ctx.page.drawRectangle({ x: M.left + 2, y: ctx.y - 10, width: 8, height: 8, borderColor: INK, borderWidth: 0.8 });
    text(ctx, a, { indent: 18, gap: 4 });
  }
  ctx.y -= 10;
  text(ctx, "Como protocolar", { font: fonts.semibold, size: 11, gap: 6 });
  doc.protocolo.forEach((p, i) => text(ctx, `${i + 1}. ${p}`, { indent: 6, gap: 4 }));

  const total = ctx.pages.length;
  ctx.pages.forEach((page, i) => {
    const label = `Página ${i + 1} de ${total}`;
    page.drawText(label, { x: A4[0] - M.right - fonts.regular.widthOfTextAtSize(label, 8.5), y: 40, size: 8.5, font: fonts.regular, color: MUTED });
    if (doc.aviso_teste) page.drawText(doc.aviso_teste, { x: M.left, y: 40, size: 8.5, font: fonts.regular, color: MUTED });
  });

  return pdf.save();
}
