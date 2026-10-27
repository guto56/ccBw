// Renderiza as notificações fictícias (HTML -> PNG) para os testes ponta a ponta.
// Uso: node fixtures/render.cjs   (gera fixtures/<caso>-notificacao.png e recortes para a landing)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const casos = JSON.parse(fs.readFileSync(path.join(__dirname, "casos.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function html(c) {
  const d = c.dados;
  const img = fs.readFileSync(path.join(__dirname, "src", c.imagem)).toString("base64");
  const row = (label, value, id) => `<div class="f" ${id ? `id="${id}"` : ""}><span>${label}</span><b>${value == null ? "" : esc(value)}</b></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#fff;font:15px/1.35 "DejaVu Sans",Arial,sans-serif;color:#111}
  .page{position:relative;width:1240px;padding:56px 64px;overflow:hidden}
  .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
  .wm span{transform:rotate(-28deg);font-size:210px;font-weight:700;letter-spacing:.08em;color:rgba(200,30,30,.13)}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:16px}
  .org{font-size:20px;font-weight:700;max-width:640px}.org small{display:block;font-size:14px;font-weight:400;margin-top:4px}
  .ficticio{border:2px solid #b00;color:#b00;font-weight:700;padding:8px 12px;font-size:14px;text-align:center}
  h1{font-size:24px;margin:22px 0 4px}h2{font-size:15px;margin:22px 0 8px;background:#111;color:#fff;padding:6px 10px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #111;border-bottom:0}
  .grid .f{border-bottom:1px solid #111;border-right:1px solid #111;padding:8px 10px;min-height:58px}.grid .f:nth-child(3n){border-right:0}
  .f span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#444}.f b{display:block;font-size:16px;margin-top:3px}
  .wide{grid-column:span 3}.two{grid-column:span 2}
  .img{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}.img img{width:100%;border:1px solid #111;display:block}
  .note{font-size:13px;color:#333}.foot{margin-top:24px;font-size:12px;color:#444;border-top:1px solid #111;padding-top:10px}
  </style></head><body><div class="page" id="pagina">
  <div class="wm"><span>EXEMPLO</span></div>
  <div class="top"><div class="org">AUTARQUIA MUNICIPAL DE TRÂNSITO DE VILA EXEMPLO<small>Documento fictício, criado para testes do ContraMulta. Não é documento de órgão público.</small></div>
  <div class="ficticio">EXEMPLO<br>FICTÍCIO</div></div>
  <h1>Notificação de autuação por infração de trânsito</h1>
  <div class="note">Destinatário: Pessoa Fictícia de Teste · Rua Exemplo, 1 · Vila Exemplo/EX</div>
  <h2>Dados da autuação</h2>
  <div class="grid" id="dados-auto">
    ${row("Nº do auto de infração", d.auto)}${row("Placa", d.placa, "campo-placa")}${row("Marca/modelo", d.marca_modelo)}
    ${row("Espécie", d.especie)}${row("Código da infração", d.codigo)}${row("Gravidade / pontos", `${d.gravidade} / ${d.pontos} pontos`)}
    <div class="f two" id="campo-descricao"><span>Descrição da infração</span><b>${esc(d.descricao)}</b></div>${row("Enquadramento", d.enquadramento)}
    <div class="f two"><span>Local</span><b>${esc(d.local)}</b></div>${row("Data e hora", `${d.data} às ${d.hora}`, "campo-data")}
    ${row("Agente autuador", d.agente ?? "", "campo-agente")}${row("Equipamento", d.equipamento)}${row("Valor da multa", d.valor)}
    <div class="f wide" id="campo-observacao"><span>Observação</span><b>${esc(d.observacao)}</b></div>
  </div>
  <h2>Prazos</h2>
  <div class="grid" id="prazos">${row("Data de expedição", d.expedicao, "campo-expedicao")}${row("Data de postagem", d.postagem)}${row("Prazo final para defesa prévia e indicação de condutor", d.prazo, "campo-prazo")}</div>
  <h2>Imagem do registro</h2>
  <div class="img" id="imagem"><img src="data:image/jpeg;base64,${img}" alt=""><div class="note">Registro de imagem do equipamento indicado acima. ${esc(d.data)} ${esc(d.hora)}.</div></div>
  <div class="foot">EXEMPLO · Este documento é fictício e serve apenas para testes. Os nomes, números, placas e endereços não existem.</div>
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  const crops = path.join(__dirname, "..", "assets-src", "recortes");
  fs.mkdirSync(crops, { recursive: true });
  for (const c of casos) {
    fs.writeFileSync(path.join(__dirname, "src", `${c.id}.html`), html(c));
    await page.setContent(html(c), { waitUntil: "load" });
    await page.locator("#pagina").screenshot({ path: path.join(__dirname, `${c.id}-notificacao.png`) });
    if (c.id === "caso1") {
      // recortes 4:3 centrados em cada campo, para a vitrine da landing (render em 2x)
      const hi = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
      await hi.setContent(html(c), { waitUntil: "load" });
      const pageBox = await hi.locator("#pagina").boundingBox();
      const W = 520, H = 390;
      for (const id of ["campo-data", "campo-expedicao", "campo-descricao", "campo-observacao", "campo-agente", "imagem"]) {
        const b = await hi.locator(`#${id}`).boundingBox();
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const x = Math.max(0, Math.min(cx - W / 2, pageBox.width - W));
        const y = Math.max(0, Math.min(cy - H / 2, pageBox.height - H));
        await hi.screenshot({ path: path.join(crops, `${id}.png`), clip: { x, y, width: W, height: H } });
      }
      await hi.close();
    }
    console.log("ok", c.id);
  }
  await browser.close();
})();
