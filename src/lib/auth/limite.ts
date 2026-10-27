/** Limite simples de tentativas por IP, em memória do processo. */
const JANELA_MS = 10 * 60 * 1000;
const MAXIMO = 5;
const tentativas = new Map<string, number[]>();

export function registrarTentativa(ip: string): { permitido: boolean; restantes: number; esperarS: number } {
  const agora = Date.now();
  const lista = (tentativas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  if (lista.length >= MAXIMO) {
    tentativas.set(ip, lista);
    return { permitido: false, restantes: 0, esperarS: Math.ceil((JANELA_MS - (agora - lista[0])) / 1000) };
  }
  lista.push(agora);
  tentativas.set(ip, lista);
  if (tentativas.size > 5000) tentativas.delete(tentativas.keys().next().value as string);
  return { permitido: true, restantes: MAXIMO - lista.length, esperarS: 0 };
}

export function limparTentativas(ip: string) {
  tentativas.delete(ip);
}

export function ipDe(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "local";
}
