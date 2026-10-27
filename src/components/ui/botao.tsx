import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "discreto" | "perigo";
type Tamanho = "p" | "m" | "g";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-caneta text-sobre-caneta hover:bg-caneta-hover border border-caneta hover:border-caneta-hover",
  secundario: "bg-superficie text-grafite border border-linha-forte hover:border-caneta hover:text-caneta",
  discreto: "bg-transparent text-caneta border border-transparent hover:bg-caneta-suave",
  perigo: "bg-transparent text-erro border border-erro/60 hover:bg-erro-suave",
};

const TAMANHOS: Record<Tamanho, string> = {
  p: "h-8 px-2.5 text-tabela gap-1.5",
  m: "h-10 px-4 text-corpo gap-2",
  g: "h-12 px-5 text-titulo-3 gap-2.5",
};

export const classesBotao = (variante: Variante = "primario", tamanho: Tamanho = "m", extra = "") =>
  `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-campo font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${extra}`;

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = "primario", tamanho = "m", carregando, className = "", children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={classesBotao(variante, tamanho, className)}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando && (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="animate-spin motion-reduce:animate-none">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="2" />
          <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
});
