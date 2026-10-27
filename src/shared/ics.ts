// Lembrete de prazo em iCalendar (.ics): evento de dia inteiro no prazo final e alarme 3 dias antes.
import { addDays } from "./rules/dates";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function deadlineIcs(input: { uid: string; deadline: string; title: string; description: string; url: string; now?: Date }): string {
  const ymd = (iso: string) => iso.replace(/-/g, "");
  const stamp = (input.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ContraMulta//Lembrete de prazo//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@contramulta`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(input.deadline)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(input.deadline, 1))}`,
    `SUMMARY:${esc(input.title)}`,
    `DESCRIPTION:${esc(input.description)}`,
    `URL:${input.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(input.title)}`,
    "TRIGGER:-P3D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(input.title)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
