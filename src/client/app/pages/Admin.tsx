import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorBox, formatDateBR } from "../ui";

interface Summary {
  funil: Record<string, number>;
  custo_ia: { chamadas: number; custo: number; casos: number; falhas: number; custo_por_caso: number; por_etapa: { stage: string; chamadas: number; custo_medio: number; latencia_media: number }[] };
  resultados: Record<string, number>;
  frotas: number;
}
interface CaseRow {
  id: string;
  status: string;
  criado_em: number;
  apagado: boolean;
  email: string;
  orgao: string | null;
  placa: string;
  artigo: string | null;
  peca: string | null;
  forca: string | null;
  prazo: string | null;
  pagamento: string | null;
  teses: string[];
  custo_ia_usd: number;
  chamadas_ia: number;
  resultado: string | null;
  requerente: Record<string, string> | null;
}
interface ThesisRow {
  id: string;
  titulo: string;
  acessoria: boolean;
  peso: number;
  peso_base: number;
  status: string;
  status_base: string;
  resultados: { deferido: number; indeferido: number; pendente: number };
}

const KEY = "contramulta:admin";

async function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
  return body as T;
}

const DASH = "\u2014"; // valor ausente em tabela
const usd = (n: number) => `US$ ${n.toFixed(4)}`;
const FUNNEL: [string, string][] = [
  ["upload", "Envios"],
  ["diagnostico", "Diagnósticos"],
  ["checkout", "Checkouts"],
  ["pagamento", "Pagamentos"],
  ["peca_gerada", "Peças geradas"],
  ["download", "Downloads"],
];

