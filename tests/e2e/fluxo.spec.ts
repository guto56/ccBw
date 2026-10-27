import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { criarCliente, entrar, esperarClassificacao } from "./apoio";

interface Caso {
  pasta: string;
  razao: string;
  cnpj: string;
  segmento: string;
  produtos: number;
  esperado: [descricao: string, cClassTrib: string | null, status?: string][];
}

const CASOS: Caso[] = [
  {
    pasta: "mercadinho-boa-vista",
    razao: "Mercadinho Boa Vista Ltda",
    cnpj: "12345678000195",
    segmento: "mercado",
    produtos: 91,
    esperado: [
      ["ARROZ TIPO 1 TIO JOAO 5KG", "200003"],
      ["FEIJAO CARIOCA KICALDO 1KG", "200003"],
      ["SABONETE LUX BOTANICALS 85G", "200035"],
      ["REFRIGERANTE COCA COLA 2L", "000001"],
      ["OLEO DE SOJA SOYA 900ML", "200034"],
      ["ERVILHA EM CONSERVA", null, "NCM inválido"], // a IA pode sugerir NCM; o status continua inválido
    ],
  },
  {
    pasta: "farmacia-sao-lucas",
    razao: "Farmacia Sao Lucas ME",
    cnpj: "23456789000195",
    segmento: "farmacia",
    produtos: 70,
    esperado: [
      ["DIPIRONA SODICA 500MG 10 COMP EMS", "200032"],
      ["ABSORVENTE INTIMUS GEL 8UN", "200013"],
      ["FRALDA GERIATRICA TENA M 8UN", "200035"],
      ["PROTETOR SOLAR NIVEA FPS50 200ML", "000001"],
    ],
  },
  {
    pasta: "pet-e-agro-rancho-alegre",
    razao: "Rancho Alegre Pet e Agropecuaria Ltda",
    cnpj: "34567890000130",
    segmento: "petshop",
    produtos: 69,
    esperado: [
      ["RACAO GOLDEN CAES ADULTO FRANGO 15KG", "000001"],
      ["RACAO BOVINOS CORTE NUTRIPLUS 40KG", "200038"],
      ["ADUBO NPK 10-10-10 50KG", "200038"],
    ],
  },
];

async function baixar(page: Page, nome: RegExp) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: nome }).click()]);
  return download;
}

