// Motor de regras determinístico. Sem LLM. Recebe os dados confirmados pelo usuário e devolve o diagnóstico.
import { NOTICES, PIECES, THESES, citationLabel, type ExcerptRef, type PieceType, type Thesis } from "../legal";
import type { Confirmed, Missable } from "../schemas";
import { diffDays, formatBR, isValidDate, rollWeekend } from "./dates";
import { checkEnquadramento, descriptionTopics, parseArticle } from "./enquadramento";
import { compareVehicle } from "./vehicle";
import { formatBRL } from "../format";

export type FindingKind = "achado" | "bloqueio" | "aviso";

export interface Finding {
  rule_id: string;
  kind: FindingKind;
  titulo: string;
  detalhe: string;
  thesis_ids: string[];
  /** Valores para os campos do texto-modelo da tese. */
  dados: Record<string, string>;
  /** Fundamentos adicionais (da base) que a peça deve citar junto com os da tese. */
  fundamento_extra: ExcerptRef[];
  /** Rótulos das citações que sustentam o achado, para exibir no diagnóstico. */
  citacoes: string[];
}

export interface EligibleThesis {
  thesis_id: string;
  rule_id: string;
  peso: number;
  acessoria: boolean;
  titulo: string;
}

export type StrengthLevel = "fraca" | "moderada" | "forte";

export interface Strength {
  nivel: StrengthLevel;
  pontos: number;
  explicacao: string;
  composicao: { thesis_id: string; titulo: string; peso: number; acessoria: boolean }[];
}

export interface Piece {
  tipo: PieceType;
  titulo: string;
  explicacao: string;
  citacoes: string[];
}

export interface Deadline {
  final: string | null;
  efetivo: string | null;
  dias_restantes: number | null;
  vencido: boolean;
  prorrogado_fim_de_semana: boolean;
}

export interface Diagnosis {
  versao_motor: string;
  hoje: string;
  peca: Piece | null;
  prazo: Deadline;
  venda: { permitida: boolean; motivo: string | null; exige_ciencia_sem_achados: boolean };
  achados: Finding[];
  bloqueios: Finding[];
  avisos: Finding[];
  nao_encontrado: string[];
  nao_verificado: string[];
  teses_elegiveis: EligibleThesis[];
  forca: Strength;
  sem_achados: boolean;
}

export interface ThesisOverride {
  thesis_id: string;
  status?: string | null;
  weight?: number | null;
}

export const ENGINE_VERSION = "2026-10-27.1";

const MISSING_LABEL: Record<Missable, string> = {
  tipificacao: "a tipificação da infração",
  local: "o local da infração",
  data: "a data da infração",
  hora: "a hora da infração",
  placa: "a placa do veículo",
  marca: "a marca do veículo",
  orgao: "a identificação do órgão autuador",
  agente_ou_equipamento: "a identificação do agente autuador ou do equipamento que comprovou a infração",
  agente: "a identificação do agente que referendou o registro",
  prazo: "a data final para a apresentação da defesa ou do recurso",
};

const ELEMENTS_280: Missable[] = ["tipificacao", "local", "data", "hora", "placa", "marca", "orgao", "agente_ou_equipamento"];

function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function labels(refs: ExcerptRef[]): string[] {
  return refs.map(citationLabel);
}

function finding(f: Omit<Finding, "dados" | "fundamento_extra" | "citacoes" | "thesis_ids"> & Partial<Finding>): Finding {
  return { thesis_ids: [], dados: {}, fundamento_extra: [], citacoes: [], ...f };
}

function thesesForRule(rule: string): Thesis[] {
  return THESES.filter((t) => t.condicao_de_aplicacao.regra === rule);
}

