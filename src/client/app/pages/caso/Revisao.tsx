import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Confirmed, Extraction, ImageFacts, CrlvExtraction, Missable } from "../../../../shared/schemas";
import { api, ApiError, apiBlob } from "../../api";
import { ErrorBox, Field } from "../../ui";
import type { Diagnosis } from "../../../../shared/rules/engine";

export interface CaseState {
  status: string;
  uploads: { id: string; kind: string; content_type: string }[];
  extraction: { notificacao?: Extraction; crlv?: CrlvExtraction; imagem_infracao?: ImageFacts };
  confirmed: Confirmed | null;
  diagnosis: Diagnosis | null;
  payment: { id: string; status: string; method: string; provider: string } | null;
  document_ready: boolean;
  outcome: { result: string; created_at: number } | null;
  price_cents: number;
  purged: boolean;
}

type FieldKind = "text" | "textarea" | "date" | "time" | "money" | "int";
interface FieldDef {
  k: keyof Confirmed & string;
  label: string;
  kind: FieldKind;
  miss?: Missable | "equipamento";
  hint?: string;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "A infração",
    fields: [
      { k: "orgao_autuador", label: "Órgão autuador", kind: "text", miss: "orgao" },
      { k: "numero_auto", label: "Nº do auto de infração", kind: "text" },
      { k: "descricao_infracao", label: "Descrição da infração", kind: "textarea", miss: "tipificacao" },
      { k: "artigo_infracao", label: "Artigo (enquadramento)", kind: "text", hint: "Como está impresso. Ex.: 252, parágrafo único." },
      { k: "codigo_infracao", label: "Código da infração", kind: "text" },
      { k: "data_infracao", label: "Data da infração", kind: "date", miss: "data" },
      { k: "hora_infracao", label: "Hora da infração", kind: "time", miss: "hora" },
      { k: "local_infracao", label: "Local da infração", kind: "text", miss: "local" },
      { k: "valor", label: "Valor da multa (R$)", kind: "money", hint: "Ex.: 293,47" },
      { k: "pontos", label: "Pontos", kind: "int" },
    ],
  },
  {
    title: "O veículo",
    fields: [
      { k: "placa", label: "Placa", kind: "text", miss: "placa" },
      { k: "marca_modelo", label: "Marca/modelo", kind: "text", miss: "marca" },
    ],
  },
  {
    title: "Datas da notificação",
    fields: [
      { k: "data_expedicao", label: "Data de expedição ou emissão", kind: "date" },
      { k: "data_postagem", label: "Data de postagem", kind: "date" },
      { k: "prazo_final", label: "Prazo final para defesa ou recurso", kind: "date", miss: "prazo" },
    ],
  },
  {
    title: "Quem registrou",
    fields: [
      { k: "agente_identificacao", label: "Agente autuador (nome ou matrícula)", kind: "text", miss: "agente" },
      { k: "equipamento_identificacao", label: "Equipamento (número ou código)", kind: "text", miss: "equipamento" },
    ],
  },
];

const LOW = 0.75;

function toForm(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  return String(v);
}

