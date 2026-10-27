import { purgeCase } from "./routes/case";

/** Apaga uploads e dados pessoais de casos com mais de RETENTION_DAYS dias. */
export async function purgeExpired(env: Env): Promise<number> {
  const days = Number(env.RETENTION_DAYS || "30");
  const cutoff = Date.now() - days * 86_400_000;
  const r = await env.DB.prepare("SELECT id FROM cases WHERE created_at < ? AND purged_at IS NULL LIMIT 200").bind(cutoff).all<{ id: string }>();
  let n = 0;
  for (const row of r.results ?? []) {
    await purgeCase(env, row.id);
    n++;
  }
  console.log(JSON.stringify({ msg: "limpeza_retencao", casos_apagados: n, dias: days }));
  return n;
}
