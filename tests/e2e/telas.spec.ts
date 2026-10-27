import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { criarCliente, entrar, esperarClassificacao } from "./apoio";

const PASTA = "test-results/telas";
mkdirSync(PASTA, { recursive: true });

const TAMANHOS = [
  { nome: "desktop", width: 1440, height: 900 },
  { nome: "celular", width: 390, height: 844 },
] as const;

async function conferir(page: Page, nome: string) {
  for (const tema of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    for (const t of TAMANHOS) {
      await page.setViewportSize({ width: t.width, height: t.height });
      await page.waitForTimeout(150);
      const largura = await page.evaluate(() => document.documentElement.scrollWidth);
      await page.screenshot({ path: `${PASTA}/${nome}-${t.nome}-${tema}.png`, fullPage: true });
      expect.soft(largura, `${nome} ${t.nome} ${tema}: rolagem horizontal`).toBeLessThanOrEqual(t.width);
      if (t.nome === "desktop") {
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect.soft(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`), `${nome} ${tema}`).toEqual([]);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("telas: claro e escuro, 1440 e 390, sem erro de console e sem violações graves de acessibilidade", async ({ page }) => {
  const erros: string[] = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("requestfailed", (r) => !r.url().includes("_rsc=") && erros.push(`falhou ${r.url()} ${r.failure()?.errorText}`));

  await page.goto("/");
  await page.getByRole("button", { name: "Classificar", exact: true }).click();
  await expect(page.getByText(/Clique numa linha/)).toBeVisible();
  await conferir(page, "01-inicio");
  await page.goto("/estilo");
  await conferir(page, "02-estilo");
  await page.goto("/termos");
  await conferir(page, "03-termos");
  await page.goto("/entrar");
  await conferir(page, "04-entrar");

  await entrar(page);
  await conferir(page, "05-app-vazio");
  await page.goto("/app/clientes/novo");
  await conferir(page, "06-novo-cliente");
  await criarCliente(page, "Mercadinho Boa Vista Ltda", "12345678000195", "mercado");
  await page.getByLabel("Escolher XMLs ou ZIP").setInputFiles("fixtures/mercadinho-boa-vista.zip");
  await expect(page.getByText(/produtos únicos em/)).toBeVisible();
  await conferir(page, "07-cliente-upload");
  await page.getByRole("button", { name: "Classificar produtos" }).click();
  await esperarClassificacao(page);
  await page.waitForTimeout(1300);
  await conferir(page, "08-revisao");
  await page.getByRole("row").nth(1).click();
  await expect(page.getByText("Fonte legal").first()).toBeVisible();
  await conferir(page, "09-revisao-linha-aberta");
  await page.getByRole("button", { name: "Editar" }).first().click();
  await conferir(page, "10-revisao-edicao");
  await page.goto("/app");
  await conferir(page, "11-app-lotes");

  expect(erros, erros.join("\n")).toEqual([]);
});
