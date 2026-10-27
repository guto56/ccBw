/**
 * Gera dados de teste realistas em fixtures/:
 *  - três clientes fictícios (mercadinho, farmácia, pet shop), cada um com 30 XMLs de NF-e/NFC-e
 *    layout 4.00 (emitente CRT 1, Simples Nacional), um .zip com os XMLs e um XML que não é NF-e;
 *  - uma planilha CSV (separador ;) e uma XLSX de produtos exportadas de "ERP".
 * Catálogos em scripts/catalogos/*.json: [descrição, NCM, EAN, CEST]. NCMs errados, ausentes e
 * descrições vagas estão lá de propósito.
 *
 *   npm run fixtures
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import * as XLSX from "xlsx";

const RAIZ = join(__dirname, "..");
const SAIDA = join(RAIZ, "fixtures");

type Item = [string, string, string, string];

// Gerador pseudoaleatório com semente fixa: as fixtures são reproduzíveis.
function rng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function cnpjComDv(base12: string): string {
  const calc = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = b.split("").reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12);
  return `${base12}${d1}${calc(base12 + d1)}`;
}

function dvChave(c43: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = c43.length - 1; i >= 0; i--) {
    soma += Number(c43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Cliente {
  pasta: string;
  razao: string;
  fantasia: string;
  cnpj: string;
  municipio: string;
  cMun: string;
  uf: string;
  cUF: string;
  catalogo: Item[];
  semente: number;
  modeloPadrao: "55" | "65";
}

const CLIENTES: Cliente[] = [
  {
    pasta: "mercadinho-boa-vista",
    razao: "MERCADINHO BOA VISTA LTDA",
    fantasia: "Mercadinho Boa Vista",
    cnpj: cnpjComDv("123456780001"),
    municipio: "Ribeirão Preto",
    cMun: "3543402",
    uf: "SP",
    cUF: "35",
    catalogo: JSON.parse(readFileSync(join(__dirname, "catalogos", "mercado.json"), "utf8")),
    semente: 11,
    modeloPadrao: "65",
  },
  {
    pasta: "farmacia-sao-lucas",
    razao: "FARMACIA SAO LUCAS ME",
    fantasia: "Farmácia São Lucas",
    cnpj: cnpjComDv("234567890001"),
    municipio: "Londrina",
    cMun: "4113700",
    uf: "PR",
    cUF: "41",
    catalogo: JSON.parse(readFileSync(join(__dirname, "catalogos", "farmacia.json"), "utf8")),
    semente: 22,
    modeloPadrao: "65",
  },
  {
    pasta: "pet-e-agro-rancho-alegre",
    razao: "RANCHO ALEGRE PET E AGROPECUARIA LTDA",
    fantasia: "Rancho Alegre Pet e Agro",
    cnpj: cnpjComDv("345678900001"),
    municipio: "Uberaba",
    cMun: "3170107",
    uf: "MG",
    cUF: "31",
    catalogo: JSON.parse(readFileSync(join(__dirname, "catalogos", "petshop.json"), "utf8")),
    semente: 33,
    modeloPadrao: "55",
  },
];


function unidadeDe(desc: string): string {
  if (/\bKG\b$/.test(desc) && !/\d/.test(desc.split(" ").slice(-1)[0])) return "KG";
  if (/ KG$/.test(desc)) return "KG";
  return "UN";
}

function xmlNota(cli: Cliente, n: number, itens: { cod: string; item: Item; q: number; v: number }[], modelo: "55" | "65", data: Date, comDest: boolean): string {
  const aamm = `${String(data.getFullYear()).slice(2)}${String(data.getMonth() + 1).padStart(2, "0")}`;
  const serie = "001";
  const nNF = String(n).padStart(9, "0");
  const cNF = String(10000000 + n * 7919).slice(-8);
  const c43 = `${cli.cUF}${aamm}${cli.cnpj}${modelo}${serie}${nNF}1${cNF}`;
  const chave = `${c43}${dvChave(c43)}`;
  const dh = data.toISOString().replace(/\.\d{3}Z$/, "-03:00");
  const total = itens.reduce((s, i) => s + i.q * i.v, 0);

  const det = itens
    .map((i, idx) => {
      const [desc, ncm, ean, cest] = i.item;
      const vProd = (i.q * i.v).toFixed(2);
      const uCom = unidadeDe(desc);
      return `<det nItem="${idx + 1}"><prod><cProd>${i.cod}</cProd><cEAN>${ean || "SEM GTIN"}</cEAN><xProd>${esc(desc)}</xProd>${
        ncm ? `<NCM>${ncm}</NCM>` : ""
      }${cest && cest.trim() ? `<CEST>${cest}</CEST>` : ""}<CFOP>${modelo === "65" ? "5102" : "5102"}</CFOP><uCom>${uCom}</uCom><qCom>${i.q.toFixed(4)}</qCom><vUnCom>${i.v.toFixed(
        2,
      )}</vUnCom><vProd>${vProd}</vProd><cEANTrib>${ean || "SEM GTIN"}</cEANTrib><uTrib>${uCom}</uTrib><qTrib>${i.q.toFixed(4)}</qTrib><vUnTrib>${i.v.toFixed(
        2,
      )}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>99</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>`;
    })
    .join("");

  const dest = comDest
    ? `<dest><CPF>12345678909</CPF><xNome>CONSUMIDOR DE TESTE DA SILVA</xNome><enderDest><xLgr>RUA DAS FLORES</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>${cli.cMun}</cMun><xMun>${esc(
        cli.municipio.toUpperCase(),
      )}</xMun><UF>${cli.uf}</UF><CEP>14000000</CEP></enderDest><indIEDest>9</indIEDest><email>consumidor@example.com</email></dest>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${chave}"><ide><cUF>${cli.cUF}</cUF><cNF>${cNF}</cNF><natOp>VENDA</natOp><mod>${modelo}</mod><serie>1</serie><nNF>${n}</nNF><dhEmi>${dh}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${cli.cMun}</cMunFG><tpImp>${
    modelo === "65" ? 4 : 1
  }</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>ERP 2.4</verProc></ide><emit><CNPJ>${
    cli.cnpj
  }</CNPJ><xNome>${esc(cli.razao)}</xNome><xFant>${esc(cli.fantasia)}</xFant><enderEmit><xLgr>AVENIDA BRASIL</xLgr><nro>${100 + n}</nro><xBairro>CENTRO</xBairro><cMun>${cli.cMun}</cMun><xMun>${esc(
    cli.municipio.toUpperCase(),
  )}</xMun><UF>${cli.uf}</UF><CEP>14000000</CEP></enderEmit><IE>123456789</IE><CRT>1</CRT></emit>${dest}${det}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>${total.toFixed(
    2,
  )}</vProd><vNF>${total.toFixed(2)}</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag><detPag><tPag>01</tPag><vPag>${total.toFixed(
    2,
  )}</vPag></detPag></pag></infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>${dh}</dhRecbto><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
}

async function main() {
  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });
  const resumo: string[] = [];

  for (const cli of CLIENTES) {
    const r = rng(cli.semente);
    const dir = join(SAIDA, cli.pasta);
    mkdirSync(dir, { recursive: true });
    const zip = new JSZip();
    const codigos = cli.catalogo.map((_, i) => String(1000 + i * 7));
    const precos = cli.catalogo.map(() => Math.round((2 + r() * 120) * 100) / 100);

    // Garante que todo produto aparece pelo menos uma vez, e espalha o resto.
    const fila = cli.catalogo.map((_, i) => i).sort(() => r() - 0.5);
    for (let n = 1; n <= 30; n++) {
      const qtd = 3 + Math.floor(r() * 10);
      const escolhidos = new Set<number>();
      while (fila.length && escolhidos.size < Math.ceil(qtd / 2)) escolhidos.add(fila.pop()!);
      while (escolhidos.size < qtd) escolhidos.add(Math.floor(r() * cli.catalogo.length));
      const itens = [...escolhidos].map((i) => ({
        cod: codigos[i],
        item: cli.catalogo[i],
        q: unidadeDe(cli.catalogo[i][0]) === "KG" ? Math.round((0.3 + r() * 3) * 1000) / 1000 : 1 + Math.floor(r() * 4),
        v: precos[i],
      }));
      const modelo: "55" | "65" = n % 5 === 0 ? (cli.modeloPadrao === "55" ? "65" : "55") : cli.modeloPadrao;
      const data = new Date(Date.UTC(2026, 8, 1 + (n % 28), 12 + (n % 8), (n * 13) % 60));
      const xml = xmlNota(cli, 4000 + n, itens, modelo, data, modelo === "55" || n % 3 === 0);
      const nome = `nfe-${modelo === "65" ? "nfce" : "nfe"}-${String(4000 + n)}.xml`;
      writeFileSync(join(dir, nome), xml);
      zip.file(nome, xml);
    }
    // Um XML que não é NF-e (evento de cancelamento), para testar a mensagem de arquivo ignorado.
    const evento = `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento Id="ID1101113526"><tpEvento>110111</tpEvento><descEvento>Cancelamento</descEvento></infEvento></evento></procEventoNFe>`;
    zip.file("evento-cancelamento-4031.xml", evento);
    writeFileSync(join(SAIDA, `${cli.pasta}.zip`), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    resumo.push(`${cli.fantasia}: CNPJ ${cli.cnpj}, ${cli.catalogo.length} produtos, 30 XMLs`);
  }

  // Planilha CSV (mercadinho) e XLSX (pet e agro), como exportadas de um ERP.
  const merc = CLIENTES[0];
  const csv = ["Código;Descrição do produto;NCM;CEST;Unid.;Cód. barras"]
    .concat(merc.catalogo.map(([d, n, e, c], i) => `${1000 + i * 7};${d};${n};${(c || "").trim()};${unidadeDe(d)};${e}`))
    .join("\r\n");
  writeFileSync(join(SAIDA, "produtos-mercadinho.csv"), "﻿" + csv);

  const pet = CLIENTES[2];
  const linhas = [["SKU", "Nome", "Classificação fiscal", "Unidade", "GTIN", "Preço"]].concat(
    pet.catalogo.map(([d, n, e], i) => [`PET-${i + 1}`, d, n ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : "", unidadeDe(d), e, "0"]),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Produtos");
  writeFileSync(join(SAIDA, "produtos-pet-agro.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  writeFileSync(
    join(SAIDA, "LEIAME.md"),
    `# Fixtures de teste\n\nGeradas por \`npm run fixtures\` (dados fictícios; nenhum dado real de cliente).\n\n${resumo
      .map((r) => `- ${r}`)
      .join("\n")}\n\nCada pasta tem os XMLs soltos; o .zip de mesmo nome traz os mesmos XMLs e mais um evento de cancelamento (não é NF-e, deve ser ignorado com aviso).\n\n- \`produtos-mercadinho.csv\`: planilha com separador ; e cabeçalhos do ERP.\n- \`produtos-pet-agro.xlsx\`: planilha com NCM formatado (0000.00.00) na coluna "Classificação fiscal".\n\nErros de propósito: NCM ausente, NCM com 4 dígitos, NCM inexistente (99999999, 12345678), descrições vagas ("DIVERSOS", "PRODUTO 01", "MERCADORIA").\n`,
  );
  console.log(resumo.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
