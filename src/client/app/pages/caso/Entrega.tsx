import { useEffect, useState, type FormEvent } from "react";
import type { DocumentModel } from "../../../../shared/document";
import { api, ApiError, apiBlob } from "../../api";
import { ErrorBox, Field, Working, formatDateBR } from "../../ui";

interface Stored {
  doc: DocumentModel;
  plain: string;
}

async function downloadPdf(doc: DocumentModel) {
  const [{ renderPdf }, regular, semibold, italic] = await Promise.all([
    import("../../../../shared/pdf"),
    fetch("/fonts/pdf/SourceSerif4-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/pdf/SourceSerif4-Semibold.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/pdf/SourceSerif4-It.ttf").then((r) => r.arrayBuffer()),
  ]);
  const bytes = await renderPdf(doc, { regular: new Uint8Array(regular), semibold: new Uint8Array(semibold), italic: new Uint8Array(italic) });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `contramulta-${doc.titulo.toLowerCase().includes("defesa") ? "defesa-previa" : "recurso"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function RequesterForm({ onDone }: { onDone: (s: Stored) => void }) {
  const [v, setV] = useState({ nome: "", cpf: "", cnh: "", endereco: "", cidade_uf: "", qualidade: "proprietario" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<Stored>("/api/case/generate", { json: { requester: v }, timeoutMs: 180_000 });
      onDone(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não conseguimos gerar a peça.");
      setBusy(false);
    }
  }

  if (busy) return <Working title="Montando sua peça" detail="Escrevemos o relato dos fatos e conferimos cada citação contra a base de leis. Leva até um minuto." />;
  return (
    <form onSubmit={submit} noValidate className="grid max-w-[640px] gap-6">
      <div>
        <h1 className="app-title">Pagamento confirmado</h1>
        <p className="mt-5">Estes dados vão na primeira página da peça. Ficam cifrados e são apagados em 30 dias. Se preferir, deixe em branco e preencha à mão depois de imprimir.</p>
      </div>
      <Field id="nome" label="Nome completo">
        <input id="nome" className="input" autoComplete="name" value={v.nome} onChange={set("nome")} />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="cpf" label="CPF">
          <input id="cpf" className="input tabular" inputMode="numeric" autoComplete="off" value={v.cpf} onChange={set("cpf")} />
        </Field>
        <Field id="cnh" label="Nº da CNH (opcional)">
          <input id="cnh" className="input tabular" inputMode="numeric" autoComplete="off" value={v.cnh} onChange={set("cnh")} />
        </Field>
      </div>
      <Field id="endereco" label="Endereço">
        <input id="endereco" className="input" autoComplete="street-address" value={v.endereco} onChange={set("endereco")} />
      </Field>
      <Field id="cidade" label="Cidade e UF">
        <input id="cidade" className="input" value={v.cidade_uf} onChange={set("cidade_uf")} />
      </Field>
      <Field id="qualidade" label="Você é">
        <select id="qualidade" className="input" value={v.qualidade} onChange={set("qualidade")}>
          <option value="proprietario">Proprietário(a) do veículo</option>
          <option value="condutor">Condutor(a) indicado(a)</option>
          <option value="proprietario_e_condutor">Proprietário(a) e condutor(a)</option>
        </select>
      </Field>
      {error && <ErrorBox message={error} />}
      <button className="btn justify-self-start" type="submit">
        Gerar minha peça
      </button>
    </form>
  );
}

function Outcome({ current }: { current: string | null }) {
  const [result, setResult] = useState<string | null>(current);
  const [error, setError] = useState<string | null>(null);
  async function send(r: string) {
    setError(null);
    try {
      await api("/api/case/outcome", { json: { result: r } });
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível registrar.");
    }
  }
  const label: Record<string, string> = { deferido: "Deferido", indeferido: "Indeferido", pendente: "Ainda não saiu" };
  return (
    <section aria-labelledby="h-resultado" className="bg-surface -mx-[var(--margin)] px-[var(--margin)] py-12 sm:mx-0 sm:px-10">
      <h2 id="h-resultado" className="app-title">Já saiu o resultado?</h2>
      <p className="mt-4 max-w-[56ch]">Volte a este link quando o órgão responder. O resultado nos ajuda a ajustar o peso de cada argumento para os próximos motoristas.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {Object.entries(label).map(([k, l]) => (
          <button key={k} type="button" className={result === k ? "btn btn-quiet" : "btn btn-ghost"} aria-pressed={result === k} onClick={() => send(k)}>
            {l}
          </button>
        ))}
      </div>
      {result && <p className="mt-4 small">Registrado: {label[result]}. Obrigado.</p>}
      {error && <ErrorBox message={error} />}
    </section>
  );
}

export function Entrega({ ready, deadline, outcome, onPurged }: { ready: boolean; deadline: string | null; outcome: string | null; onPurged: () => void }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [loading, setLoading] = useState(ready);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!ready) return;
    api<Stored>("/api/case/document").then(
      (r) => {
        setStored(r);
        setLoading(false);
      },
      (e) => {
        setError(e instanceof ApiError ? e.message : "Não conseguimos carregar a peça.");
        setLoading(false);
      },
    );
  }, [ready]);

  if (loading) return <Working title="Carregando sua peça" />;
  if (!stored) return error ? <ErrorBox message={error} /> : <RequesterForm onDone={setStored} />;
  const { doc, plain } = stored;

  async function pdf() {
    setPdfBusy(true);
    try {
      await downloadPdf(doc);
      api("/api/case/downloaded", { method: "POST" }).catch(() => undefined);
    } catch {
      setError("Não conseguimos gerar o PDF neste navegador. Use o texto abaixo.");
    } finally {
      setPdfBusy(false);
    }
  }
  async function ics() {
    const blob = await apiBlob("/api/case/ics");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prazo-contramulta.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  async function copy() {
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  async function purge() {
    if (!confirm("Apagar agora as fotos, a peça e seus dados pessoais? Não dá para desfazer.")) return;
    await api("/api/case", { method: "DELETE" });
    onPurged();
  }

  return (
    <div className="grid gap-16">
      <section aria-labelledby="h-peca" className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-6">
          <h1 id="h-peca" className="app-title">Sua peça está pronta</h1>
          <p className="mt-5 lead">{doc.titulo.replace(/\s*\(.*\)$/, "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}, com {doc.direito.length} {doc.direito.length === 1 ? "argumento" : "argumentos"}.</p>
          {deadline && <p className="mt-3">Protocole até <strong>{formatDateBR(deadline)}</strong>.</p>}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <button className="btn" type="button" onClick={pdf} disabled={pdfBusy}>
              {pdfBusy ? "Gerando PDF…" : "Baixar PDF"}
            </button>
            {deadline && (
              <button type="button" className="link small border-0 bg-transparent p-0" onClick={ics}>
                Lembrete no calendário (.ics)
              </button>
            )}
          </div>
          {error && <ErrorBox message={error} />}
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <img src="/img/porta-defesa-560.webp" width={560} height={747} alt="Mão assinando um documento impresso." className="w-full max-w-[280px]" />
        </div>
      </section>

      <section aria-labelledby="h-anexos" className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 id="h-anexos" className="app-title">Anexos</h2>
          <ul className="mt-6 grid gap-3 list-none p-0">
            {doc.anexos.map((a, i) => (
              <li key={i}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" checked={checked.has(i)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                  <span>{a}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="app-title">Como protocolar</h2>
          <ol className="mt-6 grid gap-3 pl-6">
            {doc.protocolo.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="h-texto">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="h-texto" className="app-title">Texto para formulário online</h2>
          <button type="button" className="btn btn-quiet" onClick={copy}>
            {copied ? "Copiado" : "Copiar texto"}
          </button>
        </div>
        <p className="mt-4 max-w-[60ch]">Alguns órgãos pedem a defesa num campo de texto. Cole este texto inteiro e revise os dados pessoais.</p>
        <label htmlFor="texto" className="sr-only">
          Texto da peça
        </label>
        <textarea id="texto" readOnly className="input mt-6 min-h-[420px] font-text" value={plain} />
      </section>

      <Outcome current={outcome} />

      <section aria-labelledby="h-dados" className="max-w-[60ch]">
        <h2 id="h-dados" className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>
          Seus dados
        </h2>
        <p className="mt-3">As fotos, a peça e seus dados pessoais são apagados automaticamente 30 dias depois do envio. Se quiser, apague agora.</p>
        <button type="button" className="btn btn-ghost mt-5" onClick={purge}>
          Apagar meus dados agora
        </button>
      </section>
    </div>
  );
}
