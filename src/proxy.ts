import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/auth/sessao";

const API_PUBLICAS = ["/api/entrar", "/api/sair", "/api/demo"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (API_PUBLICAS.some((p) => pathname === p)) return NextResponse.next();
  const ok = await sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Sessão expirada. Entre de novo com a senha do escritório." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = `?para=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
