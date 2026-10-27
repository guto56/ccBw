import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

/**
 * Campo no estilo do DANFE: caixa com linha fina e rótulo pequeno no canto superior esquerdo.
 * Usado para exibir (CampoDanfe) e para preencher (CampoEntrada / CampoSelecao).
 */
export function CampoDanfe({
  rotulo,
  children,
  codigo,
  className = "",
}: {
  rotulo: string;
  children: ReactNode;
  codigo?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 rounded-campo border border-linha bg-superficie px-2.5 pt-4 pb-1.5 ${className}`}>
      <span className="absolute top-1 left-2.5 text-rotulo text-grafite-3">{rotulo}</span>
      <div className={`min-w-0 break-words text-tabela text-grafite ${codigo ? "codigo" : ""}`}>{children}</div>
    </div>
  );
}

interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  ajuda?: string;
  erro?: string | null;
  codigo?: boolean;
}

export const CampoEntrada = forwardRef<HTMLInputElement, EntradaProps>(function CampoEntrada(
  { rotulo, ajuda, erro, codigo, className = "", id, ...props },
  ref,
) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idAjuda = `${idCampo}-ajuda`;
  return (
    <div className={className}>
      <div
        className={`relative rounded-campo border bg-superficie transition-colors focus-within:border-caneta ${
          erro ? "border-erro" : "border-linha-forte"
        }`}
      >
        <label htmlFor={idCampo} className="absolute top-1 left-2.5 text-rotulo text-grafite-3">
          {rotulo}
        </label>
        <input
          ref={ref}
          id={idCampo}
          aria-invalid={erro ? true : undefined}
          aria-describedby={ajuda || erro ? idAjuda : undefined}
          className={`block h-12 w-full rounded-campo bg-transparent px-2.5 pt-4 text-corpo text-grafite outline-none placeholder:text-grafite-3 ${
            codigo ? "codigo" : ""
          }`}
          {...props}
        />
      </div>
      {(erro || ajuda) && (
        <p id={idAjuda} className={`mt-1 text-mini ${erro ? "text-erro" : "text-grafite-2"}`}>
          {erro ?? ajuda}
        </p>
      )}
    </div>
  );
});

interface SelecaoProps extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo: string;
  ajuda?: string;
}

export function CampoSelecao({ rotulo, ajuda, className = "", id, children, ...props }: SelecaoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  return (
    <div className={className}>
      <div className="relative rounded-campo border border-linha-forte bg-superficie focus-within:border-caneta">
        <label htmlFor={idCampo} className="absolute top-1 left-2.5 text-rotulo text-grafite-3">
          {rotulo}
        </label>
        <select
          id={idCampo}
          className="block h-12 w-full appearance-none rounded-campo bg-transparent px-2.5 pt-4 pr-8 text-corpo text-grafite outline-none"
          {...props}
        >
          {children}
        </select>
        <svg className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-grafite-2" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4.4 6.2 3.6 3.6 3.6-3.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      {ajuda && <p className="mt-1 text-mini text-grafite-2">{ajuda}</p>}
    </div>
  );
}
