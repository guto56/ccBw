import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarSessao } from "@/lib/auth/sessao";
import { ipDe, limparTentativas, registrarTentativa } from "@/lib/auth/limite";

const Corpo = z.object({ senha: z.string().min(1).max(200) });

function iguais(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request) {
  const ip = ipDe(req.headers);
  const limite = registrarTentativa(ip);
  if (!limite.permitido) {
    const min = Math.ceil(limite.esperarS / 60);
    return NextResponse.json(
      { erro: `Muitas tentativas seguidas. Espere ${min} ${min === 1 ? "minuto" : "minutos"} e tente de novo.` },
      { status: 429, headers: { "Retry-After": String(limite.esperarS) } },
    );
  }
  const corpo = Corpo.safeParse(await req.json().catch(() => null));
  const esperada = process.env.APP_PASSWORD;
  if (!esperada) return NextResponse.json({ erro: "Senha de acesso não configurada no servidor (APP_PASSWORD)." }, { status: 500 });
  if (!corpo.success || !iguais(corpo.data.senha, esperada)) {
    return NextResponse.json(
      {
        erro:
          limite.restantes > 0
            ? `Senha incorreta. Confira maiúsculas e hífens. Restam ${limite.restantes} ${limite.restantes === 1 ? "tentativa" : "tentativas"}.`
            : "Senha incorreta. Espere 10 minutos para tentar de novo.",
      },
      { status: 401 },
    );
  }
  limparTentativas(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, await criarSessao(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  return res;
}
