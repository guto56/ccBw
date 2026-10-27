// Envia os assets que a sessão de upload pediu. Uso: node tools/deploy/upload-assets.mjs <arquivo-json-da-sessao>
// O JSON da sessão ({ jwt, buckets }) vem da chamada assets-upload-session feita pelo MCP.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const session = JSON.parse(readFileSync(process.argv[2], "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "dist/deploy-manifest.json"), "utf8"));
const byHash = Object.fromEntries(Object.entries(manifest).map(([p, m]) => [m.hash, p]));
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".md": "text/markdown", ".json": "application/json" };
let completion = session.jwt;
for (const bucket of session.buckets) {
  const form = new FormData();
  for (const hash of bucket) {
    const p = byHash[hash];
    const buf = readFileSync(join(root, "dist/deploy", p));
    const ext = p.slice(p.lastIndexOf("."));
    form.append(hash, new File([buf.toString("base64")], hash, { type: TYPES[ext] ?? "application/null" }), hash);
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/assets/upload?base64=true`, { method: "POST", headers: { Authorization: `Bearer ${session.jwt}` }, body: form });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(`upload falhou: ${res.status} ${JSON.stringify(body.errors)}`);
  if (body.result?.jwt) completion = body.result.jwt;
  console.error(`bucket enviado: ${bucket.length} arquivo(s)`);
}
console.log(completion);
