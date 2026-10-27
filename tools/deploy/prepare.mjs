// Prepara o deploy via API da Cloudflare (MCP), sem credencial local:
// copia dist/client para dist/deploy, inclui o bundle do Worker num caminho aleatório (relay)
// e grava o manifesto de assets (hash = blake3(base64 + extensão), como o wrangler).
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { randomBytes } from "node:crypto";
import { blake3 } from "@noble/hashes/blake3.js";

const root = new URL("../../", import.meta.url).pathname;
const src = join(root, "dist/client");
const out = join(root, "dist/deploy");
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });
const relay = `__deploy/${randomBytes(12).toString("hex")}/worker.js`;
mkdirSync(join(out, relay, ".."), { recursive: true });
writeFileSync(join(out, relay), readFileSync(join(root, "dist/worker/index.js")));

const IGNORE = new Set(["_headers", "_redirects", ".assetsignore"]);
const manifest = {};
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!IGNORE.has(name) || dir !== out) {
      const buf = readFileSync(p);
      const hash = Buffer.from(blake3(new TextEncoder().encode(buf.toString("base64") + extname(p).slice(1)))).toString("hex").slice(0, 32);
      manifest["/" + relative(out, p).split("\\").join("/")] = { hash, size: buf.length };
    }
  }
}
walk(out);
writeFileSync(join(root, "dist/deploy-manifest.json"), JSON.stringify(manifest));
writeFileSync(join(root, "dist/deploy-relay.txt"), "/" + relay);
console.log(JSON.stringify({ arquivos: Object.keys(manifest).length, bytes: Object.values(manifest).reduce((s, m) => s + m.size, 0), relay: "/" + relay }));
