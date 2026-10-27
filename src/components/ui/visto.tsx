/** Visto em caneta azul. Com `animar`, o traço é desenhado (~250 ms). */
export function Visto({ animar = false, tamanho = 18, className = "" }: { animar?: boolean; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`text-caneta ${animar ? "visto-animado" : ""} ${className}`}
      style={{ ["--comprimento" as string]: 26 }}
    >
      <path
        d="M3.2 10.6c1.4 1.1 2.6 2.4 3.6 4.1.3.5.9.5 1.1 0C9.8 10 12.6 6.3 16.8 3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
