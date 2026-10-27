import { expect, type Page } from "@playwright/test";

export const SENHA = process.env.APP_PASSWORD ?? "";

export async function entrar(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/app/);
}

export async function criarCliente(page: Page, razao: string, cnpj: string, segmento: string) {
  await page.goto("/app/clientes/novo");
  await page.getByRole("textbox", { name: "Razão social" }).fill(razao);
  await page.getByRole("textbox", { name: "CNPJ" }).fill(cnpj);
  await page.getByLabel("Segmento").selectOption(segmento);
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await page.waitForURL(/\/app\/clientes\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(razao.toUpperCase());
}

export async function esperarClassificacao(page: Page) {
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/Classificando/)).toHaveCount(0, { timeout: 150_000 });
}
