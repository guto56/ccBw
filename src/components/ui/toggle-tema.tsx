"use client";

import { IconeLua, IconeSol } from "./icones";

function temaAtual(): "light" | "dark" {
  const d = document.documentElement.dataset.theme;
  if (d === "light" || d === "dark") return d;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Alterna claro/escuro. O ícone certo aparece via CSS, sem esperar a hidratação. */
export function ToggleTema({ className = "" }: { className?: string }) {
  function alternar() {
    const novo = temaAtual() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try {
      localStorage.setItem("carimbo-tema", novo);
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Alternar tema claro ou escuro"
      title="Alternar tema"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-campo border border-transparent text-grafite-2 hover:border-linha hover:text-grafite ${className}`}
    >
      <IconeLua className="tema-icone-lua" />
      <IconeSol className="tema-icone-sol" />
    </button>
  );
}
