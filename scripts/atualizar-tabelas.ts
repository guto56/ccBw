/**
 * Baixa as tabelas oficiais e regenera os arquivos compactos usados pelo motor fiscal.
 *
 *   npm run atualizar-tabelas            baixa tudo de novo e regenera
 *   npm run atualizar-tabelas -- --local regenera a partir de data/fontes sem baixar
 *
 * Fontes:
 *  - NCM vigente: Portal Único Siscomex (Classif), JSON público.
 *  - Tabela cClassTrib + CST do IBS/CBS com os anexos da LC 214/2025 por NCM:
 *    Portal da Conformidade Fácil (SVRS), página pública da Classificação Tributária,
 *    que publica a mesma tabela do Informe Técnico 2025.002 do Portal Nacional da NF-e.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..");
const FONTES = join(RAIZ, "data", "fontes");
const SAIDA = join(RAIZ, "src", "data");

const URL_NCM = "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";
const URL_CCLASSTRIB = "https://dfe-portal.svrs.rs.gov.br/DFE/ClassificacaoTributaria";

const local = process.argv.includes("--local");

type NcmBruto = {
  Data_Ultima_Atualizacao_NCM: string;
  Ato: string;
  Nomenclaturas: { Codigo: string; Descricao: string; Data_Inicio: string; Data_Fim: string }[];
};

type AnexoBruto = {
  NroAnexo: number | null;
  CodNcmNbs: string;
  TipoCodigo: string;
  TipoPermissao: "PERMITIDO" | "VEDADO";
  DescCondicao: string | null;
  DescExcecao: string | null;
  Observacao: string | null;
  DthIniVig: string | null;
  DthFimVig: string | null;
  DescItemAnexo: string | null;
  DescAnexo: string | null;
};

type ClassTribBruto = {
  CodClassTrib: string;
  NomeClassTrib: string;
  PercRedIbs: number;
  PercRedCbs: number;
  DthPublicacao: string;
  DthIniVig: string | null;
  DthFimVig: string | null;
  Cst: string;
  NroAnexo: number | null;
  TexUrlLegislacao: string | null;
  IndNfe: boolean;
  IndNfce: boolean;
  Anexos: AnexoBruto[] | null;
};

type CstBruto = {
  Cst: string;
  NomeCst: string;
  DthFimVig: string | null;
  ClassificacoesTributarias: ClassTribBruto[];
};

async function baixar(url: string): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${r.status}`);
  return r.text();
}

function dataBr(d: string): string {
  // dd/mm/aaaa -> aaaa-mm-dd
  const [dia, mes, ano] = d.split("/");
  return `${ano}-${mes}-${dia}`;
}

function extrairDadosSvrs(html: string): CstBruto[] {
  const marcador = "var dadosOriginais = ";
  const i = html.indexOf(marcador);
  if (i < 0) throw new Error("A página do SVRS mudou: não encontrei 'dadosOriginais'.");
  // Lê um array JSON balanceado a partir do marcador, respeitando strings.
  const ini = i + marcador.length;
  let prof = 0;
  let emString = false;
  let escape = false;
  for (let j = ini; j < html.length; j++) {
    const c = html[j];
    if (emString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === "[" || c === "{") prof++;
    else if (c === "]" || c === "}") {
      prof--;
      if (prof === 0) return JSON.parse(html.slice(ini, j + 1));
    }
  }
  throw new Error("JSON da tabela cClassTrib incompleto.");
}

async function main() {
  mkdirSync(FONTES, { recursive: true });
  mkdirSync(SAIDA, { recursive: true });
  const agora = new Date().toISOString();

  // NCM
  let ncmTexto: string;
  const arqNcm = join(FONTES, "ncm.json");
  if (local && existsSync(arqNcm)) ncmTexto = readFileSync(arqNcm, "utf8");
  else {
    ncmTexto = await baixar(URL_NCM);
    writeFileSync(arqNcm, ncmTexto);
  }
  const ncm: NcmBruto = JSON.parse(ncmTexto);

  // cClassTrib
  const arqCt = join(FONTES, "cclasstrib-svrs.json");
  let cts: CstBruto[];
  if (local && existsSync(arqCt)) cts = JSON.parse(readFileSync(arqCt, "utf8"));
  else {
    const html = await baixar(URL_CCLASSTRIB);
    cts = extrairDadosSvrs(html);
    writeFileSync(arqCt, JSON.stringify(cts));
  }

  // --- NCM compacto: códigos de 8 dígitos vigentes + descrições da hierarquia
  const hoje = new Date().toISOString().slice(0, 10);
  const itens: Record<string, [string, string, string]> = {};
  const hierarquia: Record<string, string> = {};
  for (const n of ncm.Nomenclaturas) {
    const cod = n.Codigo.replace(/\D/g, "");
    const fim = dataBr(n.Data_Fim);
    if (cod.length === 8) itens[cod] = [n.Descricao, dataBr(n.Data_Inicio), fim];
    else if (fim >= hoje) hierarquia[cod] = n.Descricao;
  }
  const ncmSaida = {
    versao: ncm.Data_Ultima_Atualizacao_NCM,
    ato: ncm.Ato,
    baixadoEm: agora,
    itens,
    hierarquia,
  };
  writeFileSync(join(SAIDA, "ncm.json"), JSON.stringify(ncmSaida));

  // --- cClassTrib compacto + anexos por NCM
  const classificacoes: Record<string, unknown>[] = [];
  const anexosPorNcm: Record<string, unknown[]> = {};
  let maiorPublicacao = "";
  for (const cst of cts) {
    for (const ct of cst.ClassificacoesTributarias) {
      if (ct.DthPublicacao > maiorPublicacao) maiorPublicacao = ct.DthPublicacao;
      classificacoes.push({
        cClassTrib: ct.CodClassTrib,
        cst: ct.Cst,
        nomeCst: cst.NomeCst,
        nome: ct.NomeClassTrib,
        pRedIBS: ct.PercRedIbs,
        pRedCBS: ct.PercRedCbs,
        anexo: ct.NroAnexo,
        url: ct.TexUrlLegislacao,
        nfe: ct.IndNfe,
        nfce: ct.IndNfce,
        inicio: ct.DthIniVig?.slice(0, 10) ?? null,
        fim: ct.DthFimVig?.slice(0, 10) ?? null,
      });
      for (const a of ct.Anexos ?? []) {
        if (a.TipoCodigo !== "NCM") continue;
        if (a.DthFimVig && a.DthFimVig.slice(0, 10) < hoje) continue;
        const cod = a.CodNcmNbs.replace(/\D/g, "");
        (anexosPorNcm[cod] ??= []).push({
          c: ct.CodClassTrib,
          anexo: a.NroAnexo,
          perm: a.TipoPermissao === "PERMITIDO" ? 1 : 0,
          cond: a.DescCondicao,
          exc: a.DescExcecao,
          obs: a.Observacao,
          item: a.DescItemAnexo,
          titulo: a.DescAnexo,
          inicio: a.DthIniVig?.slice(0, 10) ?? null,
        });
      }
    }
  }
  const ctSaida = {
    fonte: URL_CCLASSTRIB,
    publicacaoMaisRecente: maiorPublicacao.slice(0, 10),
    baixadoEm: agora,
    classificacoes,
  };
  writeFileSync(join(SAIDA, "cclasstrib.json"), JSON.stringify(ctSaida));
  writeFileSync(join(SAIDA, "anexos-ncm.json"), JSON.stringify(anexosPorNcm));

  const versoes = {
    ncm: { url: URL_NCM, versao: ncm.Data_Ultima_Atualizacao_NCM, ato: ncm.Ato, baixadoEm: agora, itens8: Object.keys(itens).length },
    cclasstrib: {
      url: URL_CCLASSTRIB,
      publicacaoMaisRecente: maiorPublicacao.slice(0, 10),
      baixadoEm: agora,
      csts: cts.length,
      codigos: classificacoes.length,
      ncmsComAnexo: Object.keys(anexosPorNcm).length,
    },
  };
  writeFileSync(join(FONTES, "versoes.json"), JSON.stringify(versoes, null, 2));
  console.log(JSON.stringify(versoes, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
