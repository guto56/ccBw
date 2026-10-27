import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, getConfig, type Config } from "../api";
import { prepareFiles } from "../compress";
import { ErrorBox, Field, Shell, Stages, navigate } from "../ui";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
  }
}

function useTurnstile(siteKey: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const render = () => {
      if (!window.turnstile || !ref.current || widget.current) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        language: "pt-br",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [siteKey]);
  const reset = () => {
    setToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  };
  return { ref, token, reset };
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function FilePicker(props: { id: string; label: string; hint: string; multiple?: boolean; files: File[]; onChange: (f: File[]) => void }) {
  const n = props.files.length;
  return (
    <Field id={props.id} label={props.label} hint={props.hint}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <input
          id={props.id}
          className="file-input sr-only"
          type="file"
          accept={ACCEPT}
          multiple={props.multiple}
          aria-describedby={`${props.id}-hint`}
          onChange={(e) => props.onChange([...(e.target.files ?? [])])}
        />
        <label htmlFor={props.id} aria-hidden="true" className="btn btn-ghost file-button">
          {n ? "Trocar" : props.multiple ? "Escolher fotos ou PDF" : "Escolher arquivo"}
        </label>
        <span className="small muted" aria-live="polite">
          {n ? `${n} ${n === 1 ? "arquivo escolhido" : "arquivos escolhidos"}` : "Nenhum arquivo escolhido"}
        </span>
      </div>
      {n > 0 && (
        <ul className="mt-3 list-none p-0 small">
          {props.files.map((f, i) => (
            <li key={i} className="flex justify-between gap-4 py-1">
              <span className="truncate">{f.name}</span>
              <span className="muted tabular">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

export default function Enviar() {
  const [config, setConfig] = useState<Config | null>(null);
  const [notif, setNotif] = useState<File[]>([]);
  const [imagem, setImagem] = useState<File[]>([]);
  const [crlv, setCrlv] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ts = useTurnstile(config?.turnstile_site_key);

  useEffect(() => {
    getConfig().then(setConfig, () => setError("Não conseguimos carregar a página. Recarregue."));
    document.title = "Enviar notificação · ContraMulta";
  }, []);

  const tooMany = notif.length > 4;
  const canSubmit = notif.length > 0 && !tooMany && consent && Boolean(ts.token) && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !config) return;
    setError(null);
    try {
      setBusy("Preparando as imagens…");
      const form = new FormData();
      for (const f of await prepareFiles(notif, config.pdf_nativo, config.limite_arquivo_bytes)) form.append("notificacao", f);
      for (const f of await prepareFiles(imagem.slice(0, 1), config.pdf_nativo, config.limite_arquivo_bytes)) form.append("imagem_infracao", f);
      for (const f of await prepareFiles(crlv.slice(0, 1), config.pdf_nativo, config.limite_arquivo_bytes)) form.append("crlv", f);
      form.append("consent", "true");
      form.append("turnstile", ts.token!);
      if (email.trim()) form.append("email", email.trim());
      setBusy("Enviando…");
      const { token } = await api<{ token: string }>("/api/cases", { form, token: null });
      navigate(`/c#${token}`);
    } catch (err) {
      setBusy(null);
      ts.reset();
      setError(err instanceof ApiError ? err.message : "Não conseguimos preparar os arquivos. Tente outra foto.");
    }
  }

  return (
    <Shell>
      <Stages current={0} />
      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <form onSubmit={submit} noValidate className="grid content-start gap-8">
          <div>
            <h1 className="app-title">Envie a notificação</h1>
            <p className="mt-5 max-w-[52ch]">Foto da frente e do verso, ou o PDF que veio por e-mail ou pelo aplicativo. Nós lemos os dados e você confere antes de qualquer análise.</p>
          </div>
          <FilePicker id="notificacao" label="Notificação de trânsito" hint="Até 4 fotos ou 1 PDF. JPG, PNG, WEBP ou PDF, até 8 MB cada." multiple files={notif} onChange={setNotif} />
          {tooMany && <p className="small" style={{ color: "var(--accent)" }}>Envie no máximo 4 imagens da notificação.</p>}
          <FilePicker id="imagem" label="Foto da infração (opcional)" hint="Se a foto da câmera não está na notificação, mas você baixou no site do órgão." files={imagem} onChange={setImagem} />
          <FilePicker id="crlv" label="CRLV do veículo (opcional)" hint="Para conferir se a placa e a marca da notificação batem com o documento." files={crlv} onChange={setCrlv} />
          <Field id="email" label="E-mail (opcional)" hint="Usado só para contato sobre este caso. Sem propaganda.">
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="email-hint" />
          </Field>
          <div className="flex gap-3">
            <input id="consent" type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <label htmlFor="consent" className="small">
              Autorizo o uso das imagens e dos dados desta notificação para gerar o diagnóstico e a peça, como descrito na{" "}
              <a className="link" href="/privacidade" target="_blank" rel="noopener">
                política de privacidade
              </a>
              . Os arquivos são apagados em 30 dias.
            </label>
          </div>
          <div ref={ts.ref} aria-label="Verificação contra robôs" />
          {error && <ErrorBox message={error} />}
          <div>
            <button className="btn" type="submit" disabled={!canSubmit}>
              {busy ?? "Enviar e ler a notificação"}
            </button>
            {!busy && notif.length > 0 && (!consent || !ts.token) && <p className="mt-3 small muted">{!consent ? "Marque a autorização para continuar." : "Aguarde a verificação contra robôs."}</p>}
          </div>
        </form>
        <aside className="grid content-start gap-6">
          <img src="/img/foto-celular-560.webp" width={560} height={420} alt="Mãos fotografando uma carta impressa com o celular." />
          <div className="small grid gap-3">
            <p>
              <strong>Boa foto:</strong> papel inteiro na imagem, sem sombra, com luz de dia. Datas e o campo de observação precisam estar legíveis.
            </p>
            <p>
              <strong>Sem cadastro:</strong> ao enviar, você recebe um link secreto. Ele é a única chave do seu caso.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
