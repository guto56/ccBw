-- Armazenamento alternativo de arquivos em D1, usado só enquanto o binding R2 não existe na conta.
CREATE TABLE blobs (
  key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
