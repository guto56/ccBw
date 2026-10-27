import { NextResponse } from "next/server";
import { z } from "zod";
import { cachePadrao } from "@/lib/fiscal/cache";
import { classificarLote } from "@/lib/fiscal/classificar";
import { clienteOpenRouter } from "@/lib/fiscal/ia";

export const maxDuration = 60;

const Produto = z.object({
  id: z.string().min(1).max(64),
  codigo: z.string().max(60),
  descricao: z.string().max(300),
  ncm: z.string().max(20),
  cest: z.string().max(20).optional(),
  cfop: z.string().max(10).optional(),
  ean: z.string().max(20).optional(),
  unidade: z.string().max(10).optional(),
});

const Corpo = z.object({
  segmento: z.enum(["mercado", "farmacia", "petshop", "agropecuaria", "outro"]),
  produtos: z.array(Produto).min(1).max(1000),
});

export async function POST(req: Request) {
  const corpo = Corpo.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ erro: "Lista de produtos inválida. Envie até 1.000 produtos por vez, com código, descrição e NCM." }, { status: 400 });
  }
  const r = await classificarLote(corpo.data.produtos, corpo.data.segmento, { ia: clienteOpenRouter(), cache: cachePadrao() });
  return NextResponse.json(r);
}
