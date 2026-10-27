-- ContraMulta: schema inicial (D1 / SQLite). Datas em epoch ms (INTEGER) e datas civis em 'YYYY-MM-DD'.

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,          -- SHA-256 do token de acesso (o token nunca é gravado)
  status TEXT NOT NULL,                     -- created | extracted | confirmed | diagnosed | paid | delivered | purged
  email TEXT,
  consent_at INTEGER NOT NULL,
  confirmed_json TEXT,                      -- dados revisados pelo usuário (sem CPF/CNH)
  diagnosis_json TEXT,
  piece_type TEXT,                          -- defesa_previa | recurso_jari | recurso_segunda_instancia
  strength TEXT,                            -- fraca | moderada | forte
  deadline TEXT,                            -- prazo final de defesa/recurso
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  purged_at INTEGER
);
CREATE INDEX idx_cases_created ON cases(created_at);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  kind TEXT NOT NULL,                       -- notificacao | imagem_infracao | crlv
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_uploads_case ON uploads(case_id);

CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  kind TEXT NOT NULL,                       -- notificacao | imagem_infracao | crlv
  model TEXT,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_extractions_case ON extractions(case_id);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  rule_id TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- achado | bloqueio | aviso | nao_verificado
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  thesis_ids TEXT NOT NULL DEFAULT '[]',
  data_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_findings_case ON findings(case_id);

CREATE TABLE theses_applied (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  thesis_id TEXT NOT NULL,
  finding_rule_id TEXT NOT NULL,
  weight INTEGER NOT NULL,
  justification TEXT NOT NULL,
  selected_by TEXT NOT NULL,                -- llm | regras
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_theses_applied_case ON theses_applied(case_id);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  r2_key TEXT,
  plain_text TEXT,
  validation_json TEXT,
  requester_enc TEXT,                       -- dados do requerente cifrados (AES-GCM, DATA_KEY)
  created_at INTEGER NOT NULL,
  downloaded_at INTEGER
);
CREATE INDEX idx_documents_case ON documents(case_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  provider TEXT NOT NULL,                   -- mock | mercadopago
  provider_ref TEXT,
  method TEXT,                              -- pix | cartao
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,                     -- pending | approved | rejected | cancelled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_payments_case ON payments(case_id);
CREATE INDEX idx_payments_ref ON payments(provider, provider_ref);

CREATE TABLE outcomes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  result TEXT NOT NULL,                     -- deferido | indeferido | pendente
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_outcomes_case ON outcomes(case_id);

CREATE TABLE fleet_waitlist (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  vehicles INTEGER NOT NULL,
  fines_per_month INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT,
  name TEXT NOT NULL,                       -- upload | extracted | confirmed | diagnosed | checkout | paid | generated | downloaded | outcome
  meta_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_name ON events(name, created_at);

CREATE TABLE llm_usage (
  id TEXT PRIMARY KEY,
  case_id TEXT,
  stage TEXT NOT NULL,                      -- extracao | imagem | crlv | teses | narrativa
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_llm_usage_case ON llm_usage(case_id);

CREATE TABLE thesis_overrides (
  thesis_id TEXT PRIMARY KEY,
  status TEXT,                              -- rascunho | revisado | suspensa
  weight INTEGER,
  updated_at INTEGER NOT NULL
);
