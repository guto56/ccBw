import { useEffect, useState, type ReactNode } from "react";

export function navigate(to: string) {
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname + location.hash);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.hash);
    window.addEventListener("popstate", on);
    window.addEventListener("hashchange", on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener("hashchange", on);
    };
  }, []);
  return path;
}

export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <header className="wrap flex items-center justify-between gap-4 py-5">
        <a href="/" className="font-display lead no-underline">
          ContraMulta
        </a>
        <nav aria-label="Principal" className="small flex gap-5">
          <a href="/#como-funciona" className="no-underline hover:underline">
            Como funciona
          </a>
          <a href="/frotas" className="no-underline hover:underline">
            Frotas
          </a>
        </nav>
      </header>
      <main className={`wrap pb-24 pt-6 ${wide ? "" : "max-w-[1040px]"}`}>{children}</main>
      <footer className="wrap pb-8 pt-16">
        <div className="grid gap-2 small sm:grid-cols-[1fr_auto_1fr] sm:gap-6">
          <p className="muted">ContraMulta, defesa de multa de trânsito</p>
          <p className="flex flex-wrap gap-6">
            <a href="/termos">Termos de uso</a>
            <a href="/privacidade">Privacidade</a>
          </p>
          <p className="muted sm:text-right">Não somos órgão público.</p>
        </div>
      </footer>
    </>
  );
}

export function Stages({ current }: { current: number }) {
  const names = ["Envio", "Conferência", "Diagnóstico", "Pagamento", "Peça"];
  return (
    <ol aria-label="Etapas" className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 small">
      {names.map((n, i) => (
        <li key={n} aria-current={i === current ? "step" : undefined} className={i === current ? "font-semibold text-ink" : i < current ? "text-ink" : "muted"}>
          {n}
        </li>
      ))}
    </ol>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="panel mt-6" style={{ borderLeft: "6px solid var(--accent)" }}>
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <button className="btn btn-quiet mt-4" onClick={onRetry} type="button">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Working({ title, detail }: { title: string; detail?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-16">
      <p className="app-title">{title}</p>
      {detail && <p className="mt-4 max-w-[48ch] muted">{detail}</p>}
      <div className="mt-8 h-1 w-full max-w-[420px] overflow-hidden bg-surface-2" aria-hidden="true">
        <div className="h-full w-1/3 bg-ink" style={{ animation: "working 1.2s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes working{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media (prefers-reduced-motion: reduce){[style*="working"]{animation:none!important}}`}</style>
    </div>
  );
}

export function Field(props: {
  id: string;
  label: string;
  hint?: string;
  lowConfidence?: boolean;
  children: ReactNode;
}) {
  const hintId = props.hint || props.lowConfidence ? `${props.id}-hint` : undefined;
  return (
    <div className={`field ${props.lowConfidence ? "low-confidence" : ""}`}>
      <label htmlFor={props.id}>{props.label}</label>
      {props.children}
      {(props.hint || props.lowConfidence) && (
        <p id={hintId} className="hint">
          {props.lowConfidence ? "Confira este campo: a leitura teve baixa confiança. " : ""}
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
