import { NextResponse } from "next/server";
import { formatarNcm } from "@/lib/fiscal/texto";
import { VERSOES, validarNcm } from "@/lib/fiscal/tabelas";

export async function GET(req: Request) {
  const codigo = new URL(req.url).searchParams.get("codigo") ?? "";
  const v = validarNcm(codigo);
  if (!v.ok) return NextResponse.json({ ok: false, motivo: v.motivo, tabela: VERSOES.ncm });
  return NextResponse.json({ ok: true, codigo: v.codigo, formatado: formatarNcm(v.codigo), descricao: v.caminho.join(" › "), tabela: VERSOES.ncm });
}
