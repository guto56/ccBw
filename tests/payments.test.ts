import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { mercadoPagoProvider, parseSignature, signatureManifest, verifySignature } from "../src/worker/payments/mercadopago";
import { mockProvider } from "../src/worker/payments/mock";
import { getProvider } from "../src/worker/payments";

const SECRET = "segredo-de-teste";
const sign = (dataId: string, reqId: string, ts: string) => createHmac("sha256", SECRET).update(signatureManifest(dataId, reqId, ts)).digest("hex");
const env = (over: Record<string, string> = {}) => ({ MP_ACCESS_TOKEN: "TEST-123", MP_WEBHOOK_SECRET: SECRET, PAYMENT_PROVIDER: "mercadopago", ...over }) as unknown as Env;

describe("pagamento", () => {
  it("mock é o padrão e não confirma sozinho", async () => {
    expect(getProvider({ PAYMENT_PROVIDER: "mock" } as Env).name).toBe("mock");
    expect(getProvider({ PAYMENT_PROVIDER: "mercadopago" } as Env).name).toBe("mock"); // sem credenciais
    const r = await mockProvider.createCheckout({ paymentId: "p", caseId: "c", amountCents: 4900, method: "pix", returnUrl: "", notificationUrl: "" });
    expect(r).toMatchObject({ status: "pending", mock: true });
  });

  it("valida a assinatura HMAC do webhook", async () => {
    const ts = "1704908010";
    const v1 = sign("123456", "req-1", ts);
    expect(parseSignature(`ts=${ts},v1=${v1}`)).toEqual({ ts, v1 });
    expect(await verifySignature(SECRET, "123456", "req-1", `ts=${ts},v1=${v1}`)).toBe(true);
    expect(await verifySignature(SECRET, "123457", "req-1", `ts=${ts},v1=${v1}`)).toBe(false);
    expect(await verifySignature(SECRET, "123456", "req-1", null)).toBe(false);
  });

  it("webhook assinado consulta o pagamento e devolve o status", async () => {
    const ts = "1704908010";
    const fetchImpl = (async (url: string) => {
      expect(url).toContain("/v1/payments/999");
      return Response.json({ status: "approved", external_reference: "caso:pag" });
    }) as unknown as typeof fetch;
    const p = mercadoPagoProvider(env(), fetchImpl);
    const req = new Request("https://x/api/payments/mercadopago/webhook?data.id=999&type=payment", { method: "POST", headers: { "x-request-id": "r1", "x-signature": `ts=${ts},v1=${sign("999", "r1", ts)}` } });
    expect(await p.handleWebhook(req)).toEqual({ externalReference: "caso:pag", providerRef: "999", status: "approved" });
  });

  it("webhook com assinatura errada é rejeitado", async () => {
    const p = mercadoPagoProvider(env(), (async () => Response.json({})) as unknown as typeof fetch);
    const req = new Request("https://x/w?data.id=999&type=payment", { method: "POST", headers: { "x-request-id": "r1", "x-signature": "ts=1,v1=00" } });
    await expect(p.handleWebhook(req)).rejects.toThrow(/assinatura/);
  });

  it("checkout no sandbox usa sandbox_init_point e exclui cartão no Pix", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return Response.json({ id: "pref1", init_point: "https://prod", sandbox_init_point: "https://sandbox" });
    }) as unknown as typeof fetch;
    const r = await mercadoPagoProvider(env(), fetchImpl).createCheckout({ paymentId: "pag", caseId: "caso", amountCents: 4900, method: "pix", returnUrl: "https://r", notificationUrl: "https://n" });
    expect(r.redirectUrl).toBe("https://sandbox");
    expect(body.external_reference).toBe("caso:pag");
    expect((body.items as { unit_price: number }[])[0]!.unit_price).toBe(49);
    expect(JSON.stringify(body.payment_methods)).toContain("credit_card");
  });
});
