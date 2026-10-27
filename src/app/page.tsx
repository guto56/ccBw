import Link from "next/link";
import { DemoDanfe } from "@/components/landing/demo";
import { classesBotao } from "@/components/ui/botao";
import { Furos } from "@/components/ui/furos";
import { Marca } from "@/components/ui/marca";
import { ToggleTema } from "@/components/ui/toggle-tema";
import { VERSOES } from "@/lib/fiscal/tabelas";

const PASSOS = [
  {
    t: "Cadastre o cliente",
    d: "Razão social, CNPJ e segmento: mercado, farmácia, pet shop ou agropecuária. O segmento ajuda a ler descrições como “ração 25 kg”.",
  },
  {
    t: "Envie as notas ou a planilha",
    d: "Arraste os XMLs de saída, um .zip com eles ou a planilha de produtos do ERP. O Carimbo junta os produtos repetidos e valida cada NCM na tabela vigente.",
  },
  {
    t: "Revise linha a linha",
    d: "Cada sugestão traz tratamento, CST, cClassTrib, confiança, o motivo em uma frase e o anexo da LC 214/2025. Aprove com a tecla a, edite com e.",
  },
  {
    t: "Baixe a planilha e o relatório",
    d: "XLSX ou CSV com NCM, CST e cClassTrib para o cliente importar no emissor, e um PDF do lote com o resumo e os itens que ainda pedem revisão.",
  },
];

const PERGUNTAS = [
  {
    p: "O Carimbo decide a classificação por mim?",
    r: "Não. Ele sugere, mostra o motivo e a fonte, e você decide. Nada é aprovado sem a sua confirmação, e itens que dependeram da IA ficam marcados para revisão.",
  },
  {
    p: "De onde vêm os códigos?",
    r: `Da tabela NCM do Siscomex (${VERSOES.ncm}) e da tabela oficial de classificação tributária do IBS/CBS, que relaciona cada NCM aos anexos da LC 214/2025 (${VERSOES.cclasstrib}). Nenhum código é escrito de memória.`,
  },
  {
    p: "Onde a IA entra?",
    r: "Só depois das regras e só em três casos: NCM ausente ou inválido (a IA sugere um NCM), condição de anexo que depende da descrição (ração para gado ou para pet?) e descrição vaga demais. Tudo o que passa pela IA fica em “revisar”.",
  },
  {
    p: "E se o NCM do cadastro estiver errado?",
    r: "O item aparece como NCM inválido, com o motivo (não existe, saiu de vigência, tem menos de 8 dígitos) e, quando possível, um NCM sugerido. Você corrige na própria linha e o Carimbo reclassifica.",
  },
  {
    p: "Quando o Simples e o MEI precisam informar o cClassTrib?",
    r: "A LC 214/2025 prevê IBS e CBS para optantes do Simples a partir de 2027. A data de validação do grupo IBS/CBS na NF-e para CRT 1 e 4 está como “implementação futura” na NT 2025.002 mais recente, então vale preparar o cadastro antes de a rejeição entrar em vigor.",
  },
  {
    p: "Medicamentos entram como alíquota zero?",
    r: "Medicamentos registrados na Anvisa têm redução de 60% (art. 133), salvo os do Anexo XIV, que têm alíquota zero. Como o Anexo XIV lista princípios ativos, o Carimbo sugere a redução de 60% com confiança média e avisa para conferir o anexo.",
  },
];

