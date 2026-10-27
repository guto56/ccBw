import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/ui/marca";
import { VERSOES } from "@/lib/fiscal/tabelas";

export const metadata: Metadata = { title: "Termos de uso" };

export default function Termos() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link href="/" aria-label="Carimbo, página inicial">
        <Marca />
      </Link>
      <h1 className="mt-10 text-titulo-1 font-bold">Termos de uso</h1>
      <p className="mt-2 text-grafite-2">Versão de teste, outubro de 2026.</p>
      <div className="medida mt-8 space-y-6">
        <section>
          <h2 className="text-titulo-3 font-bold">1. Sugestões para revisão do contador responsável</h2>
          <p className="mt-2 text-grafite-2">
            O Carimbo sugere NCM, CST e cClassTrib do IBS e da CBS a partir das tabelas oficiais e da Lei Complementar nº 214/2025. As sugestões não constituem consultoria tributária. A decisão sobre a classificação e a responsabilidade por ela são do contador ou do contribuinte que a adotar.
          </p>
        </section>
        <section>
          <h2 className="text-titulo-3 font-bold">2. Inteligência artificial</h2>
          <p className="mt-2 text-grafite-2">
            Em casos de NCM inválido, condição de anexo ambígua ou descrição vaga, o Carimbo consulta um modelo de IA. Toda sugestão que dependeu da IA é marcada para revisão e nunca é aprovada automaticamente.
          </p>
        </section>
        <section>
          <h2 className="text-titulo-3 font-bold">3. Dados</h2>
          <p className="mt-2 text-grafite-2">
            Os XMLs e planilhas são lidos no navegador. Os cadastros de clientes, lotes e classificações ficam armazenados neste navegador (IndexedDB). Para classificar, o servidor recebe apenas código, descrição, NCM, CEST, CFOP, EAN e unidade de cada produto. Dados de destinatário não são lidos nem enviados. Respostas da IA ficam em cache por NCM e descrição para reduzir custo, sem identificar o cliente.
          </p>
        </section>
        <section>
          <h2 className="text-titulo-3 font-bold">4. Tabelas usadas</h2>
          <p className="mt-2 text-grafite-2">
            {VERSOES.ncm}. {VERSOES.cclasstrib}. As tabelas oficiais mudam; confira a data da versão antes de usar o resultado.
          </p>
        </section>
        <section>
          <h2 className="text-titulo-3 font-bold">5. Teste</h2>
          <p className="mt-2 text-grafite-2">Durante o período de teste o acesso é por senha única, sem cobrança, e o serviço pode ficar indisponível ou mudar sem aviso.</p>
        </section>
      </div>
    </div>
  );
}
