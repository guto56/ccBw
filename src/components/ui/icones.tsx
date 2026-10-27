import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { tamanho?: number };

function Base({ tamanho = 16, children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  );
}

export const IconeVisto = (p: P) => (
  <Base {...p}>
    <path d="M3 8.6 6.3 11.6 13 4.4" />
  </Base>
);
export const IconeAlerta = (p: P) => (
  <Base {...p}>
    <path d="M8 2.2 14.3 13H1.7L8 2.2Z" />
    <path d="M8 6.4v3.1" />
    <path d="M8 11.4h.01" strokeWidth={2.2} />
  </Base>
);
export const IconeErro = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
  </Base>
);
export const IconeRelogio = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.6V8l2.2 1.4" />
  </Base>
);
export const IconeLapis = (p: P) => (
  <Base {...p}>
    <path d="M10.6 2.8 13.2 5.4 5.6 13H3v-2.6l7.6-7.6Z" />
    <path d="m9.2 4.2 2.6 2.6" />
  </Base>
);
export const IconeBusca = (p: P) => (
  <Base {...p}>
    <circle cx="7" cy="7" r="4.4" />
    <path d="m10.3 10.3 3.2 3.2" />
  </Base>
);
export const IconePasta = (p: P) => (
  <Base {...p}>
    <path d="M1.8 4.2c0-.6.4-1 1-1h3.1l1.4 1.5h5.9c.6 0 1 .4 1 1v6.6c0 .6-.4 1-1 1H2.8c-.6 0-1-.4-1-1V4.2Z" />
  </Base>
);
export const IconeSol = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.6v1.3M8 13.1v1.3M1.6 8h1.3M13.1 8h1.3M3.5 3.5l.9.9M11.6 11.6l.9.9M3.5 12.5l.9-.9M11.6 4.4l.9-.9" />
  </Base>
);
export const IconeLua = (p: P) => (
  <Base {...p}>
    <path d="M13.2 9.6A5.6 5.6 0 1 1 6.4 2.8a4.5 4.5 0 0 0 6.8 6.8Z" />
  </Base>
);
export const IconeEnviar = (p: P) => (
  <Base {...p}>
    <path d="M9.4 1.8H4c-.6 0-1 .4-1 1v10.4c0 .6.4 1 1 1h8c.6 0 1-.4 1-1V5.4L9.4 1.8Z" />
    <path d="M9.2 1.8v3.6H13" />
    <path d="M8 12V7.6M6.2 9.3 8 7.5l1.8 1.8" />
  </Base>
);
export const IconeBaixar = (p: P) => (
  <Base {...p}>
    <path d="M8 2.2v8M4.8 7.2 8 10.4l3.2-3.2" />
    <path d="M2.6 11.4v1.4c0 .6.4 1 1 1h8.8c.6 0 1-.4 1-1v-1.4" />
  </Base>
);
export const IconeSair = (p: P) => (
  <Base {...p}>
    <path d="M6.2 13.6H3.4c-.6 0-1-.4-1-1V3.4c0-.6.4-1 1-1h2.8" />
    <path d="M10.4 11.2 13.6 8l-3.2-3.2M13.4 8H6.4" />
  </Base>
);
export const IconeMais = (p: P) => (
  <Base {...p}>
    <path d="M8 3v10M3 8h10" />
  </Base>
);
export const IconeTeclado = (p: P) => (
  <Base {...p}>
    <rect x="1.6" y="4" width="12.8" height="8" rx="1" />
    <path d="M4 6.6h.01M6.4 6.6h.01M8.8 6.6h.01M11.2 6.6h.01M4.8 9.4h6.4" strokeWidth={1.8} />
  </Base>
);
export const IconeCadeado = (p: P) => (
  <Base {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1" />
    <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" />
  </Base>
);
export const IconeLixeira = (p: P) => (
  <Base {...p}>
    <path d="M2.6 4.2h10.8M6.2 4.2V2.6h3.6v1.6M4 4.2l.6 9.2h6.8l.6-9.2" />
  </Base>
);
export const IconeSetaBaixo = (p: P) => (
  <Base {...p}>
    <path d="m4.4 6.2 3.6 3.6 3.6-3.6" />
  </Base>
);
