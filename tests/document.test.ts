import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildDocument, documentPlainText, fallbackNarrative } from "../src/shared/document";
import { renderPdf } from "../src/shared/pdf";
import { deadlineIcs } from "../src/shared/ics";
import { diagnose } from "../src/shared/rules/engine";
import { THESES } from "../src/shared/legal";
import { ConfirmedSchema, RequesterSchema } from "../src/shared/schemas";
import { validateText } from "../src/shared/citations";

const confirmed = ConfirmedSchema.parse({
  tipo_documento: "notificacao_autuacao",
  orgao_autuador: "DEPARTAMENTO MUNICIPAL DE TRÂNSITO DE EXEMPLO",
  numero_auto: "EX0001234",
  codigo_infracao: "000-00",
  descricao_infracao: "Dirigir veículo utilizando-se de telefone celular",
  artigo_infracao: "252, parágrafo único",
  data_infracao: "2026-08-01",
  hora_infracao: "08:15",
  local_infracao: "Av. Exemplo, 100 — São João",
  placa: "ABC1D23",
  marca_modelo: "VW/GOL",
  data_expedicao: "2026-09-15",
  data_postagem: null,
  prazo_final: "2026-11-20",
  agente_identificacao: null,
  equipamento_identificacao: "CAM-0001",
  valor: 293.47,
  pontos: 4,
  tem_imagem: true,
  ausentes: ["agente", "hora"],
  meio_constatacao: "sanmft",
  sanmft_conformidade_informada: "nao",
  crlv: { placa: "ABC1D24", marca_modelo: "VW/GOL" },
  imagem: { objeto_na_mao: "objeto_nao_identificavel", cinto: null, placa_legivel: false, pessoa_em_foco: "indeterminado" },
});

describe("documento", () => {
  const d = diagnose(confirmed, "2026-10-27");
  const selected = d.teses_elegiveis.map((t) => ({ thesis_id: t.thesis_id, rule_id: t.rule_id, justificativa: "x", selected_by: "regras" as const }));

  it("o caso de teste aciona várias teses", () => {
    expect(d.teses_elegiveis.map((t) => t.thesis_id).sort()).toEqual([
      "T01_INTEMPESTIVIDADE_NA",
      "T02_ELEMENTO_OBRIGATORIO_AUSENTE",
      "T03_IDENTIFICACAO_VEICULO",
      "T04_IMAGEM_NAO_COMPROVA",
      "T05_ERRO_ENQUADRAMENTO",
      "T06_AGENTE_NAO_IDENTIFICADO",
      "T08_CONFORMIDADE_INMETRO_SANMFT",
    ]);
  });

  it("monta a peça com fundamento literal e citações válidas", () => {
    const doc = buildDocument({ confirmed, diagnosis: d, selected, narrative: fallbackNarrative(confirmed, d), requester: RequesterSchema.parse({ nome: "Fulano de Tal" }), testEnvironment: true });
    expect(doc.titulo).toBe("DEFESA PRÉVIA (DEFESA DA AUTUAÇÃO)");
    expect(doc.direito).toHaveLength(selected.length);
    const t01 = doc.direito.find((s) => s.titulo.startsWith("Notificação da autuação"))!;
    expect(t01.paragrafos[0]).toContain("45 dias depois");
    expect(t01.fundamentos[0]!.texto).toContain("II - se, no prazo máximo de trinta dias, não for expedida a notificação da autuação.");
    const plain = documentPlainText(doc);
    expect(plain).toContain("Diante do exposto, requer:");
    const own = [doc.qualificacao, ...doc.fatos, ...doc.direito.flatMap((s) => s.paragrafos), ...doc.pedidos].join("\n");
    expect(validateText(own).invalid).toEqual([]);
  });

  it("texto-modelo de toda tese preenche e valida", () => {
    const sample: Record<string, string> = {
      data_infracao: "01/08/2026", data_expedicao: "15/09/2026", dias_expedicao: "45", elementos_ausentes: "o local da infração",
      veiculo_notificacao: "placa ABC1D23", veiculo_crlv: "placa ABC1D24", fatos_nao_verificaveis: "a placa do veículo",
      descricao_infracao: "x", artigo_infracao: "252", incoerencias: "", prazo_legal_dias: "180", orgao_autuador: "Órgão",
    };
    for (const t of THESES) {
      const filled = t.texto_modelo.replace(/\{(\w+)\}/g, (_, k: string) => sample[k] ?? `<<${k}>>`);
      expect(filled, t.id).not.toMatch(/<<\w+>>/);
      expect(validateText(filled).invalid, t.id).toEqual([]);
    }
  });

  it("gera PDF com fonte embutida e acentos legíveis", async () => {
    const doc = buildDocument({ confirmed, diagnosis: d, selected, narrative: fallbackNarrative(confirmed, d), requester: RequesterSchema.parse({ nome: "José Conceição Araújo", cpf: "000.000.000-00" }), testEnvironment: true });
    const dir = "src/client/public/fonts/pdf/";
    const bytes = await renderPdf(doc, {
      regular: readFileSync(dir + "SourceSerif4-Regular.ttf"),
      semibold: readFileSync(dir + "SourceSerif4-Semibold.ttf"),
      italic: readFileSync(dir + "SourceSerif4-It.ttf"),
    });
    expect(bytes.length).toBeGreaterThan(10_000);
    mkdirSync("fixtures/out", { recursive: true });
    writeFileSync("fixtures/out/teste.pdf", bytes);
    const txt = execFileSync("pdftotext", ["-layout", "fixtures/out/teste.pdf", "-"]).toString();
    expect(txt).toContain("José Conceição Araújo");
    expect(txt).toContain("NOTIFICAÇÃO".toLowerCase().replace("notificação", "notificação"));
    expect(txt).toMatch(/§ 1º/);
    expect(txt).toContain("Antes de protocolar");
  });

  it("gera lembrete .ics", () => {
    const ics = deadlineIcs({ uid: "abc", deadline: "2026-11-20", title: "Prazo da defesa", description: "Protocole até hoje", url: "https://exemplo/c/x", now: new Date("2026-10-27T12:00:00Z") });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("DTEND;VALUE=DATE:20261121");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
