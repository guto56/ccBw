"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Contagens } from "@/lib/local/consultas";

export type Filtro = "todos" | "integral" | "reducao60" | "zero" | "outro" | "revisar" | "ncm_invalido" | "sugerido" | "aprovado";

interface ResumoLote {
  loteId: string;
  nome: string;
  cliente: string;
  contagens: Contagens;
}

interface Valor {
  resumo: ResumoLote | null;
  setResumo: (r: ResumoLote | null) => void;
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
}

const Ctx = createContext<Valor | null>(null);

export function ProvedorFaixa({ children }: { children: ReactNode }) {
  const [resumo, setResumo] = useState<ResumoLote | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const v = useMemo(() => ({ resumo, setResumo, filtro, setFiltro }), [resumo, filtro]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useFaixa() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFaixa fora do ProvedorFaixa");
  return v;
}
