// Datas civis (AAAA-MM-DD) tratadas como dias inteiros em UTC, sem fuso, para contagem de prazos.
const DAY = 86_400_000;

export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / DAY);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

/** Dias corridos de `a` até `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(iso: string): number {
  return new Date(toDayNumber(iso) * DAY).getUTCDay();
}

/** Prorroga para segunda-feira um vencimento em sábado ou domingo. Feriados não são considerados. */
export function rollWeekend(iso: string): string {
  const w = weekday(iso);
  if (w === 6) return addDays(iso, 2);
  if (w === 0) return addDays(iso, 1);
  return iso;
}

export function isValidDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return fromDayNumber(toDayNumber(iso)) === iso;
}

/** Data de hoje no fuso de Brasília. */
export function todayBrasilia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
