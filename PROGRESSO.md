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

## Etapa 3: design system

- Tokens em CSS variables (`src/app/globals.css`) com a paleta do briefing; modo escuro por
  `prefers-color-scheme` e por toggle (`data-theme`, salvo no navegador, aplicado antes da pintura).
- Dois tokens extras de texto, `--revisar-texto` e `--ok-texto`: o âmbar #A86A12 e o verde #2E7A4E
  ficam abaixo de 4,5:1 sobre a faixa #E3EEE4 (o axe acusou). As cores do briefing continuam nos
  ícones e preenchimentos; o texto usa a versão um pouco mais escura.
- Schibsted Grotesk 400/500/700 e IBM Plex Mono (só em NCM, CST, cClassTrib, CNPJ, CEST, EAN), com
  `tabular-nums`. Escala: rótulo 11, tabela 13, corpo 15, títulos 18/24/34, display com clamp.
- Componentes: botão, campo de DANFE (exibição e entrada), seletor, furos de tração em SVG com
  picote, visto de caneta animado, número animado, selo de status (sempre ícone + texto), toggle.
- `/estilo` mostra tudo.
- Desvios dos "defaults genéricos" checados contra o craft-floor da Impeccable: sem cartão com
  sombra como estrutura (a única sombra é a "folha" da tabela), sem eyebrow, sem gradiente, sem
  "→" em botão, mono só para código fiscal, numeração só onde é sequência (Como funciona).

## Etapa 4: login e estrutura

- Senha única (`APP_PASSWORD`), sessão em JWT HS256 (jose) num cookie httpOnly, `sameSite=lax`,
  `secure` em produção, 12 h. `src/proxy.ts` (o "middleware" do Next 16) protege `/app/*` e
  `/api/*` (exceto entrar, sair e demo). Limite de 5 tentativas por IP a cada 10 min.
- Barra lateral estreita com clientes como pastas e busca por nome/CNPJ; no celular vira gaveta.
- Faixa fixa no topo: dias até 01/01/2027 e, com um lote aberto, contagens clicáveis (integral,
  redução 60%, zero, revisar, NCM inválido) que filtram a tabela.
- CRUD de clientes com validação de CNPJ (dígitos verificadores) e CNPJ único.

### Persistência (decisão)

O Supabase MCP estava disponível, mas criar projeto foi negado pela política do ambiente e os
projetos ativos da conta são de outros produtos. Em vez de um Postgres local que não funcionaria na
Vercel, clientes, lotes, produtos e classificações ficam no IndexedDB do navegador (Dexie), com o
mesmo formato do schema Drizzle em `src/lib/db/schema.ts` (pronto para migrar para Supabase). Isso
reforça o argumento de privacidade e funciona igual local e na Vercel. A tabela `cache_ia` usa
Postgres quando existe `DATABASE_URL` (cria a tabela sozinha) e memória do processo quando não.
Consequência: os dados ficam no navegador onde foram criados (ver limitações).

## Etapa 5: upload e parsing

- Web Worker (`src/workers/parser.worker.ts`) com JSZip + fast-xml-parser (`parseTagValue: false`
  para não perder o zero à esquerda do NCM). Aceita .xml soltos e .zip, NF-e 55 e NFC-e 65, layout
  4.00; ignora com mensagem eventos, CT-e, resumos e outros layouts. Progresso por arquivo.
- Deduplicação por EAN válido (dígito verificador) ou por cProd + NCM.
- Planilha CSV (detecta ; , tab, aspas, UTF-8 ou Windows-1252) ou XLSX, com tela de mapeamento de
  colunas, palpite automático pelos cabeçalhos e prévia de 5 linhas. NCM numérico que perdeu o zero
  volta a ter 8 dígitos.
- Só a lista de produtos vai para o servidor; o E2E confere que nenhum `<infNFe`, nome ou CPF do
  destinatário aparece nas requisições.

## Etapa 6: classificação e revisão

- Classificação em blocos de 400 produtos; IA só para pendências, com cache.
- Tabela virtualizada (@tanstack/react-virtual), formulário contínuo com faixas alternadas, furos
  de tração e picote. Linha expande com campos de DANFE: justificativa, fonte legal com link para o
  artigo, NCM na tabela vigente, código/EAN, CEST, redução, origem da decisão, alertas.
- Atalhos `j`/`k`, `a`, `e`, `r`, Enter, Esc, `?`. Aprovação em massa só dos itens "sugerido" (regra)
  do filtro atual: itens que passaram pela IA exigem revisão individual.
- Edição: NCM validado na hora contra a tabela vigente, escolha do cClassTrib na tabela oficial
  agrupada por tratamento, "Reclassificar pelo NCM" roda o motor de novo. Salvar = aprovado pelo
  contador.
- Movimento: ao terminar a classificação, as linhas visíveis saem "da impressora" (clip-path em
  degraus, no máximo 24 linhas, total < 1,2 s) com a margem perfurada deslizando; aprovar desenha o
  visto em 250 ms; a faixa troca números com transição curta. `prefers-reduced-motion` desliga tudo.

### Bugs encontrados e corrigidos

- `Furos` recebia `absolute` e `relative` ao mesmo tempo; o `relative` vencia, a faixa de furos
  entrava no fluxo, a tabela ganhava 1.100 px de altura falsa e o foco pulava para a linha 50 com a
  área visível em branco. Agora o componente tem a prop `absoluto`.
