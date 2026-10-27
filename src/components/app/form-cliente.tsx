"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { CampoEntrada, CampoSelecao } from "@/components/ui/campo-danfe";
import { db, novoId, type Cliente } from "@/lib/local/db";
import { apenasDigitos, cnpjValido, formatarCnpj } from "@/lib/fiscal/texto";
import { SEGMENTOS, type Segmento } from "@/lib/fiscal/tipos";

function mascaraCnpj(v: string) {
  const d = apenasDigitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function FormCliente({ cliente, aoSalvar }: { cliente?: Cliente; aoSalvar?: () => void }) {
  const router = useRouter();
  const [razao, setRazao] = useState(cliente?.razaoSocial ?? "");
  const [cnpj, setCnpj] = useState(cliente ? formatarCnpj(cliente.cnpj) : "");
  const [segmento, setSegmento] = useState<Segmento>(cliente?.segmento ?? "mercado");
  const [erros, setErros] = useState<{ razao?: string; cnpj?: string }>({});
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const d = apenasDigitos(cnpj);
    const novos: typeof erros = {};
    if (razao.trim().length < 3) novos.razao = "Informe a razão social como está no cartão CNPJ.";
    if (d.length !== 14) novos.cnpj = "O CNPJ tem 14 dígitos.";
    else if (!cnpjValido(d)) novos.cnpj = "Os dígitos verificadores não conferem. Confira o CNPJ no cartão do cliente.";
    else {
      const existente = await db.clientes.where("cnpj").equals(d).first();
      if (existente && existente.id !== cliente?.id) novos.cnpj = `Este CNPJ já está cadastrado como ${existente.razaoSocial}.`;
    }
    setErros(novos);
    if (Object.keys(novos).length) return;
    setSalvando(true);
    if (cliente) {
      await db.clientes.update(cliente.id, { razaoSocial: razao.trim().toUpperCase(), cnpj: d, segmento });
      setSalvando(false);
      aoSalvar?.();
    } else {
      const id = novoId();
      await db.clientes.add({ id, razaoSocial: razao.trim().toUpperCase(), cnpj: d, segmento, criadoEm: Date.now() });
      router.push(`/app/clientes/${id}`);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-3 sm:grid-cols-6">
      <CampoEntrada
        rotulo="Razão social"
        value={razao}
        onChange={(e) => setRazao(e.target.value)}
        erro={erros.razao}
        autoComplete="organization"
        className="sm:col-span-6"
        required
      />
      <CampoEntrada
        rotulo="CNPJ"
        value={cnpj}
        onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
        erro={erros.cnpj}
        inputMode="numeric"
        codigo
        className="sm:col-span-3"
        required
      />
      <CampoSelecao rotulo="Segmento" value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)} className="sm:col-span-3" ajuda="Ajuda a interpretar descrições ambíguas, como ração.">
        {SEGMENTOS.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </CampoSelecao>
      <div className="flex gap-2 sm:col-span-6">
        <Botao type="submit" carregando={salvando}>
          {cliente ? "Salvar alterações" : "Criar cliente"}
        </Botao>
      </div>
    </form>
  );
}