function decidePiece(c: Confirmed): Piece | null {
  if (c.tipo_documento === "notificacao_autuacao") {
    const p = PIECES.defesa_previa;
    return {
      tipo: "defesa_previa",
      titulo: "Defesa prévia",
      explicacao: "É a primeira defesa, feita antes de a multa ser aplicada. Ela vai para a autoridade de trânsito do órgão que fez a autuação.",
      citacoes: labels(p.fundamento),
    };
  }
  if (c.tipo_documento === "notificacao_penalidade") {
    if (c.jari_ja_indeferiu) {
      const p = PIECES.recurso_segunda_instancia;
      return {
        tipo: "recurso_segunda_instancia",
        titulo: "Recurso em 2ª instância",
        explicacao: "A JARI já negou seu recurso. Cabe um novo recurso, julgado em segunda instância (CETRAN, CONTRANDIFE ou colegiado especial, conforme o órgão). O prazo conta da publicação ou da notificação da decisão da JARI.",
        citacoes: labels(p.fundamento),
      };
    }
    const p = PIECES.recurso_jari;
    return {
      tipo: "recurso_jari",
      titulo: "Recurso à JARI (1ª instância)",
      explicacao: "A multa já foi aplicada. O recurso vai para a Junta Administrativa de Recursos de Infrações (JARI) do órgão que autuou.",
      citacoes: labels(p.fundamento),
    };
  }
  return null;
}

function computeDeadline(c: Confirmed, today: string): Deadline {
  if (!c.prazo_final || !isValidDate(c.prazo_final)) {
    return { final: null, efetivo: null, dias_restantes: null, vencido: false, prorrogado_fim_de_semana: false };
  }
  const efetivo = rollWeekend(c.prazo_final);
  const dias = diffDays(today, efetivo);
  return { final: c.prazo_final, efetivo, dias_restantes: dias, vencido: dias < 0, prorrogado_fim_de_semana: efetivo !== c.prazo_final };
}

function isRemote(c: Confirmed): boolean {
  return c.meio_constatacao === "videomonitoramento" || c.meio_constatacao === "sanmft" || Boolean(c.equipamento_identificacao) || c.tem_imagem === true;
}

function infractionTheme(c: Confirmed): "celular" | "cinto" | null {
  const art = parseArticle(c.artigo_infracao);
  const t = descriptionTopics(c.descricao_infracao);
  if (art.artigo === "167" || t.cinto) return "cinto";
  if (art.artigo === "252" || t.celular) return "celular";
  return null;
}

