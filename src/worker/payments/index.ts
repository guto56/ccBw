import { mercadoPagoProvider } from "./mercadopago";
import { mockProvider } from "./mock";
import type { PaymentProvider } from "./types";

export function getProvider(env: Env): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "mercadopago" && env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET) return mercadoPagoProvider(env);
  return mockProvider;
}
