import { useEffect, useState } from "react";
import type { Diagnosis, Finding } from "../../../../shared/rules/engine";
import { api, ApiError, brl } from "../../api";
import { ErrorBox, formatDateBR } from "../../ui";

const LEVEL: Record<string, string> = { fraca: "Fraca", moderada: "Moderada", forte: "Forte" };

/** Contagem regressiva até o fim do dia do prazo efetivo, no fuso de Brasília. */
function Countdown({ deadline }: { deadline: string }) {
  const end = new Date(`${deadline}T23:59:59-03:00`).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, end - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <div aria-label={`Faltam ${days} dias e ${hours} horas`}>
      <p className="kpi tabular">
        {days} {days === 1 ? "dia" : "dias"}
      </p>
      <p className="mt-2 muted">e {hours} h até o fim do prazo</p>
    </div>
  );
}

function Citations({ items }: { items: string[] }) {
  if (!items.length) return null;
  const uniq = [...new Set(items)];
  return (
    <details className="mt-3 small">
      <summary className="cursor-pointer muted">Base legal ({uniq.length})</summary>
      <ul className="mt-2 grid gap-1 pl-5">
        {uniq.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </details>
  );
}

function FindingItem({ f }: { f: Finding }) {
  return (
    <li className="panel">
      <p className="lead font-semibold">{f.titulo}</p>
      <p className="mt-2">{f.detalhe}</p>
      <Citations items={f.citacoes} />
    </li>
  );
}

export function Diagnostico(props: { d: Diagnosis; priceCents: number; payment: { id: string; status: string; provider?: string } | null; onEdit: () => void; onPaid: () => void }) {
  const { d } = props;
  const [ack, setAck] = useState(false);
  const [method, setMethod] = useState<"pix" | "cartao">("pix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockPayment, setMockPayment] = useState<string | null>(props.payment?.status === "pending" && props.payment.provider === "mock" ? props.payment.id : null);
  const mpPending = props.payment?.status === "pending" && props.payment.provider === "mercadopago";

  async function checkMp() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ payment: { status: string } | null }>("/api/case/payment");
      if (r.payment?.status === "approved") props.onPaid();
      else setError("Ainda não recebemos a confirmação do pagamento. Pix costuma confirmar em segundos; tente de novo em instantes.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!mpPending) return;
    const t = setInterval(() => {
      api<{ payment: { status: string } | null }>("/api/case/payment").then((r) => r.payment?.status === "approved" && props.onPaid(), () => undefined);
    }, 5000);
    const stop = setTimeout(() => clearInterval(t), 180_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpPending]);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ payment: { id: string; status: string; redirect_url: string | null; mock: boolean } }>("/api/case/checkout", { json: { method, ciente_sem_achados: ack } });
      if (r.payment.status === "approved") return props.onPaid();
      if (r.payment.redirect_url) {
        location.href = r.payment.redirect_url;
        return;
      }
      setMockPayment(r.payment.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível iniciar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMock() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/case/pay/mock-confirm", { json: { payment_id: mockPayment } });
      props.onPaid();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível confirmar o pagamento de teste.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = !d.venda.permitida;

  return (
    <div className="grid gap-16">
      <section aria-labelledby="h-diag" className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7">
          <h1 id="h-diag" className="app-title">Seu diagnóstico</h1>
          {d.peca ? (
            <>
              <p className="mt-6 lead">
                Peça cabível: <strong>{d.peca.titulo}</strong>
              </p>
              <p className="mt-2 max-w-[56ch]">{d.peca.explicacao}</p>
              <Citations items={d.peca.citacoes} />
            </>
          ) : (
            <p className="mt-6 lead">Não identificamos uma peça cabível para este documento.</p>
          )}
          <button type="button" className="link small mt-6 border-0 bg-transparent p-0" onClick={props.onEdit}>
            Corrigir os dados
          </button>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          {d.prazo.efetivo ? (
            <>
              <p className="small muted">Prazo final: {formatDateBR(d.prazo.efetivo)}{d.prazo.prorrogado_fim_de_semana ? ` (era ${formatDateBR(d.prazo.final)}, fim de semana)` : ""}</p>
              {d.prazo.vencido ? <p className="mt-2 kpi" style={{ color: "var(--accent)" }}>Prazo encerrado</p> : <Countdown deadline={d.prazo.efetivo} />}
            </>
          ) : (
            <p className="small muted">Prazo não informado. Confira a data na notificação.</p>
          )}
        </div>
      </section>

      {d.bloqueios.length > 0 && (
        <section aria-labelledby="h-bloq" className="panel" style={{ borderLeft: "6px solid var(--accent)" }}>
          <h2 id="h-bloq" className="app-title">Não vendemos esta peça</h2>
          <ul className="mt-6 grid gap-6 list-none p-0">
            {d.bloqueios.map((b) => (
              <li key={b.rule_id}>
                <p className="lead font-semibold">{b.titulo}</p>
                <p className="mt-2 max-w-[60ch]">{b.detalhe}</p>
                <Citations items={b.citacoes} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-forca" className="grid gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-4">
          <h2 id="h-forca" className="small muted font-normal" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>
            Força da defesa
          </h2>
          <p className="mt-2 kpi" style={{ color: d.forca.nivel === "forte" ? "var(--ok)" : "var(--ink)" }}>
            {LEVEL[d.forca.nivel]}
          </p>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          <p className="lead">{d.forca.explicacao}</p>
          {d.forca.composicao.length > 0 && (
            <ul className="mt-6 grid gap-2 list-none p-0">
              {d.forca.composicao.map((c) => (
                <li key={c.thesis_id} className="flex justify-between gap-6">
                  <span>{c.titulo}</span>
                  <span className="muted tabular whitespace-nowrap">{c.acessoria ? "complementar" : `peso ${c.peso}`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="h-achados">
        <h2 id="h-achados" className="app-title">{d.sem_achados ? "Não encontramos falha formal" : `O que encontramos (${d.achados.length})`}</h2>
        {d.sem_achados ? (
          <div className="mt-6 max-w-[62ch] grid gap-4">
            <p className="lead">Conferimos sua notificação e não achamos falha formal que sustente uma defesa.</p>
            <p>Nesse caso, avalie pagar com desconto: veja o aviso abaixo. Você ainda pode comprar a peça, mas ela vai discutir só os fatos, sem uma falha objetiva da autuação.</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 list-none p-0">
            {d.achados.map((f) => (
              <FindingItem key={f.rule_id} f={f} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-avisos" className="grid gap-4">
        <h2 id="h-avisos" className="app-title">Antes de decidir</h2>
        <ul className="mt-4 grid gap-4 list-none p-0">
          {d.avisos.map((a) => (
            <li key={a.rule_id} className="max-w-[68ch]">
              <p className="font-semibold">{a.titulo}</p>
              <p className="mt-1">{a.detalhe}</p>
              <Citations items={a.citacoes} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-checados" className="grid gap-10 sm:grid-cols-2">
        <div>
          <h2 id="h-checados" className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>
            O que conferimos e está em ordem
          </h2>
          <ul className="mt-4 grid gap-2 pl-5">
            {d.nao_encontrado.length ? d.nao_encontrado.map((t) => <li key={t}>{t}</li>) : <li className="muted">Nada nesta lista.</li>}
          </ul>
        </div>
        <div>
          <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>
            O que não conseguimos conferir
          </h2>
          <ul className="mt-4 grid gap-2 pl-5">
            {d.nao_verificado.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {!blocked && (
        <section aria-labelledby="h-pagar" className="bg-surface -mx-[var(--margin)] px-[var(--margin)] py-14 sm:mx-0 sm:px-10">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
            <div className="lg:col-span-6">
              <h2 id="h-pagar" className="app-title">Peça pronta por {brl(props.priceCents)}</h2>
              <p className="mt-5 max-w-[46ch]">PDF da {d.peca?.titulo.toLowerCase()}, texto para formulário online, lista de anexos, passo a passo do protocolo e lembrete do prazo. Você assina e protocola.</p>
            </div>
            <div className="grid content-start gap-6 lg:col-span-5 lg:col-start-8">
              {d.venda.exige_ciencia_sem_achados && (
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>Entendi que não foi encontrada falha formal e que pagar com desconto pode sair mais barato.</span>
                </label>
              )}
              {mpPending ? (
                <div className="panel bg-bg" role="status">
                  <p className="font-semibold">Aguardando a confirmação do pagamento</p>
                  <p className="mt-2 small">Assim que o Mercado Pago confirmar, a peça é liberada nesta página.</p>
                  <button className="btn btn-quiet mt-5" type="button" disabled={busy} onClick={checkMp}>
                    Já paguei, verificar
                  </button>
                </div>
              ) : !mockPayment ? (
                <>
                  <fieldset className="m-0 grid gap-2 border-0 p-0">
                    <legend className="mb-2 font-semibold">Forma de pagamento</legend>
                    {(["pix", "cartao"] as const).map((m) => (
                      <label key={m} className="flex items-center gap-3">
                        <input type="radio" name="metodo" className="h-5 w-5 accent-[var(--ink)]" checked={method === m} onChange={() => setMethod(m)} />
                        {m === "pix" ? "Pix" : "Cartão de crédito"}
                      </label>
                    ))}
                  </fieldset>
                  <button className="btn justify-self-start" type="button" disabled={busy || (d.venda.exige_ciencia_sem_achados && !ack)} onClick={checkout}>
                    {busy ? "Aguarde…" : `Pagar ${brl(props.priceCents)}`}
                  </button>
                </>
              ) : (
                <div className="panel bg-bg">
                  <p className="font-semibold">Pagamento simulado</p>
                  <p className="mt-2 small">Este é o ambiente de testes. Nenhum valor é cobrado. Confirme para liberar a peça.</p>
                  <button className="btn mt-5" type="button" disabled={busy} onClick={confirmMock}>
                    {busy ? "Confirmando…" : "Pagar (teste)"}
                  </button>
                </div>
              )}
              {error && <ErrorBox message={error} />}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
