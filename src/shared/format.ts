/** R$ 1.234,56 com espaço comum (o Intl usa espaço não separável, que atrapalha PDF e testes). */
export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}
