# Base jurídica do ContraMulta

Todo texto jurídico usado pelo produto vem desta pasta. A IA não cria fundamento: ela só escolhe
IDs do catálogo e escreve a narrativa dos fatos. O validador pós-geração remove qualquer citação
que não esteja aqui.

## Fontes baixadas (status `baixado`)

| Norma | Fonte oficial | Acesso |
| --- | --- | --- |
| Lei nº 9.503/1997 (CTB), texto compilado | https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm | 2026-10-27 |
| Resolução CONTRAN nº 918/2022 (autuação, notificação, defesa, recursos, pagamento) | DOU 01/04/2022, ed. 63, seção 1, p. 98 — https://www.in.gov.br/web/dou/-/resolucao-contran-n-918-de-28-de-marco-de-2022-390284741 | 2026-10-27 |
| Resolução CONTRAN nº 991/2023 (altera arts. 25 e 27 da 918; não usados nas teses) | DOU 25/04/2023 — https://www.in.gov.br/web/dou/-/resolucao-contran-n-991-de-19-de-abril-de-2023-479093467 | 2026-10-27 |
| Resolução CONTRAN nº 909/2022 (videomonitoramento) | DOU 01/04/2022, ed. 63, p. 91 — https://www.in.gov.br/web/dou/-/resolucao-contran-n-909-de-28-de-marco-de-2022-390284259 | 2026-10-27 |
| Resolução CONTRAN nº 920/2022 (sistemas automáticos não metrológicos) | DOU 01/04/2022, ed. 63, p. 101 — https://www.in.gov.br/web/dou/-/resolucao-contran-n-920-de-28-de-marco-de-2022-390319360 | 2026-10-27 |
| Resolução CONTRAN nº 1.013/2024 (free flow; só remete à 920) | DOU 16/10/2024 | 2026-10-27 |

Cada arquivo em `sources/` tem o HTML bruto, o texto extraído e um `.meta.json` com URL, data de
acesso e SHA-256 do HTML.

## Pendente (status `PENDENTE`, não usado)

- **MBFT — Anexo da Resolução CONTRAN nº 985/2022 (tabela de códigos de infração).** O Anexo só é
  publicado em gov.br/transportes, que exige captcha e bloqueia download automatizado. O texto da
  Resolução no DOU diz apenas que o Anexo está no sítio do órgão máximo executivo de trânsito da União.
  Consequência: o motor de regras **não** confere o código da infração contra a tabela oficial. Ele
  confere descrição × artigo × natureza × valor × pontos apenas para os dispositivos que estão na base
  (CTB arts. 167, 252, 258 e 259). Para liberar: baixar manualmente o MBFT consolidado, salvar em
  `sources/`, gerar `mbft.json` e mudar o status em `excerpts.spec.json`.
- **Página de resoluções do CONTRAN em gov.br/transportes.** Mesmo bloqueio. As resoluções foram
  obtidas no Diário Oficial da União (in.gov.br), que é a publicação oficial. A vigência foi conferida
  por busca no DOU (ver `vigencia_check.json`), não pela página consolidada do CONTRAN.

## Arquivos

- `excerpts.spec.json` — quais dispositivos extrair de cada fonte (âncoras de início e fim).
- `excerpts.json` — gerado por `python3 -I tools/legal/build_excerpts.py`. Texto literal estruturado
  em caput, parágrafos, incisos e alíneas. As notas editoriais do planalto ("Redação dada pela...",
  "Incluído pela...", "Vigência") são removidas; o texto tachado (revogado) já é descartado na conversão.
- `theses.json` — catálogo de teses, peças e avisos. Fundamento = referência a trechos de `excerpts.json`.
- `vigencia_check.json` — resoluções CONTRAN de 2022–2026 lidas no DOU para checar alterações.

## Atualizar

```bash
./tools/legal/fetch_ctb.sh
python3 -I tools/legal/dou_fetch.py <url-do-dou> contran_resNNN_AAAA
python3 -I tools/legal/build_excerpts.py
npm test   # os testes conferem que toda citação das teses existe na base
```
