import { describe, expect, it } from "vitest";
import { diagnose, computeStrength, type EligibleThesis } from "../src/shared/rules/engine";
import { diffDays, rollWeekend, addDays, todayBrasilia } from "../src/shared/rules/dates";
import { samePlate, toMercosul, compareVehicle } from "../src/shared/rules/vehicle";
import { DISPOSITIVOS, finesFromBase, pointsFromBase, parseArticle, checkEnquadramento } from "../src/shared/rules/enquadramento";
import { ConfirmedSchema, type Confirmed } from "../src/shared/schemas";

const TODAY = "2026-10-27"; // terça-feira

function base(over: Partial<Confirmed> = {}): Confirmed {
  return ConfirmedSchema.parse({
    tipo_documento: "notificacao_autuacao",
    orgao_autuador: "DEPARTAMENTO DE TRÂNSITO DE EXEMPLO",
    numero_auto: "EX0001234",
    codigo_infracao: "000-00",
    descricao_infracao: "Dirigir veículo segurando ou manuseando telefone celular",
    artigo_infracao: "252, parágrafo único",
    data_infracao: "2026-09-01",
    hora_infracao: "08:15",
    local_infracao: "Av. Exemplo, 100",
    placa: "ABC1D23",
    marca_modelo: "VW/GOL 1.0",
    data_expedicao: "2026-09-20",
    data_postagem: null,
    prazo_final: "2026-11-20",
    agente_identificacao: "Matrícula 0000",
    equipamento_identificacao: null,
    valor: 293.47,
    pontos: 7,
    tem_imagem: false,
    ...over,
  });
}

const ruleIds = (d: ReturnType<typeof diagnose>) => d.achados.map((a) => a.rule_id);