export default function Admin() {
  const [token, setToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [theses, setTheses] = useState<ThesisRow[]>([]);
  const [fleet, setFleet] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Admin · ContraMulta";
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [s, c, t, f] = await Promise.all([
        adminFetch<Summary>(token, "/api/admin/summary"),
        adminFetch<{ casos: CaseRow[] }>(token, "/api/admin/cases?limit=100"),
        adminFetch<{ teses: ThesisRow[] }>(token, "/api/admin/theses"),
        adminFetch<{ frotas: Record<string, unknown>[] }>(token, "/api/admin/fleet"),
      ]);
      setSummary(s);
      setCases(c.casos);
      setTheses(t.teses);
      setFleet(f.frotas);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("autorizado")) {
        setToken("");
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* sem armazenamento */
        }
      }
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function login(e: FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem(KEY, input);
    } catch {
      /* sem armazenamento */
    }
    setToken(input);
    setInput("");
  }

  async function saveThesis(id: string, patch: { status?: string; weight?: number }) {
    try {
      await adminFetch(token, `/api/admin/theses/${id}`, { method: "POST", body: JSON.stringify(patch) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!token)
    return (
      <div className="wrap max-w-[520px] py-24">
        <h1 className="app-title">Admin</h1>
        <form onSubmit={login} className="mt-8 grid gap-4">
          <label htmlFor="tok" className="font-semibold">
            Token de administração
          </label>
          <input id="tok" type="password" className="input" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
          <button className="btn btn-quiet justify-self-start" type="submit">
            Entrar
          </button>
        </form>
        {error && <ErrorBox message={error} />}
      </div>
    );

  const th = "py-2 pr-4 text-left font-semibold";
  const td = "py-2 pr-4 align-top";
  return (
    <div className="wrap py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="font-display text-2xl">ContraMulta · admin</p>
        <div className="flex gap-4 small">
          <button type="button" className="link border-0 bg-transparent p-0" onClick={load}>
            Atualizar
          </button>
          <button
            type="button"
            className="link border-0 bg-transparent p-0"
            onClick={() => {
              sessionStorage.removeItem(KEY);
              setToken("");
            }}
          >
            Sair
          </button>
        </div>
      </header>
      {error && <ErrorBox message={error} />}

      {summary && (
        <section aria-labelledby="h-funil" className="mt-10">
          <h1 id="h-funil" className="text-[1.5rem]">
            Funil
          </h1>
          <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {FUNNEL.map(([k, l]) => (
              <div key={k}>
                <dt className="small muted">{l}</dt>
                <dd className="m-0 font-display text-[2.5rem] leading-none tabular">{summary.funil[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            <div>
              <h2 className="text-[1.25rem]">Custo de IA</h2>
              <p className="mt-3 tabular">
                {usd(summary.custo_ia.custo)} em {summary.custo_ia.chamadas} chamadas
              </p>
              <p className="tabular">
                <strong>{usd(summary.custo_ia.custo_por_caso)}</strong> por caso ({summary.custo_ia.casos} casos)
              </p>
              <p className="small muted tabular">{summary.custo_ia.falhas} chamadas com falha</p>
            </div>
            <div>
              <h2 className="text-[1.25rem]">Por etapa</h2>
              <table className="mt-3 w-full small tabular">
                <thead>
                  <tr>
                    <th className={th}>Etapa</th>
                    <th className={th}>Chamadas</th>
                    <th className={th}>Custo médio</th>
                    <th className={th}>Latência</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.custo_ia.por_etapa.map((e) => (
                    <tr key={e.stage}>
                      <td className={td}>{e.stage}</td>
                      <td className={td}>{e.chamadas}</td>
                      <td className={td}>{usd(e.custo_medio)}</td>
                      <td className={td}>{Math.round(e.latencia_media)} ms</td>
                    </tr>
                  ))}
                  {summary.custo_ia.por_etapa.length === 0 && (
                    <tr>
                      <td className={td} colSpan={4}>
                        {DASH}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="text-[1.25rem]">Resultados informados</h2>
              <p className="mt-3 tabular">
                Deferido {summary.resultados.deferido ?? 0} · Indeferido {summary.resultados.indeferido ?? 0} · Pendente {summary.resultados.pendente ?? 0}
              </p>
              <p className="small muted">Frotas na lista de espera: {summary.frotas}</p>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="h-casos" className="mt-14">
        <h2 id="h-casos" className="text-[1.5rem]">
          Casos (dados mascarados)
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] small tabular" style={{ borderCollapse: "collapse" }}>
            <thead style={{ borderBottom: "1.5px solid var(--ink)" }}>
              <tr>
                {["Caso", "Criado", "Status", "Órgão", "Placa", "Artigo", "Peça", "Força", "Prazo", "Pagamento", "Teses", "Custo IA", "Resultado", "Requerente"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className={td}>{c.id}</td>
                  <td className={td}>{new Date(c.criado_em).toLocaleDateString("pt-BR")}</td>
                  <td className={td}>{c.apagado ? "apagado" : c.status}</td>
                  <td className={td}>{c.orgao ?? DASH}</td>
                  <td className={td}>{c.placa || DASH}</td>
                  <td className={td}>{c.artigo ?? DASH}</td>
                  <td className={td}>{c.peca ?? DASH}</td>
                  <td className={td}>{c.forca ?? DASH}</td>
                  <td className={td}>{c.prazo ? formatDateBR(c.prazo) : DASH}</td>
                  <td className={td}>{c.pagamento ?? DASH}</td>
                  <td className={td}>{c.teses.length ? c.teses.map((t) => t.split("_")[0]).join(", ") : DASH}</td>
                  <td className={td}>
                    {usd(Number(c.custo_ia_usd))} ({c.chamadas_ia})
                  </td>
                  <td className={td}>{c.resultado ?? DASH}</td>
                  <td className={td}>{c.requerente ? Object.values(c.requerente).filter(Boolean).join(" · ") : DASH}</td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr>
                  <td className={td} colSpan={14}>
                    Nenhum caso ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="h-teses" className="mt-14">
        <h2 id="h-teses" className="text-[1.5rem]">
          Teses
        </h2>
        <p className="mt-2 small muted">Mude o status para “revisado” só depois da revisão por advogado (LEGAL_REVIEW.md). “Suspensa” tira a tese do motor.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] small tabular" style={{ borderCollapse: "collapse" }}>
            <thead style={{ borderBottom: "1.5px solid var(--ink)" }}>
              <tr>
                {["Tese", "Tipo", "Peso", "Status", "Deferido", "Indeferido", "Pendente"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {theses.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className={td}>
                    <span className="font-semibold">{t.id.split("_")[0]}</span> {t.titulo}
                  </td>
                  <td className={td}>{t.acessoria ? "complementar" : "principal"}</td>
                  <td className={td}>
                    <label className="sr-only" htmlFor={`w-${t.id}`}>
                      Peso de {t.id}
                    </label>
                    <select id={`w-${t.id}`} className="input min-h-0 w-auto py-1" value={t.peso} onChange={(e) => saveThesis(t.id, { weight: Number(e.target.value) })}>
                      {[1, 2, 3].map((w) => (
                        <option key={w} value={w}>
                          {w}
                          {w === t.peso_base ? " (base)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <label className="sr-only" htmlFor={`s-${t.id}`}>
                      Status de {t.id}
                    </label>
                    <select id={`s-${t.id}`} className="input min-h-0 w-auto py-1" value={t.status} onChange={(e) => saveThesis(t.id, { status: e.target.value })}>
                      {["rascunho", "revisado", "suspensa"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>{t.resultados.deferido}</td>
                  <td className={td}>{t.resultados.indeferido}</td>
                  <td className={td}>{t.resultados.pendente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="h-frotas" className="mt-14">
        <h2 id="h-frotas" className="text-[1.5rem]">
          Frotas (lista de espera)
        </h2>
        <ul className="mt-4 grid gap-2 small">
          {fleet.map((f, i) => (
            <li key={i} className="tabular">
              {String(f.company)}: {String(f.vehicles)} veículos, {String(f.fines_per_month)} multas/mês. {String(f.contact_name)}, {String(f.contact_email)}
              {f.contact_phone ? `, ${String(f.contact_phone)}` : ""}
            </li>
          ))}
          {fleet.length === 0 && <li className="muted">Ninguém na lista ainda.</li>}
        </ul>
      </section>
    </div>
  );
}
