"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { CampoEntrada } from "@/components/ui/campo-danfe";

export function FormEntrar() {
  const router = useRouter();
  const params = useSearchParams();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!senha) return setErro("Digite a senha do escritório.");
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErro(j.erro ?? "Não foi possível entrar. Tente de novo.");
        setEnviando(false);
        return;
      }
      const para = params.get("para");
      router.replace(para && para.startsWith("/app") ? para : "/app");
    } catch {
      setErro("Sem conexão com o servidor. Confira a internet e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-6 space-y-3" noValidate>
      <CampoEntrada rotulo="Senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} erro={erro} autoFocus />
      <Botao type="submit" carregando={enviando} className="w-full">
        Entrar
      </Botao>
    </form>
  );
}
