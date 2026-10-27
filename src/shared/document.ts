// Montagem da peça a partir do template. O fundamento jurídico vem literalmente da base;
// a LLM só fornece os parágrafos de narrativa dos fatos (já validados).
import { PIECES, getThesis, resolveFundamento, type ExcerptRef, type Fundamento, type PieceType } from "./legal";
import type { Diagnosis, Finding } from "./rules/engine";
import { formatBR } from "./rules/dates";
import type { Confirmed, Requester } from "./schemas";
import { validateText } from "./citations";

export interface SelectedThesis {
  thesis_id: string;
  rule_id: string;
  justificativa: string;
  selected_by: "llm" | "regras";
}

export interface DocSection {
  titulo: string;
  paragrafos: string[];
  fundamentos: Fundamento[];
}

export interface DocumentModel {
  titulo: string;
  destinatario: string;
  referencia: string[];
  qualificacao: string;
  fatos: string[];
  direito: DocSection[];
  pedidos: string[];
  fecho: string[];
  anexos: string[];
  protocolo: string[];
  aviso_teste: string | null;
}

const BLANK = "____________________";

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = values[k];
    if (v == null || v === "") throw new Error(`campo do modelo sem valor: ${k}`);
    return v;
  });
}

function qualidadeLabel(q: Requester["qualidade"]): string {
  return q === "condutor" ? "condutor" : q === "proprietario_e_condutor" ? "proprietário(a) e condutor(a)" : "proprietário(a)";
}

export function buildDocument(input: {
  confirmed: Confirmed;
  diagnosis: Diagnosis;
  selected: SelectedThesis[];
  narrative: string[];
  requester: Requester;
  testEnvironment: boolean;
}): DocumentModel {
  const { confirmed: c, diagnosis: d, requester: r } = input;
  if (!d.peca) throw new Error("diagnóstico sem peça cabível");
  const pieceType: PieceType = d.peca.tipo;
  const piece = PIECES[pieceType];
  const orgao = c.orgao_autuador || "órgão autuador indicado na notificação";
  const values: Record<string, string> = { orgao_autuador: orgao };

  const findingsByRule = new Map<string, Finding>(d.achados.map((f) => [f.rule_id, f]));
  const direito: DocSection[] = [];
  const pedidos: string[] = [];
  const seen = new Set<string>();
  for (const s of input.selected) {
    if (seen.has(s.thesis_id)) continue;
    const t = getThesis(s.thesis_id);
    const f = findingsByRule.get(s.rule_id);
    if (!t || !f || !f.thesis_ids.includes(t.id)) continue;
    seen.add(t.id);
    const refs: ExcerptRef[] = [...t.fundamento, ...f.fundamento_extra];
    direito.push({
      titulo: t.titulo,
      paragrafos: [fill(t.texto_modelo, { ...values, ...f.dados })],
      fundamentos: refs.map(resolveFundamento),
    });
    pedidos.push(t.pedido);
  }
  pedidos.push(piece.pedido_final);

  const nome = r.nome || BLANK;
  const cpf = r.cpf || BLANK;
  const cnh = r.cnh ? `, CNH nº ${r.cnh}` : "";
  const endereco = [r.endereco, r.cidade_uf].filter(Boolean).join(", ") || BLANK;
  const placa = c.placa || BLANK;
  const auto = c.numero_auto || BLANK;
  const qualificacao =
    `${nome}, CPF ${cpf}${cnh}, residente em ${endereco}, na qualidade de ${qualidadeLabel(r.qualidade)} do veículo de placa ${placa}, ` +
    `vem apresentar ${piece.titulo.toLowerCase().replace(/\(.*?\)/g, "").trim()} referente ao Auto de Infração nº ${auto}, pelos fatos e fundamentos a seguir.`;

  const referencia = [
    `Auto de Infração nº ${auto}`,
    c.codigo_infracao ? `Código da infração: ${c.codigo_infracao}` : null,
    c.data_infracao ? `Data da infração: ${formatBR(c.data_infracao)}${c.hora_infracao ? `, às ${c.hora_infracao}` : ""}` : null,
    c.local_infracao ? `Local: ${c.local_infracao}` : null,
    `Placa: ${placa}`,
  ].filter((x): x is string => Boolean(x));

  const anexos = [
    "Cópia de documento de identificação com foto do requerente (RG ou CNH).",
    "Cópia do CRLV do veículo.",
    "Cópia da notificação recebida, frente e verso. Não é exigida para admitir a defesa (CTB, art. 285, § 4º), mas ajuda o julgador.",
    "Se você não for o proprietário: documento que mostre sua relação com o veículo ou com a infração.",
    "Se for representado por outra pessoa: procuração assinada.",
  ];
  if (input.selected.some((s) => s.thesis_id === "T04_IMAGEM_NAO_COMPROVA")) anexos.push("Cópia da imagem da infração que você recebeu ou baixou do site do órgão.");
  if (input.selected.some((s) => s.thesis_id === "T03_IDENTIFICACAO_VEICULO")) anexos.push("Cópia legível do CRLV, mostrando a placa, a marca e o modelo.");

  const prazo = d.prazo.efetivo ? formatBR(d.prazo.efetivo) : "a data final indicada na notificação";
  const protocolo = [
    "Confira seus dados na primeira página e complete o que estiver em branco.",
    "Imprima e assine. Se o órgão aceitar protocolo digital, use a assinatura digital que ele indicar (por exemplo, a do gov.br).",
    "Junte os anexos da lista.",
    "Protocole pelo canal indicado na sua notificação: site ou aplicativo do órgão, Sistema de Notificação Eletrônica (SNE), Correios com aviso de recebimento ou atendimento presencial.",
    `Faça isso até ${prazo}. Guarde o comprovante de protocolo.`,
    "Quando sair o resultado, volte ao seu link do ContraMulta e informe se foi deferido ou indeferido.",
  ];
  if (pieceType !== "defesa_previa") {
    protocolo.splice(4, 0, "Se a infração foi em outra cidade ou estado, o recurso pode ser entregue no órgão de trânsito da sua residência (CTB, art. 287).");
  }

  const doc: DocumentModel = {
    titulo: piece.titulo,
    destinatario: fill(piece.destinatario, values),
    referencia,
    qualificacao,
    fatos: input.narrative,
    direito,
    pedidos,
    fecho: ["Nestes termos, pede deferimento.", `${BLANK}, ____ de ______________ de ________.`, "", BLANK, nome === BLANK ? "Assinatura do requerente" : nome],
    anexos,
    protocolo,
    aviso_teste: input.testEnvironment ? "Documento gerado em ambiente de testes do ContraMulta. Modelo ainda não revisado por advogado." : null,
  };
  assertValidCitations(doc);
  return doc;
}

