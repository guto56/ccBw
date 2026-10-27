export function newId(): string {
  return crypto.randomUUID();
}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Token de acesso ao caso: 32 bytes aleatórios. */
export function newCaseToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação de segredos em tempo constante (Web Crypto). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(ha, hb) && a.length === b.length;
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0 && a.length === b.length;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Mascara CPF/CNH e e-mail para exibição no admin. */
export function maskDigits(s: string | null | undefined): string {
  if (!s) return "";
  const d = s.replace(/\D/g, "");
  if (d.length <= 4) return "•".repeat(d.length);
  return "•".repeat(d.length - 2) + d.slice(-2);
}

export function maskEmail(s: string | null | undefined): string {
  if (!s) return "";
  const [u, dom] = s.split("@");
  if (!dom) return "•••";
  return `${(u ?? "").slice(0, 1)}•••@${dom}`;
}

export function maskPlate(s: string | null | undefined): string {
  if (!s) return "";
  return s.slice(0, 3) + "•".repeat(Math.max(0, s.length - 3));
}