export function diagnose(c: Confirmed, today: string, overrides: ThesisOverride[] = []): Diagnosis {
  const achados: Finding[] = [];
  const bloqueios: Finding[] = [];
  const avisos: Finding[] = [];
  const naoEncontrado: string[] = [];
  const naoVerificado: string[] = [];
  const ausentes = new Set(c.ausentes);

  // ---- Peça cabível
  const peca = decidePiece(c);
  if (!peca) {
    bloqueios.push(
      finding({
        rule_id: "R_DOCUMENTO_NAO_SUPORTADO",
        kind: "bloqueio",
        titulo: "Este documento não é uma notificação de autuação ou de penalidade",
        detalhe: "O ContraMulta só prepara defesa prévia (para a notificação da autuação) e recursos (para a notificação da penalidade). Confira se você enviou o documento certo.",
      }),
    );
  }

  // ---- Prazo
  const prazo = computeDeadline(c, today);
  if (prazo.final && prazo.vencido) {
    const proximo =
      peca?.tipo === "defesa_previa"
        ? "Sem defesa prévia, o órgão aplica a penalidade e envia a notificação da penalidade. Quando ela chegar, você ainda pode recorrer à JARI dentro do prazo indicado nela."
        : "Recurso fora do prazo é arquivado sem análise e não suspende a cobrança.";
    bloqueios.push(
      finding({
        rule_id: "R_PRAZO_VENCIDO",
        kind: "bloqueio",
        titulo: "O prazo já acabou",
        detalhe: `O prazo final indicado era ${formatBR(prazo.final)}${prazo.prorrogado_fim_de_semana ? ` (prorrogado para ${formatBR(prazo.efetivo!)}, primeiro dia útil)` : ""}. Por isso não vendemos esta peça. ${proximo}`,
        citacoes: labels([
          { excerpt: "CTB_ART_285", seletor: { paragrafo: "5" } },
          { excerpt: "CTB_ART_282", seletor: { caput: true } },
          ...NOTICES.contagem_prazo!.fundamento,
        ]),
      }),
    );
  } else if (!prazo.final) {
    if (ausentes.has("prazo")) {
      // tratado como elemento ausente abaixo
    } else {
      naoVerificado.push("Prazo final: não informado. Confira a data na notificação antes de protocolar.");
    }
  }

  // ---- Intempestividade da notificação da autuação (30 dias)
  const naExpedicao = c.tipo_documento === "notificacao_autuacao" ? (c.data_expedicao ?? c.data_postagem) : c.na_data_expedicao;
  const naFonte = c.tipo_documento === "notificacao_autuacao" && !c.data_expedicao && c.data_postagem ? "postagem" : "expedição";
  if (c.data_infracao && naExpedicao && isValidDate(c.data_infracao) && isValidDate(naExpedicao)) {
    const dias = diffDays(c.data_infracao, naExpedicao);
    if (dias < 0) {
      avisos.push(
        finding({
          rule_id: "R_DATAS_INCONSISTENTES",
          kind: "aviso",
          titulo: "As datas não fazem sentido",
          detalhe: `A data de ${naFonte} (${formatBR(naExpedicao)}) é anterior à data da infração (${formatBR(c.data_infracao)}). Confira as datas digitadas.`,
        }),
      );
    } else if (dias > 30) {
      const ts = thesesForRule("R_INTEMPESTIVIDADE_NA");
      achados.push(
        finding({
          rule_id: "R_INTEMPESTIVIDADE_NA",
          kind: "achado",
          titulo: "A notificação da autuação saiu atrasada",
          detalhe: `A infração foi em ${formatBR(c.data_infracao)} e a notificação da autuação foi expedida em ${formatBR(naExpedicao)} (data de ${naFonte}): ${dias} dias depois. A lei dá no máximo 30 dias. Passado esse prazo, o auto de infração deve ser arquivado.`,
          thesis_ids: ts.map((t) => t.id),
          dados: { data_infracao: formatBR(c.data_infracao), data_expedicao: formatBR(naExpedicao), dias_expedicao: String(dias) },
          citacoes: ts.flatMap((t) => labels(t.fundamento)),
        }),
      );
    } else {
      naoEncontrado.push(`Prazo de expedição da notificação da autuação: dentro dos 30 dias (${dias} ${dias === 1 ? "dia" : "dias"}).`);
    }
  } else if (c.tipo_documento === "notificacao_autuacao") {
    naoVerificado.push("Prazo de 30 dias para expedir a notificação: faltou a data da infração ou a data de expedição/postagem.");
  } else if (c.tipo_documento === "notificacao_penalidade") {
    naoVerificado.push("Prazo de 30 dias da notificação da autuação: só dá para conferir se você informar a data de expedição da notificação da autuação anterior.");
  }

  // ---- Decadência da notificação da penalidade (180/360 dias)
  if (c.tipo_documento === "notificacao_penalidade") {
    const npExp = c.data_expedicao ?? c.data_postagem;
    if (c.data_infracao && npExp && isValidDate(c.data_infracao) && isValidDate(npExp)) {
      const limite = c.defesa_previa_apresentada === "nao" ? 180 : 360;
      const dias = diffDays(c.data_infracao, npExp);
      if (dias > limite) {
        const ts = thesesForRule("R_DECADENCIA_NP");
        achados.push(
          finding({
            rule_id: "R_DECADENCIA_NP",
            kind: "achado",
            titulo: "A notificação da multa saiu depois do prazo legal",
            detalhe: `A infração foi em ${formatBR(c.data_infracao)} e a notificação da penalidade foi expedida em ${formatBR(npExp)}: ${dias} dias depois. O limite é de ${limite} dias${limite === 360 ? " (considerando que houve defesa prévia ou que você não sabe)" : ""}. Passado esse prazo, o órgão perde o direito de aplicar a multa.`,
            thesis_ids: ts.map((t) => t.id),
            dados: { data_infracao: formatBR(c.data_infracao), data_expedicao: formatBR(npExp), dias_expedicao: String(dias), prazo_legal_dias: String(limite) },
            citacoes: ts.flatMap((t) => labels(t.fundamento)),
          }),
        );
      } else {
        naoEncontrado.push(`Prazo para expedir a notificação da penalidade: dentro do limite (${dias} de ${limite} dias).`);
      }
    } else {
      naoVerificado.push("Prazo para expedir a notificação da penalidade: faltou a data da infração ou a data de expedição/postagem.");
    }
  }

  // ---- Elementos obrigatórios ausentes
  const faltando = ELEMENTS_280.filter((k) => ausentes.has(k));
  const faltaPrazo = ausentes.has("prazo");
  if (faltando.length || faltaPrazo) {
    const itens = [...faltando, ...(faltaPrazo ? (["prazo"] as Missable[]) : [])].map((k) => MISSING_LABEL[k]);
    const ts = thesesForRule("R_ELEMENTO_AUSENTE");
    const extra: ExcerptRef[] = faltaPrazo
      ? c.tipo_documento === "notificacao_penalidade"
        ? [{ excerpt: "CTB_ART_282", seletor: { paragrafo: "4" } }]
        : [{ excerpt: "CTB_ART_281A", seletor: { caput: true } }]
      : [];
    achados.push(
      finding({
        rule_id: "R_ELEMENTO_AUSENTE",
        kind: "achado",
        titulo: "Falta informação obrigatória na notificação",
        detalhe: `Você confirmou que a notificação não traz ${joinPt(itens)}. A lei exige esses dados no auto de infração e na notificação.`,
        thesis_ids: ts.map((t) => t.id),
        dados: { elementos_ausentes: joinPt(itens) },
        fundamento_extra: extra,
        citacoes: [...ts.flatMap((t) => labels(t.fundamento)), ...labels(extra)],
      }),
    );
  } else {
    naoEncontrado.push("Dados obrigatórios do auto (infração, local, data, hora, placa, marca, órgão, agente ou equipamento): você confirmou que constam.");
  }

  // ---- Divergência de veículo (CRLV)
  if (c.crlv && (c.crlv.placa || c.crlv.marca_modelo)) {
    const cmp = compareVehicle({ placa: c.placa, marca_modelo: c.marca_modelo }, c.crlv);
    const diffs: string[] = [];
    if (cmp.placa === "diferente") diffs.push(`placa ${c.placa} na notificação e ${c.crlv.placa} no CRLV`);
    if (cmp.marca === "diferente") diffs.push(`marca/modelo "${c.marca_modelo}" na notificação e "${c.crlv.marca_modelo}" no CRLV`);
    if (diffs.length) {
      const ts = thesesForRule("R_DIVERGENCIA_VEICULO");
      achados.push(
        finding({
          rule_id: "R_DIVERGENCIA_VEICULO",
          kind: "achado",
          titulo: "O veículo da notificação não bate com o seu documento",
          detalhe: `Encontramos diferença: ${joinPt(diffs)}.`,
          thesis_ids: ts.map((t) => t.id),
          dados: {
            veiculo_notificacao: [c.placa && `placa ${c.placa}`, c.marca_modelo && `marca/modelo ${c.marca_modelo}`].filter(Boolean).join(", "),
            veiculo_crlv: [c.crlv.placa && `placa ${c.crlv.placa}`, c.crlv.marca_modelo && `marca/modelo ${c.crlv.marca_modelo}`].filter(Boolean).join(", "),
          },
          citacoes: ts.flatMap((t) => labels(t.fundamento)),
        }),
      );
    } else if (cmp.modelo === "diferente") {
      avisos.push(
        finding({
          rule_id: "R_MODELO_DIFERENTE",
          kind: "aviso",
          titulo: "O nome do modelo está escrito de outro jeito",
          detalhe: `Placa e marca batem, mas o modelo aparece como "${c.marca_modelo}" na notificação e "${c.crlv.marca_modelo}" no CRLV. Pode ser só abreviação. Não contamos isso como falha.`,
        }),
      );
    } else if (cmp.placa === "igual" || cmp.marca === "igual") {
      naoEncontrado.push("Placa e marca da notificação conferem com o CRLV.");
    } else {
      naoVerificado.push("Veículo: faltou placa ou marca para comparar com o CRLV.");
    }
  } else {
    naoVerificado.push("Veículo: sem dados do CRLV, não comparamos placa e marca.");
  }

  // ---- Enquadramento (descrição × artigo × natureza × valor × pontos)
  const enq = checkEnquadramento({ artigo: c.artigo_infracao, descricao: c.descricao_infracao, valor: c.valor, pontos: c.pontos });
  if (enq.incoerencias.length) {
    const ts = thesesForRule("R_INCOERENCIA_ENQUADRAMENTO");
    const extra: ExcerptRef[] = enq.dispositivo ? [enq.dispositivo.ref] : [];
    achados.push(
      finding({
        rule_id: "R_INCOERENCIA_ENQUADRAMENTO",
        kind: "achado",
        titulo: "Descrição, artigo, valor ou pontos não batem",
        detalhe: enq.incoerencias.map((i) => i.simples).join(" "),
        thesis_ids: ts.map((t) => t.id),
        dados: {
          descricao_infracao: c.descricao_infracao ?? "",
          artigo_infracao: c.artigo_infracao ?? "",
          incoerencias: enq.incoerencias.map((i) => i.peca).join(" "),
        },
        fundamento_extra: extra,
        citacoes: [...ts.flatMap((t) => labels(t.fundamento)), ...labels(extra)],
      }),
    );
  } else if (enq.conferido) {
    naoEncontrado.push(`Descrição, artigo, valor e pontos conferem entre si (${enq.dispositivo?.rotulo}).`);
  } else if (c.artigo_infracao) {
    naoVerificado.push("Enquadramento: nesta versão só conferimos descrição, artigo, valor e pontos para cinto (art. 167) e celular (art. 252).");
  }
  naoVerificado.push("Código da infração: não conferido com a tabela oficial do Manual Brasileiro de Fiscalização de Trânsito (a tabela ainda não está na nossa base).");

  // ---- Imagem
  const tema = infractionTheme(c);
  if (c.tem_imagem && c.imagem) {
    const fatos: string[] = [];
    const im = c.imagem;
    if (tema === "celular") {
      if (im.objeto_na_mao === "objeto_nao_identificavel") fatos.push("que o objeto na mão do condutor seja um telefone celular");
      if (im.objeto_na_mao === "mao_sem_objeto") fatos.push("o condutor segurando um telefone celular, pois a mão aparece sem objeto");
      if (im.objeto_na_mao === "maos_nao_visiveis") fatos.push("as mãos do condutor");
      if (im.pessoa_em_foco === "passageiro") fatos.push("que o telefone estivesse com o condutor, pois a pessoa em foco é o passageiro");
      if (im.pessoa_em_foco === "indeterminado") fatos.push("se a pessoa em foco é o condutor");
    }
    if (tema === "cinto") {
      if (im.cinto === "nao_e_possivel_ver") fatos.push("se o cinto de segurança estava ou não em uso");
      if (im.cinto === "cinto_visivel_em_uso") fatos.push("a falta do cinto de segurança, pois o cinto aparece em uso");
    }
    if (im.placa_legivel === false) fatos.push("a placa do veículo, que não está legível");
    if (fatos.length) {
      const ts = thesesForRule("R_IMAGEM_INCONCLUSIVA");
      achados.push(
        finding({
          rule_id: "R_IMAGEM_INCONCLUSIVA",
          kind: "achado",
          titulo: "A foto não mostra a infração com clareza",
          detalhe: `Pela descrição da imagem que você confirmou, ela não permite verificar ${joinPt(fatos)}.`,
          thesis_ids: ts.map((t) => t.id),
          dados: { fatos_nao_verificaveis: joinPt(fatos) },
          citacoes: ts.flatMap((t) => labels(t.fundamento)),
        }),
      );
    } else {
      naoEncontrado.push("Imagem da infração: pela descrição confirmada, ela mostra o que a autuação descreve.");
    }
  } else if (tema) {
    naoVerificado.push("Imagem da infração: não enviada ou não confirmada, então não analisamos o que ela mostra.");
  }

  // ---- Agente que referendou o registro (acessória)
  if (isRemote(c) && ausentes.has("agente")) {
    const ts = thesesForRule("R_AGENTE_NAO_IDENTIFICADO");
    achados.push(
      finding({
        rule_id: "R_AGENTE_NAO_IDENTIFICADO",
        kind: "achado",
        titulo: "A notificação não diz quem validou o registro da câmera",
        detalhe: "A infração foi registrada por equipamento com imagem e a notificação não identifica a autoridade ou o agente que referendou esse registro, como a regra exige. É um argumento complementar.",
        thesis_ids: ts.map((t) => t.id),
        citacoes: ts.flatMap((t) => labels(t.fundamento)),
      }),
    );
  }

  // ---- Meio de constatação não informado (acessória)
  if (c.meio_constatacao === "nao_informado" && isRemote(c)) {
    const ts = thesesForRule("R_MEIO_COMPROVACAO_NAO_INFORMADO");
    achados.push(
      finding({
        rule_id: "R_MEIO_COMPROVACAO_NAO_INFORMADO",
        kind: "achado",
        titulo: "A notificação não diz como a infração foi registrada",
        detalhe: "Você confirmou que a notificação não informa se a infração foi constatada por videomonitoramento ou por sistema automático. As regras exigem essa informação. É um argumento complementar.",
        thesis_ids: ts.map((t) => t.id),
        citacoes: ts.flatMap((t) => labels(t.fundamento)),
      }),
    );
  }

  // ---- Conformidade (INMETRO) do sistema automático não metrológico (acessória)
  if (c.meio_constatacao === "sanmft" && c.sanmft_conformidade_informada === "nao") {
    const ts = thesesForRule("R_SANMFT_SEM_CONFORMIDADE");
    achados.push(
      finding({
        rule_id: "R_SANMFT_SEM_CONFORMIDADE",
        kind: "achado",
        titulo: "Não há prova da avaliação do equipamento pelo INMETRO",
        detalhe: "A notificação diz que a infração foi registrada por sistema automático não metrológico, que precisa ter o modelo avaliado pelo INMETRO, e não traz essa informação. É um pedido complementar de prova.",
        thesis_ids: ts.map((t) => t.id),
        citacoes: ts.flatMap((t) => labels(t.fundamento)),
      }),
    );
  }

  // ---- Aviso: desconto do SNE
  const sne = NOTICES.desconto_sne!.fundamento;
  const valorTxt = (pct: number) => (c.valor ? ` (${formatBRL(c.valor * pct)})` : "");
  avisos.push(
    finding({
      rule_id: "A_DESCONTO_SNE",
      kind: "aviso",
      titulo: c.sne_aderido === "sim" ? "Atenção: recorrer faz você perder o desconto de 40%" : "Desconto por pagar sem recorrer",
      detalhe:
        `Quem aderiu ao Sistema de Notificação Eletrônica (SNE) antes do envio da notificação da autuação e não apresenta defesa nem recurso pode pagar 60% do valor${valorTxt(0.6)}. Se você recorrer, perde esse desconto. ` +
        `Pagar até o vencimento por 80% do valor${valorTxt(0.8)} não impede o questionamento.` +
        (c.sne_aderido === "sim" ? " Você informou que aderiu ao SNE: compare o valor com desconto com a força da defesa antes de decidir." : ""),
      citacoes: labels(sne),
    }),
  );

  // ---- Teses elegíveis e força
  const piece = peca?.tipo ?? null;
  const ovr = new Map(overrides.map((o) => [o.thesis_id, o]));
  const eligible: EligibleThesis[] = [];
  for (const f of achados) {
    for (const id of f.thesis_ids) {
      const t = THESES.find((x) => x.id === id);
      if (!t) continue;
      const o = ovr.get(id);
      const status = o?.status ?? t.status;
      if (status === "suspensa") continue;
      if (piece && !t.pecas.includes(piece)) continue;
      if (eligible.some((e) => e.thesis_id === id)) continue;
      eligible.push({ thesis_id: id, rule_id: f.rule_id, peso: o?.weight ?? t.peso, acessoria: t.acessoria, titulo: t.titulo });
    }
  }
  const forca = computeStrength(eligible);

  const blocked = bloqueios.length > 0;
  const semAchados = achados.length === 0;
  return {
    versao_motor: ENGINE_VERSION,
    hoje: today,
    peca,
    prazo,
    venda: {
      permitida: !blocked,
      motivo: blocked ? bloqueios.map((b) => b.titulo).join("; ") : null,
      exige_ciencia_sem_achados: !blocked && semAchados,
    },
    achados,
    bloqueios,
    avisos,
    nao_encontrado: naoEncontrado,
    nao_verificado: naoVerificado,
    teses_elegiveis: eligible,
    forca,
    sem_achados: semAchados,
  };
}