for (const caso of CASOS) {
  test(`fluxo completo: ${caso.pasta}`, async ({ page }) => {
    const erros: string[] = [];
    page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    page.on("response", (r) => r.status() >= 500 && erros.push(`HTTP ${r.status()} ${r.url()}`));

    await entrar(page);
    await criarCliente(page, caso.razao, caso.cnpj, caso.segmento);

    // Upload do .zip: lido no navegador, só a lista de produtos sai.
    const enviados: string[] = [];
    page.on("request", (r) => r.method() === "POST" && enviados.push(r.postData() ?? ""));
    await page.getByLabel("Escolher XMLs ou ZIP").setInputFiles(`fixtures/${caso.pasta}.zip`);
    await expect(page.getByText(/produtos únicos em/)).toBeVisible();
    await expect(page.getByText(/30 notas/).first()).toBeVisible();
    await expect(page.getByText(/não uma NF-e/).first()).toBeVisible(); // evento de cancelamento ignorado
    await expect(page.getByText(`${caso.produtos} produtos únicos em 30 notas`, { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Classificar produtos" }).click();
    await page.waitForURL(/\/app\/lotes\//);
    await esperarClassificacao(page);

    // Nada de XML ou destinatário nas requisições ao servidor.
    const corpo = enviados.join("\n");
    expect(corpo).not.toContain("<infNFe");
    expect(corpo).not.toContain("CONSUMIDOR DE TESTE");
    expect(corpo).not.toContain("12345678909");

    // Faixa do topo: contagens clicáveis.
    const faixa = page.getByRole("navigation", { name: "Resumo do lote e filtros" });
    await expect(faixa).toBeVisible();
    await faixa.getByRole("button", { name: /NCM inválido/ }).click();
    await expect(faixa.getByRole("button", { name: /NCM inválido/ })).toHaveAttribute("aria-pressed", "true");
    await faixa.getByRole("button", { name: /NCM inválido/ }).click();

    // Nenhum item vem aprovado sozinho.
    await expect(page.getByRole("grid").getByText("Aprovado", { exact: true })).toHaveCount(0);

    // Atalhos: j/k e "a" aprova a linha focada com o visto.
    const primeira = page.getByRole("row").nth(1);
    await primeira.focus();
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    const linhaFocada = page.locator('[role="row"][aria-selected="true"]');
    const status = await linhaFocada.textContent();
    if (!status?.includes("NCM inválido")) {
      await page.keyboard.press("a");
      await expect(linhaFocada.getByText("Aprovado").filter({ visible: true })).toBeVisible();
    }

    // Expandir mostra justificativa e fonte no estilo DANFE.
    await page.keyboard.press("Enter");
    await expect(page.getByText("Fonte legal").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Aprovação em massa dos sugeridos.
    const massa = page.getByRole("button", { name: /Aprovar sugeridos do filtro/ });
    await massa.click();
    await expect(massa).toBeDisabled();

    // Exportação XLSX: confere colunas e códigos.
    const d = await baixar(page, /Baixar planilha/);
    const wb = XLSX.read(readFileSync(await d.path()));
    const linhas = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["Classificação"], { raw: false, defval: "" });
    expect(Object.keys(linhas[0])).toEqual(["Código", "Descrição", "NCM", "CEST", "Tratamento", "CST IBS/CBS", "cClassTrib", "Confiança", "Justificativa", "Fonte", "Status"]);
    expect(linhas.length).toBe(caso.produtos);
    for (const [descricao, codigo, st] of caso.esperado) {
      const l = linhas.find((x) => x["Descrição"] === descricao);
      expect(l, descricao).toBeTruthy();
      if (codigo !== null) expect(l!["cClassTrib"], descricao).toBe(codigo);
      if (st) expect(l!["Status"], descricao).toBe(st);
    }
    // Item decidido só pela IA nunca sai aprovado.
    for (const l of linhas) if (l["Justificativa"].includes("pela IA")) expect(l["Status"]).not.toBe("Aprovado");
    expect(wb.SheetNames).toContain("Sobre");

    const csv = await baixar(page, /^CSV$/);
    expect(readFileSync(await csv.path(), "utf8")).toContain("Código;Descrição;NCM;CEST;Tratamento;CST IBS/CBS;cClassTrib");

    const pdf = await baixar(page, /Relatório PDF/);
    expect(readFileSync(await pdf.path()).subarray(0, 4).toString()).toBe("%PDF");

    expect(erros, erros.join("\n")).toEqual([]);
  });
}

test("planilha CSV com mapeamento de colunas e edição de NCM", async ({ page }) => {
  await entrar(page);
  await criarCliente(page, "Mercadinho Planilha Ltda", "11222333000181", "mercado");
  await page.getByRole("tab", { name: "Planilha do ERP" }).click();
  await page.getByLabel("Escolher planilha").setInputFiles("fixtures/produtos-mercadinho.csv");
  await expect(page.getByText(/91<\/span> linhas|91 linhas/)).toBeVisible();
  // Cabeçalhos do ERP reconhecidos automaticamente.
  await expect(page.getByLabel("NCM")).toHaveValue("2");
  await page.getByRole("button", { name: "Classificar produtos" }).click();
  await esperarClassificacao(page);

  // Corrige o NCM de um item inválido e aprova.
  await page.getByPlaceholder("Buscar descrição, código ou NCM").fill("BISCOITO DE POLVILHO");
  const linha = page.getByRole("row", { name: /BISCOITO DE POLVILHO/ });
  await linha.click();
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("NCM", { exact: true }).fill("19059090");
  await expect(page.getByText(/Outros/).first()).toBeVisible();
  await page.getByRole("button", { name: "Reclassificar pelo NCM" }).click();
  await expect(page.getByText(/o motor sugere/)).toBeVisible();
  await page.getByLabel("cClassTrib").selectOption("000001");
  await page.getByRole("button", { name: "Salvar e aprovar" }).click();
  await expect(linha.getByText("Aprovado").filter({ visible: true }).first()).toBeVisible();
  await expect(linha.getByText("1905.90.90").filter({ visible: true }).first()).toBeVisible();
});

test("login recusa senha errada e protege o app e a API", async ({ page, request }) => {
  const api = await request.post("/api/classificar", { data: { segmento: "mercado", produtos: [] } });
  expect(api.status()).toBe(401);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar\?para=%2Fapp/);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Senha incorreta/)).toBeVisible();
});
