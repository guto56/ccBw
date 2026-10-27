import { NextResponse } from "next/server";
import { ITENS_DEMO } from "@/lib/demo/itens";
import { classificarProduto } from "@/lib/fiscal/motor";

/** Demonstração pública: roda o motor de regras de verdade nos seis itens fixos, sem IA. */
export async function POST() {
  const resultados = ITENS_DEMO.map((p) => ({ id: p.id, sugestao: classificarProduto(p, "mercado").sugestao }));
  return NextResponse.json({ resultados });
}
