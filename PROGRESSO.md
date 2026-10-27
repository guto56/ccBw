# Carimbo: progresso

Registro de cada etapa: o que foi feito, decisões e bugs encontrados e corrigidos.

## Etapa 0: preparação

- Next.js 16.4 (App Router, Turbopack, Cache Components ligado), TypeScript estrito, Tailwind 4.
- Dependências: jose (sessão), zod, jszip + fast-xml-parser (parser no navegador), dexie (IndexedDB),
  @tanstack/react-virtual, jspdf + jspdf-autotable, SheetJS (xlsx 0.20.3, do CDN oficial da SheetJS,
  porque a versão do npm está parada na 0.18 com vulnerabilidades), drizzle-orm + postgres, vitest,
  @playwright/test 1.63 (casa com o Chromium pré-instalado) e @axe-core/playwright.
- `.env.local` (fora do git): OPENROUTER_API_KEY, OPENROUTER_MODEL, APP_PASSWORD, SESSION_SECRET.
- Next 16 renomeou middleware para `proxy.ts` (lido em node_modules/next/dist/docs).

### Skills e MCPs

- **Impeccable** e **Taste Skill**: `npx impeccable install` e `npx skills add ...` foram bloqueados
  pela política de segurança do ambiente (execução de código externo). Em vez disso li os arquivos
  de referência direto do GitHub (somente leitura): `impeccable/SKILL.md`, `reference/craft-floor.md`
  e `taste-skill/SKILL.md` + `references/app-screens.md`. Apliquei as regras manualmente; os
  comandos `/impeccable critique|audit|polish` viraram checklists rodados à mão em cada etapa visual,
  com screenshots reais do Playwright e axe.
  A Taste Skill v2 atual não tem mais os controles numéricos no topo do SKILL.md (variação,
  movimento, densidade); segui as regras de "app screen" dela: cor só em dado, sem cartões com
  sombra, tabela com regras e alinhamento, densidade alta, números alinhados à direita.
- **frontend-design**: não existe neste ambiente.
- **Supabase MCP**: disponível, mas a criação de um projeto novo foi negada pela política de
  segurança (gera custo na organização) e os dois projetos ativos pertencem a outros produtos.
  Ver decisão "Persistência" abaixo.
- **Vercel MCP**: disponível (time "guto's projects"), usado no deploy.
- **Playwright**: sem MCP; uso `@playwright/test` com o Chromium pré-instalado.
- **Cloudflare Workers AI**: não há token no ambiente (`[COLE_TOKEN_AQUI]`). A imagem OG é gerada
  por código (next/og), sem IA, então não foi necessário.

## Etapa 1: fontes oficiais e motor fiscal

- Fontes em `data/fontes/` com `FONTES.md` e `versoes.json`. `npm run atualizar-tabelas` baixa e
  regenera `src/data/{ncm,cclasstrib,anexos-ncm}.json`.
- NCM: JSON público do Siscomex (Resolução Gecex nº 926/2026, vigente em 27/10/2026).
- cClassTrib/CST: a página pública da Classificação Tributária do Portal da Conformidade Fácil (SVRS)
  embute a tabela completa em JSON, inclusive a relação NCM × anexo da LC 214/2025 com condição,
  exceção e PERMITIDO/VEDADO por NCM. Publicação mais recente: 01/10/2026 (IT 2025.002 v1.70).
  O Portal Nacional da NF-e entra em loop de redirecionamento sem cookie e o Planalto recusa
  conexões deste ambiente, então essa foi a fonte oficial acessível com o mesmo conteúdo.
- Motor (`src/lib/fiscal/motor.ts`): (a) valida NCM; (b) cruza com os anexos dentro de um escopo de
  cClassTrib de venda de mercadorias (exclui os que dependem do comprador, ex. administração
  pública, e diferimento); avalia condição/exceção contra a descrição com léxicos (pet × produção,
  inseticida doméstico × defensivo, açúcar adicionado, frutas de casca rija, itens estreitos como
  pão francês dentro do 1905.90.90); VEDADO exclui; (c) integral 000001; regras específicas para
  medicamentos (200032 + alerta do Anexo XIV), combustíveis (620006) e livros (410008);
  (d) gera pendência para a IA quando o NCM é inválido, a condição é incerta ou a descrição é vaga;
  (e) toda resposta da IA deixa o item em "revisar" (ou "NCM inválido"), nunca "aprovado".
- Quando a condição é incerta, a sugestão é conservadora (sem o benefício) e o benefício possível
  aparece como alerta até a IA ou o contador confirmar.
- IA (`ia.ts`): OpenRouter com `response_format: json_schema` estrito, lotes de 25 perguntas,
  4 em paralelo, timeout de 30 s, 1 nova tentativa, validação com Zod. Falha não derruba o lote.
- Cache (`cache.ts`): chave sha256(tipo + NCM + descrição normalizada + segmento + código
  condicionado). Postgres (`cache_ia`) quando há `DATABASE_URL`; memória do processo caso contrário.
- Testes: 27 testes Vitest (`tests/unit/motor.test.ts`) cobrindo os 12 casos do briefing e mais
  condições, exceções e o caminho da IA com cliente simulado.

### Modelo da OpenRouter

`google/gemini-3.1-flash-lite` (US$ 0,25 por milhão de tokens de entrada, US$ 1,50 de saída, suporte
a structured outputs). Testado com o JSON schema do Carimbo: resposta válida em 1,4 s, português
correto. O `deepseek/deepseek-v4.1-flash` é mais barato por token, mas gastou 3.400 tokens de
raciocínio numa pergunta de duas linhas (25 s e 8× o custo). Trocável por `OPENROUTER_MODEL`.

### Bugs encontrados e corrigidos

- Códigos 0207.14.00 (frango) do anexo não existem mais na NCM vigente; a tabela oficial já traz os
  desdobramentos 0207.14.11 etc., então o motor funciona com os códigos novos.
- Smartphone caía no Anexo V (aparelho para pessoa com deficiência auditiva) só pelo NCM: itens de
  acessibilidade agora exigem termo na descrição.
- Fralda pedia confirmação à IA porque o NCM 9619.00.00 também é de absorvente (zero): itens
  estreitos sem sinal na descrição agora são descartados em vez de virar pergunta.
- Banana caía na regra "sem adição de açúcar" (que vale para conservas do Anexo VII, não para fruta
  fresca do Anexo XV).

## Etapa 2: dados de teste

- `npm run fixtures` gera `fixtures/` com três clientes fictícios (CNPJ com dígito válido, CRT 1):
  Mercadinho Boa Vista (91 produtos), Farmácia São Lucas (70) e Rancho Alegre Pet e Agro (69).
  30 XMLs NF-e/NFC-e 4.00 cada (mistura de modelo 55 e 65, alguns com destinatário CPF para provar
  que ele é ignorado), um .zip por cliente com um evento de cancelamento (não é NF-e) e duas
  planilhas: CSV com ";" e XLSX com NCM formatado.
- Erros de propósito: NCM ausente, NCM com 4 dígitos, NCM inexistente, descrições vagas.
