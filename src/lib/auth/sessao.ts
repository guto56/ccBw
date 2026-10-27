import { SignJWT, jwtVerify } from "jose";

export const COOKIE_SESSAO = "carimbo_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 12;

function segredo(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

export async function criarSessao(): Promise<string> {
  return new SignJWT({ papel: "contador" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .setIssuer("carimbo")
    .sign(segredo());
}

export async function sessaoValida(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, segredo(), { issuer: "carimbo", algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
