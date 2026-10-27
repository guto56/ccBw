# ContraMulta

> A IA te multou. Outra IA te defende.

Plataforma web (pt-BR, mobile first) que lê uma notificação de trânsito, mostra de graça as falhas
formais encontradas e, depois do pagamento (R$ 49), gera a defesa prévia ou o recurso para o
motorista assinar e protocolar.

**Ambiente de testes:** https://contramulta.hrycsngb42.workers.dev (pagamento simulado, indexação
bloqueada, textos ainda sem revisão de advogado).

## Como funciona por dentro

```
foto/PDF ──► extração (LLM visão, com confiança e null) ──► conferência humana
         ──► motor de regras determinístico (src/shared/rules) ──► diagnóstico grátis
         ──► pagamento ──► seleção de teses (LLM escolhe só IDs do catálogo ligados a achados)
         ──► template com texto literal da lei + narrativa da LLM
         ──► validador de citações (remove o que não está na base; jurisprudência proibida) ──► PDF
```

- **Texto jurídico** só vem de `legal/` (fontes oficiais baixadas, com URL e data de acesso). Ver
  `legal/README.md` e `LEGAL_REVIEW.md`.
- **Força da defesa** (Fraca / Moderada / Forte) é calculada por regra, pelo peso das teses. Nunca %.
- **Prazo vencido** bloqueia a venda. Sem achados, a venda exige ciência explícita.
- **PDF** é montado no navegador (pdf-lib + fontkit, Source Serif 4 embutida), para não estourar a
  CPU do Worker no plano gratuito.
- **Acesso** por link secreto (token de 32 bytes no fragmento `#`, que não chega a servidor nem a log;
  no banco fica só o SHA-256). Sem login.
- **Dados pessoais** (nome, CPF, CNH, endereço) ficam cifrados com AES-GCM (`DATA_KEY`), mascarados no
  admin e fora de qualquer log. Uploads e dados pessoais são apagados em 30 dias pelo Cron.

## Stack

Um único Worker (Hono) com Static Assets (Vite + React + TypeScript + Tailwind v4), D1, Turnstile,
Cron Trigger, Secrets. zod em todas as fronteiras. IA via OpenRouter.

| Pasta | Conteúdo |
| --- | --- |
| `src/worker` | rotas (`routes/`), pipeline LLM (`llm/`, `pipeline.ts`), pagamento (`payments/`), cron, armazenamento |
| `src/shared` | motor de regras, validador de citações, montagem da peça, PDF, .ics, schemas |
| `src/client` | landing estática (`index.html`) e app React (`app/`) |
| `legal` | fontes oficiais, trechos literais, catálogo de teses |
| `migrations` | schema D1 |
| `fixtures` | 3 notificações FICTÍCIAS marcadas "EXEMPLO" para smoke test |
| `tests` | vitest (regras, citações, documento, pipeline, pagamento) |
| `tools` | extração da base jurídica, geração de imagens, smoke tests |

## Rodar localmente

```bash
npm ci
cp .dev.vars.example .dev.vars        # preencha ADMIN_TOKEN e DATA_KEY (ver abaixo)
npm run db:migrate:local
npm run dev                           # build do cliente + wrangler dev em http://localhost:8787
npm test                              # 67 testes
npm run typecheck
```

Gerar valores locais: `ADMIN_TOKEN=$(openssl rand -hex 32)` e `DATA_KEY=$(openssl rand -base64 32)`.
`.dev.vars` está no `.gitignore`.

Sem `OPENROUTER_API_KEY`, a leitura automática fica desligada: o usuário preenche os dados à mão e a
narrativa usa um modelo fixo só com os fatos confirmados. Todo o resto funciona.

## Configuração

Variáveis (`wrangler.jsonc` → `vars`):

| Nome | Valor no teste | Uso |
| --- | --- | --- |
| `MODEL_VISION` | `anthropic/claude-haiku-5.5` | leitura da notificação, CRLV e foto |
| `MODEL_REASONING` | `anthropic/claude-sonnet-5.5` | seleção de teses e narrativa |
| `MODEL_VISION_ACCEPTS_PDF` | `true` | PDF nativo; com `false`, o navegador converte as páginas 1–2 em imagem |
| `PAYMENT_PROVIDER` | `mock` | `mock` ou `mercadopago` |
| `PRICE_CENTS` | `4900` | preço da peça |
| `TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` | chave de TESTE oficial (sempre aprova) |
| `RETENTION_DAYS` | `30` | retenção dos uploads e dados pessoais |
| `PUBLIC_BASE_URL` | URL do workers.dev | retorno do checkout |

