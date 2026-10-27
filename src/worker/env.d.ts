// Segredos opcionais (não listados em secrets.required).
declare namespace Cloudflare {
  interface Env {
    MP_ACCESS_TOKEN?: string;
    MP_WEBHOOK_SECRET?: string;
  }
}
