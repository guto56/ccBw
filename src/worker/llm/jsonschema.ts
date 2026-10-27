import { z } from "zod";

const DROP = new Set(["$schema", "pattern", "default", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "format"]);

function prune(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(prune);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) if (!DROP.has(k)) out[k] = prune(v);
    return out;
  }
  return node;
}

/**
 * JSON Schema para structured output (response_format json_schema, strict).
 * Restrições numéricas e de tamanho saem do schema enviado (nem todo provedor aceita);
 * o zod continua validando tudo na volta.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return prune(z.toJSONSchema(schema, { io: "output" })) as Record<string, unknown>;
}
