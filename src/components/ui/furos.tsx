import { useId } from "react";

/**
 * Margem de formulário contínuo: furos de tração a cada 36px e a linha picotada.
 * `deslizando` anima a margem como se o papel estivesse saindo da impressora.
 */
export function Furos({ deslizando = false, className = "", absoluto = false }: { deslizando?: boolean; className?: string; absoluto?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <div aria-hidden="true" className={`pointer-events-none ${absoluto ? "absolute top-0 bottom-0 left-0" : "relative"} w-[22px] shrink-0 overflow-hidden ${className}`}>
      <svg className={`absolute inset-x-0 -top-[144px] h-[calc(100%+144px)] w-full ${deslizando ? "margem-deslizando" : ""}`}>
        <defs>
          <pattern id={`furo-${id}`} width="22" height="36" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="18" r="4.4" className="margem-perfurada-furo" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#furo-${id})`} />
      </svg>
      <div className="perfuracao absolute top-0 right-0 bottom-0 w-px" />
    </div>
  );
}