- "CARVÃO VEGETAL" casava com o item do Anexo IX "Calcário, casca de coco..., resíduos vegetais"
  pela palavra "vegetais": a comparação usa só o primeiro termo do item e ignora palavras genéricas.
- Aprovação em massa de 4.500 itens levava 3,9 s com `modify`; com `bulkPut` caiu para 1,2 s.
- Cache Components do Next 16 exigia Suspense em todo `useParams`; desligado (o app é client-side).

## Etapa 7: exportação

- XLSX (SheetJS) com aba "Classificação" (colunas código, descrição, NCM, CEST, tratamento,
  CST IBS/CBS, cClassTrib, confiança, justificativa, fonte, status; códigos como texto) e aba
  "Sobre" (cliente, versões das tabelas, aviso). CSV com ";" e BOM para o Excel. PDF (jsPDF +
  autotable) com resumo por tratamento, itens para revisar e aviso de responsabilidade.
- Formatos de ERP: pesquisei Bling, Tiny/Olist e Omie. O Omie exige baixar o modelo dentro do
  sistema e a planilha é protegida por senha; Bling e Tiny também só oferecem o modelo logado. Sem
  modelo público verificável, não inventei layout: fica só o genérico.

## Etapa 8: landing

- Hero com demo ao vivo: trecho de DANFE com 6 produtos; "Classificar" chama `/api/demo`, que roda
  o motor de regras real (sem IA) e preenche os códigos linha a linha; clicar numa linha mostra
  justificativa e fonte.
- Seções: como funciona (4 passos numerados), casos em que o erro custa dinheiro, privacidade
  (o que fica no navegador × o que vai para a classificação), preços (Avulso R$ 49 por CNPJ,
  Escritório R$ 297/mês até 20 CNPJs, botões "Em breve" desativados), perguntas frequentes, termos.
- Imagem OG gerada por código (`opengraph-image.tsx`, next/og), sem IA.

## Etapa 9: teste completo

- `npm test`: 27 testes do motor. `npx playwright test`: 7 cenários.
  - fluxo completo com as três fixtures (.zip): login, cliente, upload, classificação, filtros da
    faixa, atalhos, aprovação, aprovação em massa, XLSX conferido célula a célula, CSV e PDF;
  - planilha CSV com mapeamento, correção de NCM inválido, reclassificação e aprovação;
  - login errado, redirecionamento e API protegida (401);
  - telas em 1440×900 e 390×844, claro e escuro (salvas em `test-results/telas/`), sem rolagem
    horizontal, sem erro de console e sem violação séria/crítica do axe (WCAG 2.1 AA);
  - 5.000 produtos: classificados em ~5 s (com cache), menos de 80 linhas no DOM, rolagem até o fim
    e 20 teclas em ~0,6 s, aprovação em massa em ~1,2 s.
- Lighthouse (local, build de produção): acessibilidade 100 e boas práticas 100 em `/`, `/app`,
  `/app/clientes/novo` e `/entrar`; desempenho 94 a 98.
- Chave da OpenRouter: busca em `.next/static` não encontra `sk-or-v1` nem parte da chave.

## Etapa 10: deploy

- Branch `carimbo` enviada ao GitHub (guto56/ccBw).
- **Bloqueado**: o conector da Vercel responde 403 "You don't have permission to create the project"
  para criar projeto (API e vínculo com o Git) e para criar deployment. O time "guto's projects" não
  tem nenhum projeto e o token do conector não tem permissão de criação. Não há Vercel CLI com token
  neste ambiente. O E2E contra a URL publicada fica para depois do deploy (basta rodar
  `E2E_BASE_URL=https://... npx playwright test`).
- Para publicar: em vercel.com > Add New > Project > importar `guto56/ccBw`, branch `carimbo`,
  framework Next.js, e cadastrar as variáveis `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
  `APP_PASSWORD`, `SESSION_SECRET` (mínimo 32 caracteres) e, opcional, `DATABASE_URL`.

## Custo de IA

12,2% dos produtos das três fixtures viram pergunta para a IA (28 de 230). Cada pergunta custa
~90 tokens de entrada e ~60 de saída no gemini-3.1-flash-lite: ~US$ 0,00011. Por 1.000 produtos:
~120 perguntas, ~US$ 0,015 (menos de R$ 0,10), antes do cache; reclassificações e produtos
repetidos entre clientes saem do cache.

## Limitações conhecidas

- Dados no navegador: clientes e lotes não sincronizam entre computadores ou navegadores, e somem se
  o navegador apagar os dados do site. O schema Postgres está pronto para a versão com servidor.
- Anexo XIV (medicamentos com alíquota zero) não tem NCM na tabela oficial: medicamento sai como
  redução de 60% com alerta para conferir.
- O motor cobre venda de mercadorias no varejo. Ficam fora: serviços, operações com administração
  pública, diferimento, regimes aduaneiros, ZFM, produtor rural in natura (art. 137, depende de
  quem vende).
- A NT 2025.002 v1.51 deixou a obrigatoriedade do grupo IBS/CBS para CRT 1 e 4 sem data; o contador
  da faixa usa 01/01/2027 (início do IBS/CBS para o Simples pela LC 214/2025), como pedido.
- Limite de tentativas de login e cache sem `DATABASE_URL` vivem na memória de cada instância.
- Cloudflare Workers AI não foi usado (sem token no ambiente e sem necessidade).
