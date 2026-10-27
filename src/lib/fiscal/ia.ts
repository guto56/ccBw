import "server-only";
import { z } from "zod";
import type { Confianca, RespostaIA, TipoPendencia } from "./tipos";

export interface PerguntaIA {
  id: string;
  tipo: TipoPendencia;
  pergunta: string;
  segmento: string;
}

export interface ClienteIA {
  modelo: string;
  responder(perguntas: PerguntaIA[]): Promise<Map<string, RespostaIA>>;
}

const RespostaSchema = z.object({
  respostas: z.array(
    z.object({
      id: z.string(),
      ncm: z.string().nullable(),
      atende: z.boolean().nullable(),
      confianca: z.enum(["alta", "media", "baixa"]),
      justificativa: z.string().max(400),
    }),
  ),
});

const SCHEMA_JSON = {
  name: "respostas_fiscais",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["respostas"],
    properties: {
      respostas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "ncm", "atende", "confianca", "justificativa"],
          properties: {
            id: { type: "string" },
            ncm: { type: ["string", "null"], description: "NCM de 8 dígitos, só números, ou null" },
            atende: { type: ["boolean", "null"], description: "Resposta sim/não para perguntas de condição, ou null" },
            confianca: { type: "string", enum: ["alta", "media", "baixa"] },
            justificativa: { type: "string", description: "Uma frase curta em português" },
          },
        },
      },
    },
  },
} as const;

const SISTEMA = `Você apoia contadores brasileiros na classificação de produtos para o IBS e a CBS (LC 214/2025).
Responda somente com o JSON pedido. Para cada pergunta, devolva o mesmo id.
- Tipo "sugerir_ncm" ou "descricao_vaga": informe em "ncm" o código NCM de 8 dígitos (só números) mais provável para o produto, segundo a Nomenclatura Comum do Mercosul vigente. Se a descrição não permitir identificar o produto, use null e confiança "baixa". "atende" fica null.
- Tipo "condicao": responda em "atende" true ou false à pergunta sobre o produto. Se não for possível saber pela descrição, use null e confiança "baixa". "ncm" fica null.
- "justificativa": uma frase curta, objetiva, em português do Brasil, sem repetir a pergunta.
- Confiança "alta" só quando a descrição não deixa dúvida. Nunca invente características que a descrição não sustenta.
- Considere o segmento do cliente (mercado, farmácia, pet shop, agropecuária) como contexto de uso provável.`;

export function clienteOpenRouter(opcoes?: { chave?: string; modelo?: string; timeoutMs?: number; lote?: number }): ClienteIA | null {
  const chave = opcoes?.chave ?? process.env.OPENROUTER_API_KEY;
  if (!chave) return null;
  const modelo = opcoes?.modelo ?? process.env.OPENROUTER_MODEL ?? "google/gemini-3.1-flash-lite";
  const timeoutMs = opcoes?.timeoutMs ?? 30_000;
  const tamanhoLote = opcoes?.lote ?? 25;

  async function chamar(perguntas: PerguntaIA[], tentativa = 1): Promise<RespostaIA[]> {
    const corpo = {
      model: modelo,
      temperature: 0,
      messages: [
        { role: "system", content: SISTEMA },
        {
          role: "user",
          content: JSON.stringify(perguntas.map((p) => ({ id: p.id, tipo: p.tipo, segmento: p.segmento, pergunta: p.pergunta }))),
        },
      ],
      response_format: { type: "json_schema", json_schema: SCHEMA_JSON },
    };
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          "X-Title": "Carimbo",
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`OpenRouter HTTP ${r.status}`);
      const dados = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const texto = dados.choices?.[0]?.message?.content ?? "";
      const json = JSON.parse(texto.replace(/^```(json)?|```$/g, "").trim());
      return RespostaSchema.parse(json).respostas.map((x) => ({
        id: x.id,
        ncm: x.ncm,
        atende: x.atende,
        confianca: x.confianca as Confianca,
        justificativa: x.justificativa.trim(),
      }));
    } catch (e) {
      if (tentativa < 2) return chamar(perguntas, tentativa + 1);
      console.error("[ia] lote falhou:", (e as Error).message);
      return [];
    }
  }

  return {
    modelo,
    async responder(perguntas) {
      const lotes: PerguntaIA[][] = [];
      for (let i = 0; i < perguntas.length; i += tamanhoLote) lotes.push(perguntas.slice(i, i + tamanhoLote));
      const saida = new Map<string, RespostaIA>();
      // até 4 lotes em paralelo
      for (let i = 0; i < lotes.length; i += 4) {
        const res = await Promise.all(lotes.slice(i, i + 4).map((l) => chamar(l)));
        for (const lista of res) for (const x of lista) saida.set(x.id, x);
      }
      return saida;
    },
  };
}
