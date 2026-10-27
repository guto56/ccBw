// Cifra os dados pessoais do requerente (nome, CPF, CNH, endereço) com AES-GCM antes de gravar no D1.
async function key(env: Env): Promise<CryptoKey> {
  if (!env.DATA_KEY) throw new Error("DATA_KEY não configurada");
  const raw = Uint8Array.from(atob(env.DATA_KEY), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("DATA_KEY deve ter 32 bytes em base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(env: Env, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return Buffer.from(out).toString("base64");
}

export async function decryptJson<T>(env: Env, b64: string): Promise<T> {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(env), bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
