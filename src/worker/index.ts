import { Hono } from "hono";
import { caseRoutes } from "./routes/case";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { purgeExpired } from "./cron";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  c.res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  if (c.req.path.startsWith("/api/")) c.res.headers.set("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  // Log sem corpo, sem token e sem dados pessoais.
  console.log(JSON.stringify({ rota: c.req.routePath, metodo: c.req.method, status: c.res.status, ms: Date.now() - started }));
});

app.get("/robots.txt", () => new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } }));

app.route("/api", publicRoutes);
app.route("/api", caseRoutes);
app.route("/api/admin", adminRoutes);

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Rota não encontrada." }, 404) : c.env.ASSETS.fetch(c.req.raw)));
app.onError((err, c) => {
  console.error(JSON.stringify({ msg: "erro_nao_tratado", rota: c.req.routePath, erro: String(err).slice(0, 300) }));
  return c.json({ error: "Algo deu errado do nosso lado. Tente de novo em instantes." }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purgeExpired(env));
  },
} satisfies ExportedHandler<Env>;
