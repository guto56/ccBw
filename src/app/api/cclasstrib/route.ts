import { NextResponse } from "next/server";
import { CCLASSTRIB } from "@/lib/fiscal/tabelas";
import { tratamentoDe } from "@/lib/fiscal/motor";

/** Códigos válidos em NF-e/NFC-e, para o contador escolher ao editar. */
export async function GET() {
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = CCLASSTRIB.classificacoes
    .filter((c) => (c.nfe || c.nfce) && (!c.fim || c.fim > hoje))
    .map((c) => ({ cClassTrib: c.cClassTrib, cst: c.cst, nome: c.nome, pRedIBS: c.pRedIBS, pRedCBS: c.pRedCBS, tratamento: tratamentoDe(c), url: c.url }));
  return NextResponse.json({ publicacao: CCLASSTRIB.publicacaoMaisRecente, lista });
}
