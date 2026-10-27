export type PaymentMethod = "pix" | "cartao";
export type PaymentStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface CheckoutResult {
  providerRef: string | null;
  status: PaymentStatus;
  /** URL para o checkout do provedor (Mercado Pago). */
  redirectUrl?: string;
  /** Pagamento simulado: a UI mostra o botão "pagar (teste)". */
  mock?: boolean;
}

export interface WebhookUpdate {
  externalReference: string;
  providerRef: string;
  status: PaymentStatus;
}

export interface PaymentProvider {
  name: "mock" | "mercadopago";
  createCheckout(input: { paymentId: string; caseId: string; amountCents: number; method: PaymentMethod; returnUrl: string; notificationUrl: string }): Promise<CheckoutResult>;
  /** Valida a assinatura e devolve o status confirmado no provedor, ou null se a notificação deve ser ignorada. */
  handleWebhook(req: Request): Promise<WebhookUpdate | null>;
}
