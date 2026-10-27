/** Marca do Carimbo: um carimbo redondo com o visto da caneta. */
export function Marca({ tamanho = 26, comNome = true, className = "" }: { tamanho?: number; comNome?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--grafite)" strokeWidth="2" />
        <circle cx="16" cy="16" r="10.2" fill="none" stroke="var(--grafite)" strokeWidth="1" strokeDasharray="2 2.2" />
        <path d="M9.6 16.6c1.5 1.1 2.7 2.4 3.6 4 .3.5.8.5 1.1 0 1.8-4 4.4-7.3 8.2-9.9" fill="none" stroke="var(--caneta)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {comNome && <span className="text-titulo-3 font-bold tracking-[-0.01em] text-grafite">Carimbo</span>}
    </span>
  );
}
