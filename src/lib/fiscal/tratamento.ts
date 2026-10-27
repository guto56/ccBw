import type { Tratamento } from "./tipos";

export function tratamentoDe(ct: { cst: string; pRedIBS: number; pRedCBS: number }): Tratamento {
  if (ct.cst === "000") return "integral";
  if (ct.cst === "200" && ct.pRedIBS === 100 && ct.pRedCBS === 100) return "zero";
  if (ct.cst === "200" && ct.pRedIBS === 60 && ct.pRedCBS === 60) return "reducao60";
  return "outro";
}
