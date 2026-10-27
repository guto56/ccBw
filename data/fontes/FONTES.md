# Fontes oficiais

Todo código fiscal usado pelo motor vem destes arquivos. Para baixar de novo e regenerar
`src/data/*.json`: `npm run atualizar-tabelas` (ou `-- --local` para só regenerar).
O arquivo `versoes.json` guarda a data do último download.

| Arquivo | Conteúdo | URL | Versão | Baixado em |
|---|---|---|---|---|
| `ncm.json` | Tabela NCM vigente (15.157 linhas, 10.516 códigos de 8 dígitos) | https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json | "Vigente em 27/10/2026", Resolução Gecex nº 926/2026 | 27/10/2026 |
| `cclasstrib-svrs.json` | Tabela de Classificação Tributária do IBS/CBS: 18 CST, 173 cClassTrib, e a relação NCM × anexo da LC 214/2025 (itens, condições, exceções, permitido/vedado) para 1.792 NCMs | https://dfe-portal.svrs.rs.gov.br/DFE/ClassificacaoTributaria (Portal da Conformidade Fácil, SVRS, JSON embutido na página pública) | Publicação mais recente na tabela: 01/10/2026 (corresponde ao Informe Técnico 2025.002 v1.70) | 27/10/2026 |

## Gerados a partir das fontes (`src/data/`)

- `ncm.json`: código de 8 dígitos → descrição e vigência, mais as descrições da hierarquia (capítulo, posição, subposição).
- `cclasstrib.json`: CST, cClassTrib, percentuais de redução, anexo e link da LC 214/2025 de cada código.
- `anexos-ncm.json`: para cada NCM, as entradas de anexo (cClassTrib, PERMITIDO/VEDADO, condição, exceção, texto do item).

## Legislação de referência

- LC 214/2025 (texto compilado): https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm
  O servidor do Planalto recusa conexões deste ambiente de build (resposta vazia), por isso os
  anexos não foram extraídos do HTML do Planalto. A relação NCM × anexo usada vem da tabela oficial
  acima, mantida pela RFB/Comitê Gestor e publicada no Portal da Conformidade Fácil, que traz o texto
  de cada item do anexo (`DescItemAnexo`), as condições (`DescCondicao`) e as exceções (`DescExcecao`),
  além do link para o artigo da LC 214/2025 em cada cClassTrib (`TexUrlLegislacao`).
- Anexo XIV (medicamentos com alíquota zero, art. 146): lista princípios ativos, sem NCM na tabela
  oficial. O motor trata medicamento de uso humano (NCM 30.03/30.04) como redução de 60% (art. 133,
  cClassTrib 200032) com confiança média e alerta para conferir o Anexo XIV (cClassTrib 200009).
- NT 2025.002-RTC (NF-e/NFC-e, grupo UB "IBSCBS" por item: CST, cClassTrib, vBC, pIBSUF, pIBSMun, pCBS).
  Para CRT 1 (Simples), 2 e 4 (MEI) a obrigatoriedade do grupo é de "implementação futura": a v1.51
  revogou a data de 04/01/2027 que constava em versões anteriores
  (https://nfe.io/docs/documentacao/reforma-tributaria/conceitos-funcionais/nota-fiscal-de-produto/adequacao-nt-2025-002-rtc-v150/).
  Não há cClassTrib ou CST próprios do Simples para venda de mercadorias; os códigos ligados ao
  regime são 410035 (nanoempreendedor) e 811003 (desenquadramento), fora do escopo deste produto.
