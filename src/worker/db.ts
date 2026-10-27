import { sha256Hex } from "./util";

export interface CaseRow {
  id: string;
  token_hash: string;
  status: string;
  email: string | null;
  consent_at: number;
  confirmed_json: string | null;
  diagnosis_json: string | null;
  piece_type: string | null;
  strength: string | null;
  deadline: string | null;
  created_at: number;
  updated_at: number;
  purged_at: number | null;
}

export async function caseByToken(env: Env, token: string | null | undefined): Promise<CaseRow | null> {
  if (!token || token.length < 40 || token.length > 64) return null;
  const hash = await sha256Hex(token);
  return env.DB.prepare("SELECT * FROM cases WHERE token_hash = ?").bind(hash).first<CaseRow>();
}

export async function logEvent(env: Env, caseId: string | null, name: string, meta?: Record<string, unknown>): Promise<void> {
  await env.DB.prepare("INSERT INTO events (case_id, name, meta_json, created_at) VALUES (?,?,?,?)")
    .bind(caseId, name, meta ? JSON.stringify(meta) : null, Date.now())
    .run();
}

export async function setStatus(env: Env, caseId: string, status: string): Promise<void> {
  await env.DB.prepare("UPDATE cases SET status = ?, updated_at = ? WHERE id = ?").bind(status, Date.now(), caseId).run();
}

export async function thesisOverrides(env: Env): Promise<{ thesis_id: string; status: string | null; weight: number | null }[]> {
  const r = await env.DB.prepare("SELECT thesis_id, status, weight FROM thesis_overrides").all<{ thesis_id: string; status: string | null; weight: number | null }>();
  return r.results ?? [];
}
