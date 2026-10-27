// Mercado Pago Checkout Pro. Com access token de teste (TEST-...), usa o sandbox.
// Webhook: assinatura HMAC-SHA256 do manifesto "id:{data.id};request-id:{x-request-id};ts:{ts};"
// com o segredo do webhook; depois o status é confirmado consultando o pagamento na API.
import type { PaymentProvider, PaymentStatus } from "./types";

const API = "https://api.mercadopago.com";

function mapStatus(s: string | undefined): PaymentStatus {
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "cancelled" || s === "refunded" || s === "charged_back") return "cancelled";
  return "pending";
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseSignature(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  return parts.ts && parts.v1 ? { ts: parts.ts, v1: parts.v1 } : null;
}

export function signatureManifest(dataId: string, requestId: string | null, ts: string): string {
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  return `id:${id};${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
}

export async function verifySignature(secret: string, dataId: string, requestId: string | null, header: string | null): Promise<boolean> {
  const sig = parseSignature(header);
  if (!sig) return false;
  const expected = await hmacHex(secret, signatureManifest(dataId, requestId, sig.ts));
  if (expected.length !== sig.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.v1.charCodeAt(i);
  return diff === 0;
}

export function mercadoPagoProvider(env: Env, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const token = env.MP_ACCESS_TOKEN;
  const secret = env.MP_WEBHOOK_SECRET;
  if (!token || !secret) throw new Error("Mercado Pago sem credenciais (MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET)");
  const sandbox = token.startsWith("TEST-");
  return {
    name: "mercadopago",
    async createCheckout({ paymentId, caseId, amountCents, method, returnUrl, notificationUrl }) {
      const excluded = method === "pix" ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "prepaid_card" }] : [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }];
      const res = await fetchImpl(`${API}/checkout/preferences`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": paymentId },
        body: JSON.stringify({
          items: [{ id: "peca-defesa", title: "ContraMulta - peça de defesa de trânsito", quantity: 1, unit_price: amountCents / 100, currency_id: "BRL" }],
          external_reference: `${caseId}:${paymentId}`,
          back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
          auto_return: "approved",
          notification_url: notificationUrl,
          payment_methods: { excluded_payment_types: excluded, installments: 1 },
          statement_descriptor: "CONTRAMULTA",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; init_point?: string; sandbox_init_point?: string };
      if (!res.ok || !body.id) throw new Error(`Mercado Pago: falha ao criar checkout (HTTP ${res.status})`);
      return { providerRef: body.id, status: "pending", redirectUrl: sandbox ? body.sandbox_init_point : body.init_point };
    },
    async handleWebhook(req) {
      const url = new URL(req.url);
      const dataId = url.searchParams.get("data.id") ?? "";
      const type = url.searchParams.get("type") ?? url.searchParams.get("topic");
      if (!dataId || (type && type !== "payment")) return null;
      const ok = await verifySignature(secret, dataId, req.headers.get("x-request-id"), req.headers.get("x-signature"));
      if (!ok) throw new Error("assinatura do webhook inválida");
      const res = await fetchImpl(`${API}/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Mercado Pago: pagamento não encontrado (HTTP ${res.status})`);
      const p = (await res.json()) as { status?: string; external_reference?: string };
      if (!p.external_reference) return null;
      return { externalReference: p.external_reference, providerRef: dataId, status: mapStatus(p.status) };
    },
  };
}
