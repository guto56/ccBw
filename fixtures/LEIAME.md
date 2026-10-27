# Fixtures de teste

Geradas por `npm run fixtures` (dados fictícios; nenhum dado real de cliente).

- Mercadinho Boa Vista: CNPJ 12345678000195, 91 produtos, 30 XMLs
- Farmácia São Lucas: CNPJ 23456789000195, 70 produtos, 30 XMLs
- Rancho Alegre Pet e Agro: CNPJ 34567890000130, 69 produtos, 30 XMLs

Cada pasta tem os XMLs soltos; o .zip de mesmo nome traz os mesmos XMLs e mais um evento de cancelamento (não é NF-e, deve ser ignorado com aviso).

- `produtos-mercadinho.csv`: planilha com separador ; e cabeçalhos do ERP.
- `produtos-pet-agro.xlsx`: planilha com NCM formatado (0000.00.00) na coluna "Classificação fiscal".

Erros de propósito: NCM ausente, NCM com 4 dígitos, NCM inexistente (99999999, 12345678), descrições vagas ("DIVERSOS", "PRODUTO 01", "MERCADORIA").
