// Segredos opcionais (não listados em secrets.required): mesclados na interface global Env.
interface Env {
  /** Sem a chave, a leitura automática fica desligada e o usuário preenche os dados à mão. */
  OPENROUTER_API_KEY?: string;
  /** Binding R2 opcional enquanto o R2 não está ativo na conta. */
  UPLOADS?: R2Bucket;
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
}
