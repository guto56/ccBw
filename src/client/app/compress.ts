// Prepara os arquivos no navegador: fotos com o lado maior até 2000 px (JPEG);
// PDF vai inteiro quando o modelo aceita PDF, senão as páginas 1 e 2 viram PNG (pdf.js).
const MAX_SIDE = 2000;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao gerar imagem"))), type, quality));
}

export async function compressImage(file: File): Promise<File> {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1_500_000 && file.type === "image/jpeg") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export async function pdfToImages(file: File, pages = 2): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: File[] = [];
  for (let i = 1; i <= Math.min(pages, doc.numPages); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
    out.push(new File([blob], `${file.name.replace(/\.pdf$/i, "")}-p${i}.jpg`, { type: "image/jpeg" }));
  }
  return out;
}

export async function prepareFiles(files: File[], pdfNative: boolean, maxBytes = Infinity): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (f.type === "application/pdf") {
      if (pdfNative && f.size <= maxBytes) out.push(f);
      else out.push(...(await pdfToImages(f)));
    } else if (f.type.startsWith("image/")) {
      out.push(await compressImage(f));
    }
  }
  return out;
}
