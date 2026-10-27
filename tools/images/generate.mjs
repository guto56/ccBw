// Gera imagens com Cloudflare Workers AI (flux-2-klein-4b) via Worker temporário com binding de IA.
// Uso: IMGGEN_URL=... IMGGEN_KEY=... node tools/images/generate.mjs [id ...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const { modelo, imagens } = JSON.parse(readFileSync(new URL("./prompts.json", import.meta.url)));
const only = process.argv.slice(2);
const out = new URL("../../assets-src/generated/", import.meta.url);
let neurons = 0;
for (const img of imagens) {
  if (only.length && !only.includes(img.id)) continue;
  const res = await fetch(process.env.IMGGEN_URL, {
    method: "POST",
    headers: { "x-key": process.env.IMGGEN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, prompt: img.prompt, width: img.width, height: img.height }),
  });
  const body = await res.json();
  const b64 = body.image ?? body.result?.image;
  if (!res.ok || !b64) {
    console.log(img.id, "FALHOU", res.status, JSON.stringify(body).slice(0, 300));
    continue;
  }
  const bytes = Buffer.from(b64, "base64");
  const ext = bytes[0] === 0x89 ? "png" : bytes[0] === 0xff ? "jpg" : "webp";
  writeFileSync(new URL(`${img.id}.${ext}`, out), bytes);
  const tiles = Math.ceil(img.width / 512) * Math.ceil(img.height / 512);
  neurons += tiles * 26.05;
  console.log(img.id, ext, bytes.length, "bytes", `~${Math.round(tiles * 26.05)} neurons`);
}
console.log("total estimado:", Math.round(neurons), "neurons (flux-2-klein-4b)");
