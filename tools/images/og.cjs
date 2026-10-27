// Gera a imagem de compartilhamento (Open Graph) a partir de HTML, com as fontes e fotos da landing.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const pub = path.join(__dirname, "..", "..", "src", "client", "public");
const b64 = (f) => fs.readFileSync(path.join(pub, f)).toString("base64");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Y;src:url(data:font/woff2;base64,${b64("fonts/young-serif.woff2")})}
@font-face{font-family:S;src:url(data:font/woff2;base64,${b64("fonts/ss4-roman.woff2")});font-weight:400 600}
body{margin:0;width:1200px;height:630px;background:#000;color:#fff;display:grid;grid-template-columns:1fr 420px;gap:56px;padding:64px 72px;box-sizing:border-box;font-family:S}
h1{font-family:Y;font-weight:400;font-size:64px;line-height:1;letter-spacing:-.02em;margin:0}
p{font-size:28px;line-height:1.35;color:#d9d9d9;margin:28px 0 0}
.mark{font-family:Y;font-size:30px;margin-bottom:56px}
.pics{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-self:center}
.pics img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
.price{display:inline-block;margin-top:36px;background:#d92b21;color:#fff;font-weight:600;font-size:26px;padding:12px 26px;border-radius:999px}
</style></head><body><div><div class="mark">ContraMulta</div><h1>A IA te multou.<br>Outra IA te defende.</h1>
<p>Diagnóstico grátis de falhas formais na sua notificação de trânsito.</p><span class="price">Defesa pronta por R$ 49</span></div>
<div class="pics"><img src="data:image/webp;base64,${b64("img/porta-camera-560.webp")}"><img src="data:image/webp;base64,${b64("img/porta-defesa-560.webp")}"></div></body></html>`;
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(pub, "img", "og.png") });
  await b.close();
  console.log("og.png ok");
})();
