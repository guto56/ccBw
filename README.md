# Carimbo

Classificação tributária em lote (NCM, CST e cClassTrib do IBS/CBS) para escritórios contábeis
preparando clientes do Simples Nacional e MEI. Sugestões para revisão do contador responsável.

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev                  # http://localhost:3000
npm test                     # motor fiscal (Vitest)
npm run build && npx playwright test   # E2E
npm run atualizar-tabelas    # baixa NCM e cClassTrib oficiais e regenera src/data
npm run fixtures             # regenera fixtures/
```

Fontes oficiais em `data/fontes/FONTES.md`. Histórico, decisões e limitações em `PROGRESSO.md`.