export default function Inicio() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" aria-label="Carimbo, página inicial">
          <Marca />
        </Link>
        <nav aria-label="Seções" className="hidden items-center gap-6 text-tabela text-grafite-2 md:flex">
          <a href="#como-funciona" className="hover:text-grafite">
            Como funciona
          </a>
          <a href="#privacidade" className="hover:text-grafite">
            Privacidade
          </a>
          <a href="#precos" className="hover:text-grafite">
            Preços
          </a>
          <a href="#perguntas" className="hover:text-grafite">
            Perguntas
          </a>
        </nav>
        <div className="flex items-center gap-1">
          <ToggleTema />
          <Link href="/app" className={classesBotao("secundario", "p")}>
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-10 px-4 pt-8 pb-16 md:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-16">
          <div className="lg:pt-6">
            <h1 className="text-display font-bold tracking-[-0.025em] text-balance">Produtos do cliente do Simples classificados para o IBS e a CBS.</h1>
            <p className="medida mt-5 text-titulo-3 text-grafite-2">
              Suba os XMLs de saída ou a planilha do ERP. O Carimbo valida o NCM, sugere CST e cClassTrib com a fonte legal de cada linha e devolve a planilha pronta para importar no emissor.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/app" className={classesBotao("primario", "g")}>
                Classificar produtos
              </Link>
              <a href="#como-funciona" className={classesBotao("secundario", "g")}>
                Como funciona
              </a>
            </div>
            <p className="mt-5 text-tabela text-grafite-2">Sugestões para revisão do contador responsável.</p>
          </div>
          <DemoDanfe />
        </section>

        <section id="como-funciona" className="border-t border-linha bg-papel-2">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 className="text-titulo-1 font-bold tracking-[-0.015em]">Como funciona</h2>
            <p className="medida mt-2 text-grafite-2">Regras primeiro, IA só onde há dúvida, e a decisão sempre com o contador.</p>
            <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {PASSOS.map((p, i) => (
                <li key={p.t} className="border-t-2 border-grafite pt-4">
                  <span className="numeros text-titulo-2 font-bold text-caneta">{i + 1}</span>
                  <h3 className="mt-1 text-titulo-3 font-bold">{p.t}</h3>
                  <p className="mt-2 text-grafite-2">{p.d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div>
                <h3 className="text-titulo-2 font-bold">Onde o erro custa dinheiro</h3>
                <p className="medida mt-2 text-grafite-2">
                  Mercado, farmácia, pet shop e agropecuária concentram os itens com alíquota zero e redução de 60%. São também os itens em que a mesma NCM muda de tratamento conforme a descrição.
                </p>
              </div>
              <div className="flex overflow-hidden rounded-campo border border-linha bg-superficie">
                <Furos />
                <table className="w-full text-tabela">
                  <caption className="sr-only">Exemplos de casos que o motor resolve</caption>
                  <thead>
                    <tr className="h-9 border-b border-linha text-left text-rotulo text-grafite-3">
                      <th className="px-3 font-normal">Produto</th>
                      <th className="px-3 font-normal">O que decide</th>
                      <th className="px-3 font-normal">Tratamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Ração para bovinos, 2309.90.10", "Animal de produção: Anexo IX", "Redução 60%"],
                      ["Ração para cães, 2309.10.00", "Animal doméstico é exceção", "Integral"],
                      ["Pão francês, 1905.90.90", "Item do Anexo I", "Alíquota zero"],
                      ["Biscoito, 1905.90.90", "Mesmo NCM, fora do item", "Integral, revisar"],
                      ["Absorvente, 9619.00.00", "Art. 147", "Alíquota zero"],
                      ["Fralda, 9619.00.00", "Anexo VIII", "Redução 60%"],
                    ].map(([a, b, c], i) => (
                      <tr key={a} className={`h-9 ${i % 2 === 0 ? "bg-faixa" : ""}`}>
                        <td className="px-3">{a}</td>
                        <td className="px-3 text-grafite-2">{b}</td>
                        <td className={`px-3 whitespace-nowrap ${c.startsWith("Integral") ? "" : "font-medium text-ok-texto"}`}>{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="privacidade" className="border-t border-linha">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <h2 className="text-titulo-1 font-bold tracking-[-0.015em]">O XML não sai do seu computador</h2>
              <p className="medida mt-3 text-grafite-2">
                A leitura das notas acontece no navegador. Destinatário, CPF, valores e chave de acesso ficam onde estão. Para classificar, o servidor recebe só a lista de produtos, sem nada que identifique o consumidor final.
              </p>
              <p className="medida mt-3 text-grafite-2">Isso também acaba com o limite de upload: um .zip com milhares de notas é lido na sua máquina.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <figure className="rounded-campo border border-linha bg-superficie p-3">
                <figcaption className="text-tabela font-medium">Fica no navegador</figcaption>
                <ul className="mt-2 space-y-px text-tabela">
                  {["Destinatário e CPF/CNPJ", "Endereço e e-mail", "Valores e pagamentos", "Chave de acesso e protocolo", "O arquivo XML inteiro"].map((x) => (
                    <li key={x} className="rounded-campo border border-linha px-2.5 py-1.5 text-grafite-2">
                      {x}
                    </li>
                  ))}
                </ul>
              </figure>
              <figure className="rounded-campo border border-caneta/50 bg-superficie p-3">
                <figcaption className="text-tabela font-medium">Vai para a classificação</figcaption>
                <ul className="mt-2 space-y-px text-tabela">
                  {[
                    ["cProd", "código do produto"],
                    ["xProd", "descrição"],
                    ["NCM", "8 dígitos"],
                    ["CEST", "quando houver"],
                    ["CFOP", "da saída"],
                    ["cEAN", "código de barras"],
                    ["uCom", "unidade"],
                  ].map(([c, d]) => (
                    <li key={c} className="flex items-baseline justify-between gap-2 rounded-campo border border-linha px-2.5 py-1.5">
                      <span className="codigo">{c}</span>
                      <span className="text-mini text-grafite-2">{d}</span>
                    </li>
                  ))}
                </ul>
              </figure>
            </div>
          </div>
        </section>

        <section id="precos" className="border-t border-linha bg-papel-2">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 className="text-titulo-1 font-bold tracking-[-0.015em]">Preços</h2>
            <p className="medida mt-2 text-grafite-2">Durante o teste, o uso é livre e o pagamento está desligado.</p>
            <div className="mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
              {[
                { nome: "Avulso", preco: "R$ 49", unidade: "por CNPJ", texto: "Um cliente, lotes ilimitados até a virada de 2027. Bom para testar com o cliente mais complicado do escritório." },
                { nome: "Escritório", preco: "R$ 297", unidade: "por mês, até 20 CNPJs", texto: "Para quem vai preparar a carteira inteira do Simples. Planilhas, relatórios e revisões sem limite." },
              ].map((p) => (
                <div key={p.nome} className="rounded-campo border border-linha-forte bg-superficie p-5">
                  <h3 className="text-titulo-3 font-bold">{p.nome}</h3>
                  <p className="mt-3">
                    <span className="numeros text-titulo-1 font-bold">{p.preco}</span> <span className="text-grafite-2">{p.unidade}</span>
                  </p>
                  <p className="mt-2 text-grafite-2">{p.texto}</p>
                  <button type="button" disabled className={classesBotao("secundario", "m", "mt-5 w-full")}>
                    Em breve
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="perguntas" className="border-t border-linha">
          <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
            <h2 className="text-titulo-1 font-bold tracking-[-0.015em]">Perguntas frequentes</h2>
            <div className="mt-6 divide-y divide-linha border-y border-linha">
              {PERGUNTAS.map((q) => (
                <details key={q.p} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                    {q.p}
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-grafite-2 transition-transform group-open:rotate-180">
                      <path d="m4.4 6.2 3.6 3.6 3.6-3.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <p className="medida pb-4 text-grafite-2">{q.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-linha bg-papel-2">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-tabela text-grafite-2 md:flex-row md:items-start md:justify-between md:px-6">
          <div className="max-w-xl space-y-2">
            <Marca tamanho={22} />
            <p>Sugestões para revisão do contador responsável. O Carimbo não substitui a análise profissional nem constitui consultoria tributária.</p>
            <p className="text-mini">
              Fontes: {VERSOES.ncm}; {VERSOES.cclasstrib}; LC 214/2025.
            </p>
          </div>
          <nav aria-label="Rodapé" className="flex gap-4">
            <Link href="/termos" className="text-caneta underline">
              Termos de uso
            </Link>
            <Link href="/app" className="text-caneta underline">
              Entrar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