/**
 * Força da defesa, por regra:
 * pontos = soma dos pesos das teses principais + 1 se houver ao menos uma tese acessória.
 * Forte: alguma tese principal de peso 3, ou pontos ≥ 4. Moderada: pontos ≥ 2. Fraca: o resto.
 */
export function computeStrength(eligible: EligibleThesis[]): Strength {
  const principais = eligible.filter((e) => !e.acessoria);
  const acessorias = eligible.filter((e) => e.acessoria);
  const pontos = principais.reduce((s, e) => s + e.peso, 0) + (acessorias.length ? 1 : 0);
  const temPeso3 = principais.some((e) => e.peso >= 3);
  const nivel: StrengthLevel = temPeso3 || pontos >= 4 ? "forte" : pontos >= 2 ? "moderada" : "fraca";
  const composicao = eligible.map((e) => ({ thesis_id: e.thesis_id, titulo: e.titulo, peso: e.peso, acessoria: e.acessoria }));
  let explicacao: string;
  if (!eligible.length) {
    explicacao = "Não encontramos falha formal que sustente a defesa.";
  } else if (nivel === "forte") {
    explicacao = temPeso3
      ? `Há pelo menos uma falha formal objetiva, de peso alto: ${principais.filter((e) => e.peso >= 3).map((e) => e.titulo.toLowerCase()).join("; ")}.`
      : `Há várias falhas formais que se somam (${pontos} pontos).`;
  } else if (nivel === "moderada") {
    explicacao = `Há falha formal de peso médio (${pontos} pontos). Ela depende de como o órgão vai avaliar o documento e a prova.`;
  } else {
    explicacao = "Só encontramos argumentos complementares, de peso baixo.";
  }
  explicacao += " A força é calculada por regra, pelos pesos das teses aplicáveis. Não é uma promessa de resultado.";
  return { nivel, pontos, explicacao, composicao };
}
