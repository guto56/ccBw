import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { ErrorBox, Field, Shell } from "../ui";

export default function Frotas() {
  const [v, setV] = useState({ company: "", vehicles: "", fines_per_month: "", contact_name: "", contact_email: "", contact_phone: "" });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  useEffect(() => {
    document.title = "Frotas · ContraMulta";
  }, []);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/fleet", { json: { ...v, vehicles: Number(v.vehicles), fines_per_month: Number(v.fines_per_month) }, token: null });
      setSent(true);
    } catch (err) {
      setInvalid(err instanceof ApiError && Array.isArray(err.body.campos) ? (err.body.campos as string[]) : []);
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }
  const inv = (k: string) => (invalid.includes(k) ? ("true" as const) : undefined);

  return (
    <Shell>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-5">
          <h1 className="app-title">Frotas</h1>
          <p className="mt-6 lead">Locadoras, transportadoras e empresas com carros na rua recebem multa por câmera toda semana.</p>
          <p className="mt-4 max-w-[44ch]">Estamos montando um painel para frotas: envio em lote, diagnóstico de cada notificação, prazos de todas num calendário e indicação de condutor. Entre na lista e falamos com você quando abrir.</p>
          <img className="mt-10 w-full max-w-[460px]" src="/img/camera-poste-560.webp" srcSet="/img/camera-poste-560.webp 560w, /img/camera-poste-1024.webp 1024w" sizes="(min-width: 1024px) 460px, 92vw" width={560} height={420} alt="Câmera de fiscalização num poste sobre uma avenida movimentada ao entardecer." />
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          {sent ? (
            <div className="panel" role="status">
              <p className="app-title">Você está na lista</p>
              <p className="mt-4">Obrigado. Vamos entrar em contato pelo e-mail informado.</p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-6">
              <Field id="company" label="Empresa">
                <input id="company" className="input" autoComplete="organization" value={v.company} onChange={set("company")} aria-invalid={inv("company")} required />
              </Field>
              <div className="grid gap-6 sm:grid-cols-2">
                <Field id="vehicles" label="Nº de veículos">
                  <input id="vehicles" className="input tabular" inputMode="numeric" value={v.vehicles} onChange={set("vehicles")} aria-invalid={inv("vehicles")} required />
                </Field>
                <Field id="fines" label="Multas por mês (aprox.)">
                  <input id="fines" className="input tabular" inputMode="numeric" value={v.fines_per_month} onChange={set("fines_per_month")} aria-invalid={inv("fines_per_month")} required />
                </Field>
              </div>
              <Field id="contact_name" label="Seu nome">
                <input id="contact_name" className="input" autoComplete="name" value={v.contact_name} onChange={set("contact_name")} aria-invalid={inv("contact_name")} required />
              </Field>
              <div className="grid gap-6 sm:grid-cols-2">
                <Field id="contact_email" label="E-mail">
                  <input id="contact_email" type="email" className="input" autoComplete="email" value={v.contact_email} onChange={set("contact_email")} aria-invalid={inv("contact_email")} required />
                </Field>
                <Field id="contact_phone" label="Telefone (opcional)">
                  <input id="contact_phone" type="tel" className="input" autoComplete="tel" value={v.contact_phone} onChange={set("contact_phone")} />
                </Field>
              </div>
              {error && <ErrorBox message={error} />}
              <button className="btn justify-self-start" type="submit" disabled={busy}>
                {busy ? "Enviando…" : "Entrar na lista"}
              </button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
