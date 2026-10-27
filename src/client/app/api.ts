// Cliente da API. O token do caso vem do fragmento da URL (/c#token) e vai só no header.
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

const VALID = /^[A-Za-z0-9_-]{40,64}$/;

/** Token do caso: do fragmento da URL; na volta do checkout externo (sem fragmento), da sessão do navegador. */
export function caseToken(): string | null {
  const t = location.hash.replace(/^#/, "").split("&")[0] ?? "";
  if (VALID.test(t)) {
    try {
      sessionStorage.setItem("contramulta:caso", t);
    } catch {
      /* armazenamento indisponível */
    }
    return t;
  }
  if (location.pathname === "/c") {
    try {
      const s = sessionStorage.getItem("contramulta:caso");
      if (s && VALID.test(s)) {
        history.replaceState(null, "", `/c#${s}`);
        return s;
      }
    } catch {
      /* armazenamento indisponível */
    }
  }
  return null;
}

export async function api<T>(path: string, opts: { method?: string; json?: unknown; form?: FormData; token?: string | null; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const token = opts.token === undefined ? caseToken() : opts.token;
  if (token) headers["X-Case-Token"] = token;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.json !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (e) {
    const name = (e as Error).name;
    throw new ApiError(0, name === "TimeoutError" ? "Demorou mais que o esperado. Tente de novo." : "Sem conexão. Confira sua internet e tente de novo.");
  }
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const b = (typeof body === "object" ? body : {}) as Record<string, unknown>;
    throw new ApiError(res.status, typeof b.error === "string" ? b.error : "Algo deu errado. Tente de novo.", b);
  }
  return body as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = caseToken();
  const res = await fetch(path, { headers: token ? { "X-Case-Token": token } : {} });
  if (!res.ok) throw new ApiError(res.status, "Arquivo indisponível.");
  return res.blob();
}

export interface Config {
  ambiente: string;
  turnstile_site_key: string;
  preco_centavos: number;
  pagamento: "mock" | "mercadopago";
  pdf_nativo: boolean;
  leitura_automatica: boolean;
}

let configPromise: Promise<Config> | null = null;
export function getConfig(): Promise<Config> {
  configPromise ??= api<Config>("/api/config", { token: null });
  return configPromise;
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}
