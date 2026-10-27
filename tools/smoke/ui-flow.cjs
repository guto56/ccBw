// Fluxo completo no navegador (Playwright), com pagamento de teste.
// Uso: BASE_URL=http://127.0.0.1:8787 node tools/smoke/ui-flow.cjs fixtures/caso1-notificacao.png [saida/]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const file = process.argv[2];
const out = process.argv[3] || "fixtures/out/ui";
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "pt-BR", timezoneId: "America/Sao_Paulo", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  const shot = (n) => page.screenshot({ path: path.join(out, `${n}.png`), fullPage: true });

  await page.goto(BASE + "/enviar");
  await page.setInputFiles("#notificacao", file);
  await page.check("#consent");
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled, null, { timeout: 30000 });
  await shot("1-envio");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Confira os dados", { timeout: 120000 });
  console.log("revisão aberta:", page.url().replace(/#.*/, "#<token>"));

  // Preenche à mão se a leitura automática não estiver disponível
  const fill = async (id, v) => { const el = page.locator(`#f-${id}`); if (!(await el.inputValue())) await el.fill(v); };
  await fill("orgao_autuador", "AUTARQUIA MUNICIPAL DE TRÂNSITO DE VILA EXEMPLO");
  await fill("numero_auto", "EX-2026-000731");
  await fill("descricao_infracao", "Dirigir o veículo segurando ou manuseando telefone celular");
  await fill("artigo_infracao", "252, parágrafo único");
  await fill("data_infracao", "2026-08-03");
  await fill("hora_infracao", "07:42");
  await fill("local_infracao", "Av. das Palmeiras, 1200, sentido centro");
  await fill("valor", "293,47");
  await fill("pontos", "7");
  await fill("placa", "EXE1A23");
  await fill("marca_modelo", "VW/GOL 1.0");
  await fill("data_expedicao", "2026-09-10");
  await fill("data_postagem", "2026-09-11");
  await fill("prazo_final", "2026-11-16");
  await fill("agente_identificacao", "Matrícula 40213 (fictícia)");
  await fill("equipamento_identificacao", "Câmera VM-07 (fictícia)");
  await shot("2-revisao");
  await page.click("text=Confirmar e ver o diagnóstico");
  await page.waitForSelector("text=Seu diagnóstico", { timeout: 60000 });
  await shot("3-diagnostico");
  const forca = await page.locator(".kpi").nth(1).textContent();
  const achados = await page.locator("h2#h-achados").textContent();
  console.log("diagnóstico:", achados, "| força:", forca);

  await page.click("text=Pagar R$ 49,00");
  await page.click("text=Pagar (teste)");
  await page.waitForSelector("text=Pagamento confirmado", { timeout: 30000 });
  await page.fill("#nome", "Pessoa Fictícia de Teste");
  await page.fill("#cpf", "000.000.000-00");
  await page.fill("#endereco", "Rua Exemplo, 1");
  await page.fill("#cidade", "Vila Exemplo/EX");
  await page.click("text=Gerar minha peça");
  await page.waitForSelector("text=Sua peça está pronta", { timeout: 180000 });
  await shot("4-entrega");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("text=Baixar PDF")]);
  const pdfPath = path.join(out, "peca.pdf");
  await dl.saveAs(pdfPath);
  console.log("PDF baixado:", fs.statSync(pdfPath).size, "bytes");
  await page.click("button:has-text('Ainda não saiu')");
  await page.waitForSelector("text=Registrado: Ainda não saiu");
  console.log("resultado registrado");
  await browser.close();
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
