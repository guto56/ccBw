import { useCallback, useEffect, useState } from "react";
import { api, ApiError, caseToken } from "../api";
import { ErrorBox, Shell, Stages, Working } from "../ui";
import { Revisao, type CaseState } from "./caso/Revisao";
import { Diagnostico } from "./caso/Diagnostico";
import { Entrega } from "./caso/Entrega";

type View = "carregando" | "lendo" | "revisao" | "diagnostico" | "entrega" | "apagado" | "erro";

export default function Caso() {
  const [state, setState] = useState<CaseState | null>(null);
  const [view, setView] = useState<View>("carregando");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    if (!caseToken()) {
      setError("Este link não tem a chave do caso. Use o link completo que você recebeu ao enviar a notificação.");
      setView("erro");
      return;
    }
    try {
      const s = await api<CaseState>("/api/case");
      setState(s);
      if (s.purged) return setView("apagado");
      if (s.status === "created") {
        setView("lendo");
        const r = await api<{ extraction: CaseState["extraction"]; erros: Record<string, string> }>("/api/case/extract", { method: "POST", timeoutMs: 150_000 });
        setManual(r.erros);
        setState({ ...s, status: "extracted", extraction: r.extraction });
        return setView("revisao");
      }
      if (s.payment?.status === "approved" || s.status === "paid" || s.status === "delivered") return setView("entrega");
      if (s.diagnosis) return setView("diagnostico");
      setView("revisao");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não conseguimos abrir o caso.");
      setView("erro");
    }
  }, []);

  useEffect(() => {
    document.title = "Seu caso · ContraMulta";
    load();
  }, [load]);

  const stage = view === "revisao" ? 1 : view === "diagnostico" ? 2 : view === "entrega" ? 4 : 1;

  return (
    <Shell>
      <Stages current={stage} />
      <div className="mt-10">
        {view === "carregando" && <Working title="Abrindo seu caso" />}
        {view === "lendo" && <Working title="Lendo a notificação" detail="A IA está extraindo os dados e descrevendo a foto. Leva de 10 a 60 segundos. Depois você confere tudo." />}
        {view === "erro" && <ErrorBox message={error ?? "Erro."} onRetry={load} />}
        {view === "apagado" && (
          <div className="max-w-[56ch]">
            <h1 className="app-title">Caso apagado</h1>
            <p className="mt-5">As fotos e os dados pessoais deste caso foram apagados, como prevê a política de privacidade.</p>
          </div>
        )}
        {view === "revisao" && state && (
          <Revisao
            state={state}
            manual={manual}
            onDiagnosed={(d) => {
              setState({ ...state, diagnosis: d, status: "diagnosed" });
              setView("diagnostico");
              window.scrollTo(0, 0);
            }}
          />
        )}
        {view === "diagnostico" && state?.diagnosis && (
          <>
            <p className="mb-8 small muted">Guarde o link desta página: ele é a única chave do seu caso.</p>
            <Diagnostico
              d={state.diagnosis}
              priceCents={state.price_cents}
              payment={state.payment}
              onEdit={() => setView("revisao")}
              onPaid={() => {
                setState({ ...state, status: "paid", payment: { id: state.payment?.id ?? "", status: "approved", method: "", provider: "" } });
                setView("entrega");
                window.scrollTo(0, 0);
              }}
            />
          </>
        )}
        {view === "entrega" && state && <Entrega ready={state.document_ready} deadline={state.diagnosis?.prazo.efetivo ?? null} outcome={state.outcome?.result ?? null} onPurged={() => setView("apagado")} />}
      </div>
    </Shell>
  );
}