/** Texto corrido da peça, para copiar em formulários online. */
export function documentPlainText(doc: DocumentModel): string {
  const lines: string[] = [];
  lines.push(doc.destinatario, "", doc.titulo, "", ...doc.referencia, "", doc.qualificacao, "", "1. DOS FATOS", "", ...doc.fatos.flatMap((p) => [p, ""]));
  lines.push("2. DO DIREITO", "");
  doc.direito.forEach((s, i) => {
    lines.push(`2.${i + 1}. ${s.titulo}`, "", ...s.paragrafos.flatMap((p) => [p, ""]));
    for (const f of s.fundamentos) lines.push(`“${f.texto.replace(/\n/g, " ")}” (${f.citacao})`, "");
  });
  lines.push("3. DOS PEDIDOS", "", "Diante do exposto, requer:", "");
  doc.pedidos.forEach((p, i) => lines.push(`${String.fromCharCode(97 + i)}) ${p};`));
  lines.push("", ...doc.fecho);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Garante que toda citação do documento final existe na base. Falha aqui é erro de template, não da LLM. */
export function assertValidCitations(doc: DocumentModel): void {
  const ownText = [doc.destinatario, doc.qualificacao, ...doc.fatos, ...doc.direito.flatMap((s) => s.paragrafos), ...doc.pedidos, ...doc.anexos, ...doc.protocolo].join("\n");
  const v = validateText(ownText);
  if (!v.ok) throw new Error("citação fora da base no documento: " + v.invalid.map((c) => `${c.raw} (${c.reason})`).join("; "));
}

/** Narrativa usada quando a LLM não responde: só fatos confirmados, sem adjetivos e sem citações. */
export function fallbackNarrative(c: Confirmed, d: Diagnosis): string[] {
  const parts: string[] = [];
  const quando = c.data_infracao ? `em ${formatBR(c.data_infracao)}${c.hora_infracao ? `, às ${c.hora_infracao}` : ""}` : "em data indicada na notificação";
  const onde = c.local_infracao ? `, no local "${c.local_infracao}"` : "";
  const oque = c.descricao_infracao ? `pela conduta descrita como "${c.descricao_infracao}"` : "por infração de trânsito";
  parts.push(`O requerente recebeu notificação do(a) ${c.orgao_autuador || "órgão autuador"} referente ao Auto de Infração nº ${c.numero_auto || "indicado na notificação"}, lavrado ${oque}, que teria ocorrido ${quando}${onde}, com o veículo de placa ${c.placa || "indicada na notificação"}.`);
  const datas: string[] = [];
  if (c.data_expedicao) datas.push(`a notificação foi expedida em ${formatBR(c.data_expedicao)}`);
  else if (c.data_postagem) datas.push(`a notificação foi postada em ${formatBR(c.data_postagem)}`);
  if (c.prazo_final) datas.push(`com prazo final em ${formatBR(c.prazo_final)}`);
  if (datas.length) parts.push(`Segundo o próprio documento, ${datas.join(", ")}.`);
  if (d.achados.length) parts.push(`Ao examinar a notificação, o requerente verificou os pontos descritos a seguir.`);
  return parts;
}