Segredos (`wrangler secret put NOME`, ou painel → Workers → contramulta → Settings → Variables and Secrets):

| Nome | Obrigatório | Uso |
| --- | --- | --- |
| `ADMIN_TOKEN` | sim | acesso a `/admin` |
| `DATA_KEY` | sim | chave AES-256 (base64) dos dados pessoais |
| `TURNSTILE_SECRET_KEY` | sim | no teste: `1x0000000000000000000000000000000AA` |
| `OPENROUTER_API_KEY` | não | liga a leitura automática |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | com `mercadopago` | Checkout Pro e assinatura do webhook |

Nunca grave segredos em arquivo versionado. Antes de cada commit, um `git grep` pelo prefixo das chaves
do OpenRouter deve voltar vazio.

## Deploy

O deploy de teste roda no **Workers Builds** (CI da Cloudflare) a cada push na branch
`claude/contramulta`: build `npm run build:client`, deploy `npx wrangler deploy`.

Manual, com wrangler autenticado:

```bash
npx wrangler d1 migrations apply contramulta --remote
npm run build:client && npx wrangler deploy
```

Indexação bloqueada: `robots.txt` com `Disallow: /` e `X-Robots-Tag: noindex` em todas as respostas.

### Ativar o R2

Hoje os uploads ficam numa tabela D1 (`blobs`, limite de ~1,9 MB por arquivo; o cliente comprime as
fotos para caber). Para usar R2: ative o R2 na conta, crie o bucket `contramulta-uploads` e
descomente o binding `UPLOADS` em `wrangler.jsonc`. O código passa a usar o R2 sozinho
(`src/worker/storage.ts`).

### Mercado Pago (sandbox)

1. Crie credenciais de teste (`TEST-...`) e grave `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`.
2. Mude `PAYMENT_PROVIDER` para `mercadopago`.
3. Cadastre o webhook `https://<host>/api/payments/mercadopago/webhook` (evento `payment`).
4. Confira o formato da assinatura `x-signature` (manifesto `id:...;request-id:...;ts:...;`) com a
   documentação atual do Mercado Pago antes de ir para produção.

## Modelos e custo por caso

Escolhidos consultando `GET https://openrouter.ai/api/v1/models` (suporte a `structured_outputs`,
entrada de imagem e PDF). Valores estimados pelos preços da lista, não medidos em produção:

| Etapa | Modelo | US$ por caso |
| --- | --- | --- |
| Extração da notificação | haiku-5.5 | ~0,0008 |
| Foto da infração + CRLV | haiku-5.5 | ~0,0007 |
| Seleção de teses | sonnet-5.5 | ~0,006 |
| Narrativa (até 1 nova tentativa) | sonnet-5.5 | ~0,007 (pior caso ~0,015) |
| **Total típico** | | **~US$ 0,015 (≈ R$ 0,08)**; pior caso ~US$ 0,03 |

O diagnóstico grátis custa só a leitura (~US$ 0,0015). O custo real de cada chamada vai para a tabela
`llm_usage` e aparece por caso no `/admin`.

## Smoke tests

```bash
BASE_URL=http://127.0.0.1:8787 ADMIN_TOKEN=... node tools/smoke/api-smoke.mjs fixtures/caso1.json
BASE_URL=http://127.0.0.1:8787 node tools/smoke/ui-flow.cjs fixtures/caso1-notificacao.png
```

Casos: `caso1` intempestividade (Forte), `caso2` sem achados (Fraca), `caso3` celular com imagem
ambígua (Moderada).

## Design

Skills usadas: `design-taste-frontend` (taste-skill v2, direção "quiet-instrument"), `frontend-design`,
`cloudflare`, `wrangler`, `workers-best-practices`, `web-perf`. O pacote taste-skill instalado não traz
uma skill separada de redesign; a auditoria final usou o procedimento de revisão da própria
`design-taste-frontend` (`references/critique.md`).

Imagens da landing geradas com Cloudflare Workers AI, modelo `@cf/black-forest-labs/flux-2-klein-4b`
(prompts em `tools/images/prompts.json`). Nenhum logo, brasão ou elemento de órgão público.

## O que falta para produção

- Revisão jurídica das teses, modelos, termos e privacidade (`LEGAL_REVIEW.md`).
- Anexo do MBFT (Res. CONTRAN 985/2022) ainda `PENDENTE`: o código da infração não é conferido.
- Pagamento real: credenciais Mercado Pago de produção e verificação do webhook.
- Domínio próprio e `PUBLIC_BASE_URL`.
- `OPENROUTER_API_KEY` (e rotação periódica da chave).
- Ativar o R2.
- Turnstile com chaves reais.