describe("datas", () => {
  it("conta dias corridos e prorroga fim de semana", () => {
    expect(diffDays("2026-09-01", "2026-10-01")).toBe(30);
    expect(diffDays("2026-02-28", "2026-03-01")).toBe(1);
    expect(diffDays("2024-02-28", "2024-03-01")).toBe(2); // bissexto
    expect(rollWeekend("2026-10-31")).toBe("2026-11-02"); // sábado -> segunda
    expect(rollWeekend("2026-11-01")).toBe("2026-11-02"); // domingo -> segunda
    expect(rollWeekend("2026-10-30")).toBe("2026-10-30"); // sexta
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("calcula hoje no fuso de Brasília", () => {
    expect(todayBrasilia(new Date("2026-10-28T02:30:00Z"))).toBe("2026-10-27");
    expect(todayBrasilia(new Date("2026-10-28T03:30:00Z"))).toBe("2026-10-28");
  });
});

describe("base literal usada pelo motor", () => {
  it("lê valores e pontos do CTB (arts. 258 e 259)", () => {
    expect(finesFromBase()).toEqual({ gravissima: 293.47, grave: 195.23, media: 130.16, leve: 88.38 });
    expect(pointsFromBase()).toEqual({ gravissima: 7, grave: 5, media: 4, leve: 3 });
  });
  it("lê a natureza de cada dispositivo do texto literal", () => {
    const nat = Object.fromEntries(DISPOSITIVOS.map((d) => [d.chave, d.natureza]));
    expect(nat).toEqual({ "167": "grave", "252:V": "media", "252:VI": "media", "252:unico": "gravissima" });
  });
});

describe("intempestividade da notificação da autuação", () => {
  it("30 dias é tempestivo, 31 é intempestivo", () => {
    expect(ruleIds(diagnose(base({ data_expedicao: "2026-10-01" }), TODAY))).not.toContain("R_INTEMPESTIVIDADE_NA");
    const d = diagnose(base({ data_expedicao: "2026-10-02" }), TODAY);
    expect(ruleIds(d)).toContain("R_INTEMPESTIVIDADE_NA");
    const f = d.achados.find((a) => a.rule_id === "R_INTEMPESTIVIDADE_NA")!;
    expect(f.dados.dias_expedicao).toBe("31");
    expect(f.thesis_ids).toEqual(["T01_INTEMPESTIVIDADE_NA"]);
  });
  it("usa a data de postagem quando não há data de expedição", () => {
    const d = diagnose(base({ data_expedicao: null, data_postagem: "2026-10-15" }), TODAY);
    const f = d.achados.find((a) => a.rule_id === "R_INTEMPESTIVIDADE_NA")!;
    expect(f.detalhe).toContain("data de postagem");
  });
  it("sem data de expedição nem postagem, informa que não verificou", () => {
    const d = diagnose(base({ data_expedicao: null, data_postagem: null }), TODAY);
    expect(ruleIds(d)).not.toContain("R_INTEMPESTIVIDADE_NA");
    expect(d.nao_verificado.join(" ")).toMatch(/30 dias/);
  });
  it("sem data da infração, informa que não verificou", () => {
    const d = diagnose(base({ data_infracao: null }), TODAY);
    expect(ruleIds(d)).not.toContain("R_INTEMPESTIVIDADE_NA");
    expect(d.nao_verificado.join(" ")).toMatch(/30 dias/);
  });
  it("expedição antes da infração gera aviso de datas inconsistentes", () => {
    const d = diagnose(base({ data_expedicao: "2026-08-01" }), TODAY);
    expect(d.avisos.map((a) => a.rule_id)).toContain("R_DATAS_INCONSISTENTES");
    expect(ruleIds(d)).not.toContain("R_INTEMPESTIVIDADE_NA");
  });
  it("na notificação de penalidade, usa a data da notificação da autuação informada", () => {
    const d = diagnose(base({ tipo_documento: "notificacao_penalidade", data_expedicao: "2026-10-10", na_data_expedicao: "2026-10-05" }), TODAY);
    expect(ruleIds(d)).toContain("R_INTEMPESTIVIDADE_NA");
  });
});

describe("prazo de defesa", () => {
  it("vencido bloqueia a venda e explica", () => {
    const d = diagnose(base({ prazo_final: "2026-10-26" }), TODAY);
    expect(d.prazo.vencido).toBe(true);
    expect(d.venda.permitida).toBe(false);
    expect(d.bloqueios[0]!.rule_id).toBe("R_PRAZO_VENCIDO");
    expect(d.bloqueios[0]!.detalhe).toMatch(/JARI/);
  });
  it("vence hoje: ainda permitido, 0 dias restantes", () => {
    const d = diagnose(base({ prazo_final: TODAY }), TODAY);
    expect(d.prazo.vencido).toBe(false);
    expect(d.prazo.dias_restantes).toBe(0);
    expect(d.venda.permitida).toBe(true);
  });
  it("vencimento no sábado é prorrogado para segunda", () => {
    const d = diagnose(base({ prazo_final: "2026-10-24" }), "2026-10-26");
    expect(d.prazo.efetivo).toBe("2026-10-26");
    expect(d.prazo.vencido).toBe(false);
    expect(diagnose(base({ prazo_final: "2026-10-24" }), "2026-10-27").prazo.vencido).toBe(true);
  });
  it("sem prazo informado não bloqueia, mas avisa", () => {
    const d = diagnose(base({ prazo_final: null }), TODAY);
    expect(d.venda.permitida).toBe(true);
    expect(d.nao_verificado.join(" ")).toMatch(/Prazo final/);
  });
  it("prazo marcado como ausente vira elemento obrigatório ausente", () => {
    const d = diagnose(base({ prazo_final: null, ausentes: ["prazo"] }), TODAY);
    const f = d.achados.find((a) => a.rule_id === "R_ELEMENTO_AUSENTE")!;
    expect(f.fundamento_extra[0]!.excerpt).toBe("CTB_ART_281A");
  });
});

describe("elementos obrigatórios", () => {
  it("só gera achado quando o usuário marca 'não consta'", () => {
    expect(ruleIds(diagnose(base({ local_infracao: null }), TODAY))).not.toContain("R_ELEMENTO_AUSENTE");
    const d = diagnose(base({ local_infracao: null, hora_infracao: null, ausentes: ["local", "hora"] }), TODAY);
    const f = d.achados.find((a) => a.rule_id === "R_ELEMENTO_AUSENTE")!;
    expect(f.dados.elementos_ausentes).toBe("o local da infração e a hora da infração");
  });
});

describe("veículo", () => {
  it("placa antiga e Mercosul equivalentes", () => {
    expect(toMercosul("ABC1234")).toBe("ABC1C34");
    expect(samePlate("ABC-1234", "abc1c34")).toBe(true);
    expect(samePlate("ABC1234", "ABC1D34")).toBe(false);
  });
  it("aliases de marca", () => {
    expect(compareVehicle({ placa: "ABC1D23", marca_modelo: "VW/GOL" }, { placa: "ABC1D23", marca_modelo: "VOLKSWAGEN/GOL 1.0" }).marca).toBe("igual");
  });
  it("placa divergente gera achado; igual não", () => {
    expect(ruleIds(diagnose(base({ crlv: { placa: "ABC1D23", marca_modelo: "VW/GOL" } }), TODAY))).not.toContain("R_DIVERGENCIA_VEICULO");
    const d = diagnose(base({ crlv: { placa: "XYZ9Z99", marca_modelo: "VW/GOL" } }), TODAY);
    expect(ruleIds(d)).toContain("R_DIVERGENCIA_VEICULO");
    expect(d.forca.nivel).toBe("forte");
  });
  it("marca divergente gera achado; só modelo diferente gera aviso", () => {
    expect(ruleIds(diagnose(base({ crlv: { placa: "ABC1D23", marca_modelo: "FIAT/UNO" } }), TODAY))).toContain("R_DIVERGENCIA_VEICULO");
    const d = diagnose(base({ crlv: { placa: "ABC1D23", marca_modelo: "VW/POLO" } }), TODAY);
    expect(ruleIds(d)).not.toContain("R_DIVERGENCIA_VEICULO");
    expect(d.avisos.map((a) => a.rule_id)).toContain("R_MODELO_DIFERENTE");
  });
  it("sem CRLV, registra que não verificou", () => {
    expect(diagnose(base(), TODAY).nao_verificado.join(" ")).toMatch(/CRLV/);
  });
});

describe("enquadramento", () => {
  it("interpreta formas comuns de escrever o artigo", () => {
    expect(parseArticle("252, parágrafo único")).toEqual({ artigo: "252", inciso: null, paragrafo: "unico" });
    expect(parseArticle("Art. 252 § Único CTB")).toMatchObject({ artigo: "252", paragrafo: "unico" });
    expect(parseArticle("252, VI")).toMatchObject({ artigo: "252", inciso: "VI" });
    expect(parseArticle("art 167")).toMatchObject({ artigo: "167", inciso: null });
  });
  it("tudo coerente: sem achado", () => {
    const d = diagnose(base(), TODAY);
    expect(ruleIds(d)).not.toContain("R_INCOERENCIA_ENQUADRAMENTO");
    expect(d.nao_encontrado.join(" ")).toMatch(/conferem entre si/);
  });
  it("valor com 20% ou 40% de desconto é aceito", () => {
    expect(checkEnquadramento({ artigo: "252, parágrafo único", descricao: "segurando celular", valor: 234.78, pontos: 7 }).incoerencias).toEqual([]);
    expect(checkEnquadramento({ artigo: "252, parágrafo único", descricao: "segurando celular", valor: 176.08, pontos: 7 }).incoerencias).toEqual([]);
  });
  it("pontos e valor errados geram achado", () => {
    const d = diagnose(base({ pontos: 4, valor: 130.16 }), TODAY);
    const f = d.achados.find((a) => a.rule_id === "R_INCOERENCIA_ENQUADRAMENTO")!;
    expect(f.detalhe).toMatch(/4 pontos/);
    expect(f.detalhe).toMatch(/valor/);
    expect(f.fundamento_extra[0]).toEqual({ excerpt: "CTB_ART_252", seletor: { paragrafo: "unico" } });
  });
  it("cinto descrito com artigo de celular, e o contrário", () => {
    expect(ruleIds(diagnose(base({ descricao_infracao: "Deixar o condutor de usar o cinto de segurança", artigo_infracao: "252, VI", valor: 130.16, pontos: 4 }), TODAY))).toContain("R_INCOERENCIA_ENQUADRAMENTO");
    expect(ruleIds(diagnose(base({ descricao_infracao: "Dirigir utilizando telefone celular", artigo_infracao: "167", valor: 195.23, pontos: 5 }), TODAY))).toContain("R_INCOERENCIA_ENQUADRAMENTO");
  });
  it("segurar o celular enquadrado no inciso VI é incoerente", () => {
    const r = checkEnquadramento({ artigo: "252, VI", descricao: "Dirigir segurando telefone celular", valor: 130.16, pontos: 4 });
    expect(r.incoerencias).toHaveLength(1);
  });
  it("artigo inexistente no CTB gera achado", () => {
    const r = checkEnquadramento({ artigo: "999", descricao: "x", valor: null, pontos: null });
    expect(r.artigoInexistente).toBe(true);
  });
  it("artigo fora do escopo: não verificado", () => {
    const d = diagnose(base({ artigo_infracao: "218, I", descricao_infracao: "Transitar em velocidade superior à máxima", valor: 130.16, pontos: 4 }), TODAY);
    expect(ruleIds(d)).not.toContain("R_INCOERENCIA_ENQUADRAMENTO");
    expect(d.nao_verificado.join(" ")).toMatch(/cinto \(art\. 167\) e celular/);
  });
});

describe("imagem", () => {
  it("celular com objeto não identificável gera achado", () => {
    const d = diagnose(base({ tem_imagem: true, imagem: { objeto_na_mao: "objeto_nao_identificavel", cinto: null, placa_legivel: true, pessoa_em_foco: "condutor" } }), TODAY);
    expect(ruleIds(d)).toContain("R_IMAGEM_INCONCLUSIVA");
    expect(d.forca.nivel).toBe("moderada");
  });
  it("celular identificável e condutor em foco: sem achado", () => {
    const d = diagnose(base({ tem_imagem: true, imagem: { objeto_na_mao: "celular_identificavel", cinto: null, placa_legivel: true, pessoa_em_foco: "condutor" } }), TODAY);
    expect(ruleIds(d)).not.toContain("R_IMAGEM_INCONCLUSIVA");
  });
  it("cinto aparece em uso numa autuação de cinto", () => {
    const d = diagnose(
      base({ descricao_infracao: "Deixar o condutor de usar o cinto de segurança", artigo_infracao: "167", valor: 195.23, pontos: 5, tem_imagem: true, imagem: { objeto_na_mao: null, cinto: "cinto_visivel_em_uso", placa_legivel: true, pessoa_em_foco: "condutor" } }),
      TODAY,
    );
    const f = d.achados.find((a) => a.rule_id === "R_IMAGEM_INCONCLUSIVA")!;
    expect(f.dados.fatos_nao_verificaveis).toMatch(/cinto aparece em uso/);
  });
});

describe("teses acessórias", () => {
  it("agente não identificado só quando há registro por equipamento", () => {
    expect(ruleIds(diagnose(base({ ausentes: ["agente"] }), TODAY))).not.toContain("R_AGENTE_NAO_IDENTIFICADO");
    const d = diagnose(base({ ausentes: ["agente"], equipamento_identificacao: "CAM-01", agente_identificacao: null }), TODAY);
    expect(ruleIds(d)).toContain("R_AGENTE_NAO_IDENTIFICADO");
    expect(d.forca.nivel).toBe("fraca");
  });
  it("meio não informado e conformidade do sistema automático", () => {
    expect(ruleIds(diagnose(base({ meio_constatacao: "nao_informado", tem_imagem: true }), TODAY))).toContain("R_MEIO_COMPROVACAO_NAO_INFORMADO");
    expect(ruleIds(diagnose(base({ meio_constatacao: "sanmft", sanmft_conformidade_informada: "nao" }), TODAY))).toContain("R_SANMFT_SEM_CONFORMIDADE");
    expect(ruleIds(diagnose(base({ meio_constatacao: "sanmft", sanmft_conformidade_informada: "sim" }), TODAY))).not.toContain("R_SANMFT_SEM_CONFORMIDADE");
  });
});

describe("decadência da notificação da penalidade", () => {
  const np = (over: Partial<Confirmed>) => base({ tipo_documento: "notificacao_penalidade", data_infracao: "2026-01-01", ...over });
  it("181 dias sem defesa prévia: achado; 180: não", () => {
    expect(ruleIds(diagnose(np({ data_expedicao: "2026-07-01", defesa_previa_apresentada: "nao" }), TODAY))).toContain("R_DECADENCIA_NP"); // 181
    expect(ruleIds(diagnose(np({ data_expedicao: "2026-06-30", defesa_previa_apresentada: "nao" }), TODAY))).not.toContain("R_DECADENCIA_NP"); // 180
  });
  it("sem saber se houve defesa, usa 360 dias", () => {
    expect(ruleIds(diagnose(np({ data_expedicao: "2026-07-15" }), TODAY))).not.toContain("R_DECADENCIA_NP");
    expect(ruleIds(diagnose(np({ data_expedicao: "2026-12-28" }), "2026-12-28"))).toContain("R_DECADENCIA_NP"); // 361
  });
});

describe("peça cabível", () => {
  it("NA -> defesa prévia; NP -> JARI; NP com JARI indeferida -> 2ª instância; outro -> bloqueio", () => {
    expect(diagnose(base(), TODAY).peca!.tipo).toBe("defesa_previa");
    expect(diagnose(base({ tipo_documento: "notificacao_penalidade" }), TODAY).peca!.tipo).toBe("recurso_jari");
    expect(diagnose(base({ tipo_documento: "notificacao_penalidade", jari_ja_indeferiu: true }), TODAY).peca!.tipo).toBe("recurso_segunda_instancia");
    const d = diagnose(base({ tipo_documento: "outro" }), TODAY);
    expect(d.peca).toBeNull();
    expect(d.venda.permitida).toBe(false);
  });
  it("tese que não cabe na peça é descartada (decadência da NP não entra na defesa prévia)", () => {
    const d = diagnose(base({ data_expedicao: "2026-10-02" }), TODAY);
    expect(d.teses_elegiveis.map((t) => t.thesis_id)).toEqual(["T01_INTEMPESTIVIDADE_NA"]);
  });
});

describe("sem achados", () => {
  it("diz claramente e exige ciência para comprar", () => {
    const d = diagnose(base(), TODAY);
    expect(d.sem_achados).toBe(true);
    expect(d.venda.permitida).toBe(true);
    expect(d.venda.exige_ciencia_sem_achados).toBe(true);
    expect(d.forca.nivel).toBe("fraca");
    expect(d.forca.explicacao).toMatch(/Não encontramos falha formal/);
  });
  it("sempre avisa sobre o desconto do SNE, com valores", () => {
    const d = diagnose(base({ sne_aderido: "sim" }), TODAY);
    const a = d.avisos.find((x) => x.rule_id === "A_DESCONTO_SNE")!;
    expect(a.titulo).toMatch(/perder o desconto/);
    expect(a.detalhe).toContain("R$ 176,08");
    expect(a.citacoes).toContain("CTB, art. 284, § 1º");
  });
});

describe("força da defesa", () => {
  const t = (id: string, peso: number, acessoria = false): EligibleThesis => ({ thesis_id: id, rule_id: "R", peso, acessoria, titulo: id });
  it("níveis por regra, nunca percentual", () => {
    expect(computeStrength([]).nivel).toBe("fraca");
    expect(computeStrength([t("a", 1, true), t("b", 1, true)]).nivel).toBe("fraca");
    expect(computeStrength([t("a", 1, true), t("b", 1, true)]).pontos).toBe(1);
    expect(computeStrength([t("a", 2)]).nivel).toBe("moderada");
    expect(computeStrength([t("a", 2), t("b", 1, true)]).nivel).toBe("moderada");
    expect(computeStrength([t("a", 2), t("b", 2)]).nivel).toBe("forte");
    expect(computeStrength([t("a", 3)]).nivel).toBe("forte");
    expect(computeStrength([t("a", 3)]).explicacao).not.toMatch(/%/);
  });
  it("respeita peso e status alterados no admin", () => {
    const c = base({ data_expedicao: "2026-10-02" });
    expect(diagnose(c, TODAY, [{ thesis_id: "T01_INTEMPESTIVIDADE_NA", weight: 2 }]).forca.nivel).toBe("moderada");
    expect(diagnose(c, TODAY, [{ thesis_id: "T01_INTEMPESTIVIDADE_NA", status: "suspensa" }]).teses_elegiveis).toEqual([]);
  });
});
