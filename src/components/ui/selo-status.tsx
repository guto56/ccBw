import { ROTULO_STATUS, type Status } from "@/lib/fiscal/tipos";
import { IconeAlerta, IconeErro, IconeRelogio } from "./icones";
import { Visto } from "./visto";

const ESTILO: Record<Status, string> = {
  aprovado: "text-caneta",
  sugerido: "text-grafite-2",
  revisar: "text-revisar-texto",
  ncm_invalido: "text-erro",
};

/** Status sempre com ícone e texto: a cor nunca vem sozinha. */
export function SeloStatus({ status, animar = false }: { status: Status; animar?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-tabela font-medium whitespace-nowrap ${ESTILO[status]}`}>
      {status === "aprovado" && <Visto animar={animar} tamanho={16} />}
      {status === "sugerido" && <IconeRelogio tamanho={14} />}
      {status === "revisar" && <IconeAlerta tamanho={14} />}
      {status === "ncm_invalido" && <IconeErro tamanho={14} />}
      {ROTULO_STATUS[status]}
    </span>
  );
}
