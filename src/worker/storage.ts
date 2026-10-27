// Arquivos do caso (cases/{id}/...). Usa o R2 (binding UPLOADS); sem o binding, cai para uma tabela do D1,
// limitada a arquivos de até 1,9 MB. O fallback existe só para o ambiente de testes enquanto o R2 não está ativo.

export interface StoredObject {
  contentType: string;
  body: ReadableStream | ArrayBuffer;
  arrayBuffer(): Promise<ArrayBuffer>;
  json<T>(): Promise<T>;
}

export interface FileStore {
  kind: "r2" | "d1";
  maxObjectBytes: number;
  put(key: string, data: ArrayBuffer | string, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  deletePrefix(prefix: string): Promise<number>;
}

export const D1_MAX_OBJECT = 1_900_000;

export function fileStore(env: Env): FileStore {
  const bucket = (env as { UPLOADS?: R2Bucket }).UPLOADS;
  if (bucket) {
    return {
      kind: "r2",
      maxObjectBytes: 8 * 1024 * 1024,
      async put(key, data, contentType) {
        await bucket.put(key, data, { httpMetadata: { contentType } });
      },
      async get(key) {
        const obj = await bucket.get(key);
        if (!obj) return null;
        return {
          contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
          body: obj.body,
          arrayBuffer: () => obj.arrayBuffer(),
          json: <T>() => obj.json<T>(),
        };
      },
      async deletePrefix(prefix) {
        let n = 0;
        let cursor: string | undefined;
        do {
          const list = await bucket.list({ prefix, cursor });
          if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
          n += list.objects.length;
          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
        return n;
      },
    };
  }
  return {
    kind: "d1",
    maxObjectBytes: D1_MAX_OBJECT,
    async put(key, data, contentType) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
      if (bytes.byteLength > D1_MAX_OBJECT) throw new Error("arquivo grande demais para o armazenamento temporário");
      await env.DB.prepare("INSERT OR REPLACE INTO blobs (key, content_type, data, size, created_at) VALUES (?,?,?,?,?)").bind(key, contentType, bytes, bytes.byteLength, Date.now()).run();
    },
    async get(key) {
      const row = await env.DB.prepare("SELECT content_type, data FROM blobs WHERE key = ?").bind(key).first<{ content_type: string; data: ArrayBuffer | number[] }>();
      if (!row) return null;
      const buf = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
      return {
        contentType: row.content_type,
        body: buf,
        arrayBuffer: async () => buf,
        json: async <T>() => JSON.parse(new TextDecoder().decode(buf)) as T,
      };
    },
    async deletePrefix(prefix) {
      const r = await env.DB.prepare("DELETE FROM blobs WHERE key LIKE ? || '%'").bind(prefix).run();
      return r.meta.changes ?? 0;
    },
  };
}
