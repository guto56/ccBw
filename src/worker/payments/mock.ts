import type { PaymentProvider } from "./types";

/** Pagamento simulado para o ambiente de testes. A aprovação vem do botão "pagar (teste)". */
export const mockProvider: PaymentProvider = {
  name: "mock",
  async createCheckout() {
    return { providerRef: null, status: "pending", mock: true };
  },
  async handleWebhook() {
    return null;
  },
};
