import { Hono } from "hono";
import { z } from "zod";
import { logEvent, setStatus } from "../db";
import { getProvider } from "../payments";
import { newId } from "../util";
import { fileStore } from "../storage";

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get("/config", (c) =>
  c.json({
    ambiente: c.env.APP_ENV,
    turnstile_site_key: c.env.TURNSTILE_SITE_KEY,
    preco_centavos: Number(c.env.PRICE_CENTS),
    pagamento: c.env.PAYMENT_PROVIDER === "mercadopago" && c.env.MP_ACCESS_TOKEN ? "mercadopago" : "mock",
    pdf_nativo: c.env.MODEL_VISION_ACCEPTS_PDF === "true",
    leitura_automatica: Boolean(c.env.OPENROUTER_API_KEY),
    limite_arquivo_bytes: fileStore(c.env).maxObjectBytes,
  }),
);

publicRoutes.get("/health", (c) => c.json({ ok: true }));

const FleetSchema = z.object({
  company: z.string().trim().min(2).max(160),
  vehicles: z.coerce.number().int().min(1).max(1_000_000),
  fines_per_month: z.coerce.number().int().min(0).max(1_000_000),
  contact_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().email().max(160),
  contact_phone: z.string().trim().max(30).optional().or(z.literal("")),
});

publicRoutes.post("/fleet", async (c) => {
  const parsed = FleetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Confira os campos.", campos: parsed.error.issues.map((i) => i.path.join(".")) }, 400);
  const d = parsed.data;
  await c.env.DB.prepare("INSERT INTO fleet_waitlist (id, company, vehicles, fines_per_month, contact_name, contact_email, contact_phone, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(newId(), d.company, d.vehicles, d.fines_per_month, d.contact_name, d.contact_email, d.contact_phone || null, Date.now())
    .run();
  return c.json({ ok: true });
});

publicRoutes.post("/payments/mercadopago/webhook", async (c) => {
  const provider = getProvider(c.env);
  if (provider.name !== "mercadopago") return c.json({ ignored: true });
  let update;
  try {
    update = await provider.handleWebhook(c.req.raw);
  } catch (e) {
    console.error(JSON.stringify({ msg: "webhook_rejeitado", error: String(e).slice(0, 200) }));
    return c.json({ error: "invalid" }, 401);
  }
  if (!update) return c.json({ ignored: true });
  const [caseId, paymentId] = update.externalReference.split(":");
  const p = await c.env.DB.prepare("SELECT id, status FROM payments WHERE id = ? AND case_id = ?").bind(paymentId ?? "", caseId ?? "").first<{ id: string; status: string }>();
  if (!p) return c.json({ ignored: true });
  if (p.status !== "approved") {
    await c.env.DB.prepare("UPDATE payments SET status = ?, provider_ref = ?, updated_at = ? WHERE id = ?").bind(update.status, update.providerRef, Date.now(), p.id).run();
    if (update.status === "approved") {
      await setStatus(c.env, caseId!, "paid");
      await logEvent(c.env, caseId!, "paid", { provider: "mercadopago" });
    }
  }
  return c.json({ ok: true });
});
