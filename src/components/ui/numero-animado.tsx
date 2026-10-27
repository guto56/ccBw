"use client";

import { useEffect, useRef, useState } from "react";

/** Número com transição curta quando muda. */
export function NumeroAnimado({ valor, className = "" }: { valor: number; className?: string }) {
  const anterior = useRef(valor);
  const [chave, setChave] = useState(0);
  useEffect(() => {
    if (anterior.current !== valor) {
      anterior.current = valor;
      setChave((c) => c + 1);
    }
  }, [valor]);
  return (
    <span className={`numeros inline-block overflow-hidden align-bottom ${className}`}>
      <span key={chave} className={chave ? "numero-mudou" : ""}>
        {valor.toLocaleString("pt-BR")}
      </span>
    </span>
  );
}