function parseNumber(s: string): number | null {
  const t = s.trim().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function guessMeio(obs: string | null | undefined): Confirmed["meio_constatacao"] {
  const o = (obs ?? "").toLowerCase();
  if (o.includes("videomonitor")) return "videomonitoramento";
  if (o.includes("automático") || o.includes("automatico")) return "sanmft";
  if (o.includes("agente")) return "agente_no_local";
  return "nao_sei";
}

function Radio<T extends string>(props: { name: string; legend: string; value: T | null; options: [T, string][]; onChange: (v: T) => void; hint?: string }) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 font-semibold">{props.legend}</legend>
      {props.hint && <p className="mb-2 small muted">{props.hint}</p>}
      <div className="grid gap-2">
        {props.options.map(([v, label]) => (
          <label key={v} className="flex items-start gap-3">
            <input type="radio" className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" name={props.name} value={v} checked={props.value === v} onChange={() => props.onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Thumb({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    apiBlob(`/api/case/file/${id}`).then((b) => {
      u = URL.createObjectURL(b);
      setUrl(u);
    }, () => setUrl(null));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (!url) return <div className="aspect-[3/4] w-full bg-surface" aria-hidden="true" />;
  return (
    <a href={url} target="_blank" rel="noopener" className="block">
      <img src={url} alt={alt} className="w-full" />
    </a>
  );
}

export function Revisao({ state, onDiagnosed, manual }: { state: CaseState; onDiagnosed: (d: Diagnosis) => void; manual: Record<string, string> }) {
  const ex = state.extraction.notificacao;
  const img = state.extraction.imagem_infracao;
  const crlvEx = state.extraction.crlv;
  const prev = state.confirmed;

  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) v[f.k] = toForm(prev ? prev[f.k] : (ex as Record<string, { value: unknown }> | undefined)?.[f.k]?.value);
    return v;
  }, [ex, prev]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [missing, setMissing] = useState<Set<string>>(() => {
    const s = new Set<string>(prev?.ausentes ?? []);
    if (prev?.ausentes?.includes("agente_ou_equipamento")) s.add("equipamento");
    return s;
  });
  const [tipo, setTipo] = useState<Confirmed["tipo_documento"]>(prev?.tipo_documento ?? ex?.tipo_documento.value ?? "notificacao_autuacao");
  const [jari, setJari] = useState(prev?.jari_ja_indeferiu ?? false);
  const [defesa, setDefesa] = useState<Confirmed["defesa_previa_apresentada"]>(prev?.defesa_previa_apresentada ?? "nao_sei");
  const [naExp, setNaExp] = useState(prev?.na_data_expedicao ?? "");
  const [meio, setMeio] = useState<Confirmed["meio_constatacao"]>(prev?.meio_constatacao ?? guessMeio(ex?.observacoes_meio_constatacao.value));
  const [conformidade, setConformidade] = useState<Confirmed["sanmft_conformidade_informada"]>(prev?.sanmft_conformidade_informada ?? "nao_sei");
  const [sne, setSne] = useState<Confirmed["sne_aderido"]>(prev?.sne_aderido ?? "nao_sei");
  const hasImageUpload = state.uploads.some((u) => u.kind === "imagem_infracao");
  const [temImagem, setTemImagem] = useState<boolean>(prev?.tem_imagem ?? (ex?.tem_imagem_infracao.value === true || hasImageUpload));
  const [imgFacts, setImgFacts] = useState<NonNullable<Confirmed["imagem"]>>(
    prev?.imagem ?? {
      objeto_na_mao: img?.objeto_na_mao.value ?? null,
      cinto: img?.cinto.value ?? null,
      placa_legivel: img?.placa_legivel.value ?? null,
      pessoa_em_foco: img?.pessoa_em_foco.value ?? null,
    },
  );
  const [crlv, setCrlv] = useState({ placa: prev?.crlv?.placa ?? crlvEx?.placa.value ?? "", marca_modelo: prev?.crlv?.marca_modelo ?? crlvEx?.marca_modelo.value ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const conf = (k: string) => (prev ? 1 : ((ex as Record<string, { confidence: number; value: unknown }> | undefined)?.[k]?.confidence ?? 1));
  const isLow = (k: string) => Boolean(ex) && !prev && conf(k) < LOW && values[k] !== "";

  function set(k: string, v: string) {
    setValues((s) => ({ ...s, [k]: v }));
  }
  function toggleMissing(f: FieldDef, on: boolean) {
    setMissing((s) => {
      const n = new Set(s);
      if (on) n.add(f.miss!);
      else n.delete(f.miss!);
      return n;
    });
    if (on) set(f.k, "");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const ausentes = new Set<Missable>();
    for (const m of missing) if (m !== "equipamento" && m !== "tipificacao") ausentes.add(m as Missable);
    if (missing.has("tipificacao") && !values.artigo_infracao && !values.codigo_infracao) ausentes.add("tipificacao");
    if (missing.has("agente") && missing.has("equipamento")) ausentes.add("agente_ou_equipamento");
    const str = (k: string) => (values[k]?.trim() ? values[k]!.trim() : null);
    const confirmed = {
      tipo_documento: tipo,
      jari_ja_indeferiu: tipo === "notificacao_penalidade" && jari,
      orgao_autuador: str("orgao_autuador"),
      numero_auto: str("numero_auto"),
      codigo_infracao: str("codigo_infracao"),
      descricao_infracao: str("descricao_infracao"),
      artigo_infracao: str("artigo_infracao"),
      data_infracao: str("data_infracao"),
      hora_infracao: str("hora_infracao"),
      local_infracao: str("local_infracao"),
      placa: str("placa"),
      marca_modelo: str("marca_modelo"),
      data_expedicao: str("data_expedicao"),
      data_postagem: str("data_postagem"),
      na_data_expedicao: tipo === "notificacao_penalidade" && naExp ? naExp : null,
      prazo_final: str("prazo_final"),
      agente_identificacao: str("agente_identificacao"),
      equipamento_identificacao: str("equipamento_identificacao"),
      valor: parseNumber(values.valor ?? ""),
      pontos: values.pontos?.trim() ? Math.round(Number(values.pontos)) : null,
      tem_imagem: temImagem,
      ausentes: [...ausentes],
      meio_constatacao: meio,
      sanmft_conformidade_informada: conformidade,
      defesa_previa_apresentada: defesa,
      sne_aderido: sne,
      crlv: crlv.placa.trim() || crlv.marca_modelo.trim() ? { placa: crlv.placa.trim() || null, marca_modelo: crlv.marca_modelo.trim() || null } : null,
      imagem: temImagem ? imgFacts : null,
    };
    setBusy(true);
    try {
      const { diagnosis } = await api<{ diagnosis: Diagnosis }>("/api/case/confirm", { json: { confirmed } });
      onDiagnosed(diagnosis);
    } catch (err) {
      const fields = err instanceof ApiError && Array.isArray(err.body.campos) ? (err.body.campos as string[]) : [];
      setInvalid(fields);
      setError(err instanceof ApiError ? err.message : "Não conseguimos gerar o diagnóstico.");
    } finally {
      setBusy(false);
    }
  }

  const notifUploads = state.uploads.filter((u) => u.kind === "notificacao" && u.content_type.startsWith("image/"));
  const imageUpload = state.uploads.find((u) => u.kind === "imagem_infracao" && u.content_type.startsWith("image/"));
  const lowCount = ex && !prev ? GROUPS.flatMap((g) => g.fields).filter((f) => isLow(f.k)).length : 0;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
      <form onSubmit={submit} noValidate className="grid content-start gap-10">
        <div>
          <h1 className="app-title">Confira os dados</h1>
          <p className="mt-5 max-w-[56ch]">
            {ex
              ? "Lemos a notificação e preenchemos o que conseguimos. Corrija o que estiver diferente do papel. Se um dado não aparece na notificação, marque “não consta”: isso pode ser uma falha formal."
              : "Preencha com os dados da notificação. Se um dado não aparece no papel, marque “não consta”: isso pode ser uma falha formal."}
          </p>
          {manual.notificacao && <ErrorBox message={manual.notificacao} />}
          {lowCount > 0 && <p className="mt-4 small" style={{ color: "var(--warn)" }}>{lowCount} {lowCount === 1 ? "campo está destacado" : "campos estão destacados"} para conferência: a leitura teve baixa confiança.</p>}
        </div>

        <Radio
          name="tipo"
          legend="Que documento é este?"
          value={tipo}
          onChange={setTipo}
          options={[
            ["notificacao_autuacao", "Notificação de autuação (prazo para defesa prévia ou indicação de condutor)"],
            ["notificacao_penalidade", "Notificação de penalidade (multa aplicada, prazo para recurso)"],
            ["outro", "Outro documento"],
          ]}
        />
        {tipo === "notificacao_penalidade" && (
          <div className="grid gap-6 panel">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" checked={jari} onChange={(e) => setJari(e.target.checked)} />
              <span>Já recorri à JARI e o recurso foi negado</span>
            </label>
            <Radio name="defesa" legend="Você apresentou defesa prévia?" value={defesa} onChange={setDefesa} options={[["sim", "Sim"], ["nao", "Não"], ["nao_sei", "Não sei"]]} />
            <Field id="na_exp" label="Data de expedição da notificação da autuação (opcional)" hint="Está na primeira notificação que você recebeu. Serve para conferir o prazo de 30 dias.">
              <input id="na_exp" type="date" className="input tabular" value={naExp} onChange={(e) => setNaExp(e.target.value)} aria-describedby="na_exp-hint" />
            </Field>
          </div>
        )}

        {GROUPS.map((g) => (
          <fieldset key={g.title} className="m-0 grid gap-6 border-0 p-0">
            <legend className="mb-6 font-display text-[1.5rem]">{g.title}</legend>
            <div className="grid gap-6 sm:grid-cols-2">
              {g.fields.map((f) => {
                const miss = f.miss ? missing.has(f.miss) : false;
                const id = `f-${f.k}`;
                const common = {
                  id,
                  className: `input ${f.kind === "date" || f.kind === "time" || f.kind === "money" || f.kind === "int" ? "tabular" : ""}`,
                  value: values[f.k] ?? "",
                  disabled: miss,
                  "aria-invalid": invalid.includes(f.k) ? ("true" as const) : undefined,
                  "aria-describedby": f.hint || isLow(f.k) ? `${id}-hint` : undefined,
                  onChange: (e: { target: { value: string } }) => set(f.k, e.target.value),
                };
                return (
                  <div key={f.k} className={f.kind === "textarea" ? "sm:col-span-2" : ""}>
                    <Field id={id} label={f.label} hint={f.hint} lowConfidence={isLow(f.k)}>
                      {f.kind === "textarea" ? (
                        <textarea {...common} rows={2} />
                      ) : (
                        <input {...common} type={f.kind === "date" ? "date" : f.kind === "time" ? "time" : "text"} inputMode={f.kind === "money" ? "decimal" : f.kind === "int" ? "numeric" : undefined} />
                      )}
                    </Field>
                    {f.miss && (
                      <label className="mt-2 flex items-center gap-2 small">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={miss} onChange={(e) => toggleMissing(f, e.target.checked)} />
                        Não consta na notificação
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        <fieldset className="m-0 grid gap-6 border-0 p-0">
          <legend className="mb-6 font-display text-[1.5rem]">Como a infração foi registrada</legend>
          <Field id="meio" label="O que a notificação diz sobre o registro?" hint={ex?.observacoes_meio_constatacao.value ? `Lemos no documento: “${ex.observacoes_meio_constatacao.value}”` : "Procure no campo de observação."}>
            <select id="meio" className="input" value={meio} onChange={(e) => setMeio(e.target.value as Confirmed["meio_constatacao"])} aria-describedby="meio-hint">
              <option value="videomonitoramento">Videomonitoramento (agente vendo pela câmera)</option>
              <option value="sanmft">Sistema automático (equipamento registra sozinho)</option>
              <option value="agente_no_local">Agente no local</option>
              <option value="nao_informado">A notificação não informa</option>
              <option value="nao_sei">Não sei</option>
            </select>
          </Field>
          {meio === "sanmft" && (
            <Radio
              name="inmetro"
              legend="A notificação informa a avaliação do equipamento pelo INMETRO?"
              value={conformidade}
              onChange={setConformidade}
              options={[["sim", "Sim"], ["nao", "Não"], ["nao_sei", "Não sei"]]}
            />
          )}
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" checked={temImagem} onChange={(e) => setTemImagem(e.target.checked)} />
            <span>Há foto da infração (na notificação ou enviada à parte)</span>
          </label>
        </fieldset>

        {temImagem && (
          <fieldset className="m-0 grid gap-8 border-0 p-0">
            <legend className="mb-2 font-display text-[1.5rem]">O que a foto mostra</legend>
            <p className="max-w-[56ch]">Responda pelo que se vê na imagem, não pelo que aconteceu.{img ? " Pré-marcamos com a descrição feita pela IA; confira." : ""}</p>
            {img && img.descricao_factual.length > 0 && (
              <ul className="m-0 grid gap-1 panel pl-10 small">
                {img.descricao_factual.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            <div className="grid gap-8 sm:grid-cols-2">
              <Radio
                name="objeto"
                legend="Na mão do condutor"
                value={imgFacts.objeto_na_mao}
                onChange={(v) => setImgFacts((s) => ({ ...s, objeto_na_mao: v }))}
                options={[
                  ["celular_identificavel", "Dá para ver que é um celular"],
                  ["objeto_nao_identificavel", "Há um objeto, mas não dá para saber o que é"],
                  ["mao_sem_objeto", "A mão aparece sem objeto"],
                  ["maos_nao_visiveis", "As mãos não aparecem"],
                ]}
              />
              <Radio
                name="cinto"
                legend="Cinto de segurança"
                value={imgFacts.cinto}
                onChange={(v) => setImgFacts((s) => ({ ...s, cinto: v }))}
                options={[
                  ["cinto_visivel_em_uso", "O cinto aparece em uso"],
                  ["cinto_visivel_sem_uso", "O cinto aparece sem uso"],
                  ["nao_e_possivel_ver", "Não dá para ver o cinto"],
                ]}
              />
              <Radio
                name="pessoa"
                legend="Quem aparece em foco"
                value={imgFacts.pessoa_em_foco}
                onChange={(v) => setImgFacts((s) => ({ ...s, pessoa_em_foco: v }))}
                options={[
                  ["condutor", "O condutor"],
                  ["passageiro", "Um passageiro"],
                  ["indeterminado", "Não dá para saber"],
                ]}
              />
              <Radio
                name="placa_leg"
                legend="A placa na foto"
                value={imgFacts.placa_legivel === null ? null : imgFacts.placa_legivel ? "sim" : "nao"}
                onChange={(v) => setImgFacts((s) => ({ ...s, placa_legivel: v === "sim" }))}
                options={[
                  ["sim", "Dá para ler"],
                  ["nao", "Não dá para ler"],
                ]}
              />
            </div>
          </fieldset>
        )}

        <fieldset className="m-0 grid gap-6 border-0 p-0">
          <legend className="mb-6 font-display text-[1.5rem]">Para comparar</legend>
          <p className="max-w-[56ch] -mt-2">Dados do CRLV, o documento do veículo. Opcional, mas é assim que achamos divergência de placa ou marca.</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="crlv-placa" label="Placa no CRLV">
              <input id="crlv-placa" className="input" value={crlv.placa} onChange={(e) => setCrlv((s) => ({ ...s, placa: e.target.value }))} />
            </Field>
            <Field id="crlv-marca" label="Marca/modelo no CRLV">
              <input id="crlv-marca" className="input" value={crlv.marca_modelo} onChange={(e) => setCrlv((s) => ({ ...s, marca_modelo: e.target.value }))} />
            </Field>
          </div>
          <Radio
            name="sne"
            legend="Você aderiu ao SNE (Sistema de Notificação Eletrônica) antes desta notificação?"
            hint="Quem aderiu pode ter desconto maior se pagar sem recorrer. Usamos isso só para o aviso de desconto."
            value={sne}
            onChange={setSne}
            options={[["sim", "Sim"], ["nao", "Não"], ["nao_sei", "Não sei"]]}
          />
        </fieldset>

        {error && <ErrorBox message={error} />}
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Analisando…" : "Confirmar e ver o diagnóstico"}
          </button>
          <p className="mt-3 small muted">O diagnóstico é grátis e não pede pagamento.</p>
        </div>
      </form>

      <aside className="order-first grid content-start gap-4 lg:order-none lg:sticky lg:top-12 lg:self-start">
        <p className="small font-semibold">Sua notificação <span className="muted font-normal lg:hidden">(toque para ampliar)</span></p>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          {notifUploads.map((u, i) => (
            <Thumb key={u.id} id={u.id} alt={`Notificação enviada, imagem ${i + 1}`} />
          ))}
        </div>
        {notifUploads.length === 0 && <p className="small muted">Você enviou um PDF. Abra o arquivo ao lado para conferir.</p>}
        {imageUpload && (
          <>
            <p className="small font-semibold mt-4">Foto da infração</p>
            <Thumb id={imageUpload.id} alt="Foto da infração enviada" />
          </>
        )}
      </aside>
    </div>
  );
}
