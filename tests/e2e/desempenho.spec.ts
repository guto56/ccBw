import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { criarCliente, entrar, esperarClassificacao } from "./apoio";

test("5.000 produtos: classifica, rola e aprova sem travar", async ({ page }) => {
  test.setTimeout(300_000);
  // Planilha sintética: o catálogo do mercadinho repetido com códigos únicos.
  const catalogo: [string, string, string, string][] = JSON.parse(readFileSync("scripts/catalogos/mercado.json", "utf8"));
  const linhas = ["Código;Descrição;NCM;EAN"];
  for (let i = 0; i < 5000; i++) {
    const [d, n] = catalogo[i % catalogo.length];
    linhas.push(`${100000 + i};${d};${n};`);
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/5000.csv", linhas.join("\n"));

  await entrar(page);
  await criarCliente(page, "Atacadao Teste de Carga Ltda", "45678901000175", "mercado");
  await page.getByRole("tab", { name: "Planilha do ERP" }).click();
  await page.getByLabel("Escolher planilha").setInputFiles("test-results/5000.csv");
  const inicio = Date.now();
  await page.getByRole("button", { name: "Classificar produtos" }).click();
  await esperarClassificacao(page);
  const segundos = (Date.now() - inicio) / 1000;
  console.log(`5.000 itens classificados em ${segundos.toFixed(1)} s`);
  await expect(page.getByText("5.000 de 5.000")).toBeVisible();

  // Virtualização: poucas linhas no DOM.
  const noDom = await page.locator('[role="row"][data-indice]').count();
  expect(noDom).toBeLessThan(80);

  // Rolagem até o fim e navegação por teclado continuam respondendo.
  const t0 = Date.now();
  await page.getByRole("grid").evaluate((g) => (g.scrollTop = g.scrollHeight));
  await expect(page.locator('[role="row"][data-indice="4999"]')).toBeVisible();
  await page.locator('[role="row"][data-indice="4999"]').focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press("k");
  await expect(page.locator('[role="row"][data-indice="4979"]')).toHaveAttribute("aria-selected", "true");
  console.log(`rolagem + 20 teclas: ${Date.now() - t0} ms`);

  const t1 = Date.now();
  await page.getByRole("button", { name: /Aprovar sugeridos do filtro/ }).click();
  await expect(page.getByRole("button", { name: /Aprovar sugeridos do filtro \(0\)/ })).toBeVisible();
  console.log(`aprovação em massa: ${Date.now() - t1} ms`);
  expect(segundos).toBeLessThan(120);
});
