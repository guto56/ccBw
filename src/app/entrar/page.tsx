import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Marca } from "@/components/ui/marca";
import { ToggleTema } from "@/components/ui/toggle-tema";
import { FormEntrar } from "./form";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default function Entrar() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 md:px-6">
        <Link href="/" aria-label="Carimbo, página inicial">
          <Marca />
        </Link>
        <ToggleTema />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <div className="w-full max-w-sm">
          <h1 className="text-titulo-2 font-bold">Entrar no escritório</h1>
          <p className="mt-1 text-grafite-2">Versão de teste: use a senha única do escritório.</p>
          <Suspense>
            <FormEntrar />
          </Suspense>
          <p className="mt-8 text-mini text-grafite-2">Sugestões para revisão do contador responsável.</p>
        </div>
      </main>
    </div>
  );
}
