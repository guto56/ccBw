# Revisão jurídica antes de cobrar dinheiro real

Checklist para um advogado de trânsito. Nada abaixo foi revisado por advogado. Enquanto houver item
aberto, o produto só pode rodar em ambiente de testes, com pagamento simulado.

## 1. Base normativa

- [ ] Confirmar que as Resoluções CONTRAN nº 918/2022, 909/2022 e 920/2022 estão vigentes e sem
      alterações além da Resolução nº 991/2023 (a conferência automática foi feita só pelo DOU; a página
      consolidada do CONTRAN bloqueia download automatizado).
- [ ] Baixar manualmente o MBFT (Anexo da Resolução nº 985/2022, com as alterações das Resoluções
      nº 1.009/2024, 1.012/2024, 1.022/2026, 1.023/2026 e 1.031/2026) e liberar a conferência de código
      de infração. Hoje ela está desligada.
- [ ] Conferir cada trecho de `legal/excerpts.json` contra a fonte (texto literal, sem notas editoriais).
- [ ] Verificar se há norma estadual ou municipal relevante para os órgãos mais frequentes (fora do escopo do MVP).

## 2. Regras do motor (`src/shared/rules`)

- [ ] **Intempestividade da NA.** Regra atual: há achado quando a diferença em dias corridos entre a data
      da infração e a data de expedição é maior que 30. Expedição = data impressa como expedição ou, na
      falta dela, data de postagem (art. 30, I, da Resolução nº 918/2022). Confirmar:
      - se o dia 30 conta como tempestivo (hoje: 30 dias = tempestivo; 31 = intempestivo);
      - o tratamento das exceções (art. 281, § 2º, do CTB; art. 5º, § 3º, da Resolução nº 918/2022;
        autuação que não seja em flagrante);
      - se a data de postagem impressa pelo órgão é prova suficiente da expedição.
- [ ] **Elementos obrigatórios.** O motor só considera os incisos I, II, III e V do art. 280 do CTB
      (IV e VI são "sempre que possível"). Só há achado quando o usuário marca "não consta na notificação".
      Confirmar se "espécie" do veículo deve ser exigida isoladamente.
- [ ] **Divergência de veículo.** Placa (com equivalência placa antiga × Mercosul) e marca. Confirmar
      o peso 3 e se divergência só de modelo justifica a tese.
- [ ] **Enquadramento.** Conferência de descrição × artigo × natureza × valor × pontos para arts. 167
      e 252 (V, VI e parágrafo único). Confirmar a aceitação de valores com 20% e 40% de desconto.
- [ ] **Prazo de defesa/recurso.** Prazo impresso na notificação, prorrogado para o dia útil seguinte
      quando cai em sábado ou domingo (art. 29 da Resolução nº 918/2022). Feriados **não** são
      considerados (escolha conservadora: o produto pode bloquear a venda um dia antes do necessário).
      Confirmar a regra de bloqueio da venda.
- [ ] **Peça cabível.** NA → defesa prévia; NP → recurso à JARI; NP com JARI já indeferida → recurso
      em 2ª instância. Confirmar destinatários e se o usuário pode apresentar defesa prévia e indicação de
      condutor juntas.
- [ ] **Desconto do SNE.** Texto do aviso no diagnóstico (perda do pagamento por 60% ao apresentar
      defesa ou recurso; pagamento por 80% não impede o questionamento — art. 284, caput, §§ 1º e 2º, do CTB).

## 3. Teses (`legal/theses.json`)

Para cada tese: condição de aplicação, fundamento, peso (1–3), texto-modelo, pedido. Mudar o status
de `rascunho` para `revisado` só depois da revisão (pelo /admin ou no arquivo).

- [ ] T01 Intempestividade da notificação da autuação (peso 3)
- [ ] T02 Ausência de elemento obrigatório do auto (peso 2)
- [ ] T03 Inconsistência na identificação do veículo (peso 3)
- [ ] T04 Imagem que não comprova a conduta — celular ou cinto (peso 2)
- [ ] T05 Erro de enquadramento (peso 2)
- [ ] T06 Agente que referendou o registro não identificado — acessória (peso 1). Base: art. 3º, § 3º, da
      Resolução nº 918/2022. "Falta de regulamentação de IA" **não** é usada como tese.
- [ ] T07 Meio de constatação não informado — acessória (peso 1). Base: Res. 909/2022, art. 2º, p.u., e
      Res. 920/2022, art. 7º.
- [ ] T08 Avaliação de conformidade (INMETRO) do sistema automático não metrológico — acessória (peso 1).
      Base: Res. 920/2022, art. 3º, I. Confirmar se cabe para câmeras de celular/cinto e como pedir a prova.

## 4. Peça gerada

- [ ] Estrutura (destinatário, qualificação, fatos, direito, pedidos, local/data, assinatura).
- [ ] Linguagem dos parágrafos de narrativa escritos pela IA (só fatos, sem citação).
- [ ] Checklist de anexos (cópia da notificação, documento de identificação, CRLV, procuração quando
      não for o próprio proprietário/condutor).
- [ ] Passo a passo de protocolo e links oficiais por órgão (hoje: genérico + "use o canal indicado na
      sua notificação").

## 5. Produto e consumidor

- [ ] Termos de uso e política de privacidade (rascunhos em `src/client/pages/Legal.tsx`).
- [ ] Texto de transparência: sem garantia de resultado, o usuário assina e protocola, não é advocacia.
      Verificar limites do Estatuto da Advocacia e do Código de Ética da OAB para o modelo de negócio.
- [ ] Política de reembolso (CDC, arrependimento em compra online).
- [ ] Uso de dados para recalibrar pesos (resultado informado pelo usuário) — base legal LGPD.
- [ ] Retenção de 30 dias dos arquivos e dados do requerente.
