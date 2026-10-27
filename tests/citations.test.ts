import { describe, expect, it } from "vitest";
import { extractCitations, removeInvalidCitations, validateText } from "../src/shared/citations";
import { THESES, PIECES } from "../src/shared/legal";

describe("validador de citações", () => {
  it("aceita citações que existem na base", () => {
    const ok = [
      "Conforme o art. 281, § 1º, II, do CTB, o auto deve ser arquivado.",
      "O art. 4º da Resolução CONTRAN nº 918/2022 fixa o prazo.",
      "O parágrafo único do art. 2º da Resolução CONTRAN nº 909/2022 exige o campo observação.",
      "O art. 3º, § 3º, da Resolução CONTRAN nº 918/2022 trata do referendo.",
      "Nos termos do art. 280, III, do Código de Trânsito Brasileiro.",
      "A Lei nº 9.503, de 23 de setembro de 1997, disciplina o tema.",
      "O art. 3º, I, da Resolução CONTRAN nº 920/2022 trata da conformidade.",
    ];
    for (const s of ok) {
      const v = validateText(s);
      expect(v.invalid, s).toEqual([]);
      expect(v.citations.length, s).toBeGreaterThan(0);
    }
  });

  it("rejeita artigo inexistente, inciso inexistente, norma fora da base e jurisprudência", () => {
    const bad = [
      "Conforme o art. 999 do CTB, a multa é nula.",
      "Nos termos do art. 280, VII, do CTB.",
      "A Resolução CONTRAN nº 619/2016 prevê o contrário.",
      "Aplica-se a Súmula 312 do STJ.",
      "O art. 5º da Constituição Federal garante a ampla defesa.",
      "Segundo o art. 2º da Lei nº 9.784/1999, a Administração obedece à legalidade.",
      "O § 9º do art. 281 do CTB não existe.",
      "Há jurisprudência pacífica no TJSP.",
      "O art. 12 exige notificação.",
    ];
    for (const s of bad) {
      const v = validateText(s);
      expect(v.ok, s).toBe(false);
    }
  });

  it("remove do texto a frase com artigo inventado e mantém o resto", () => {
    const narrativa =
      "O requerente trafegava pela Avenida Exemplo em 10/03/2026. " +
      "Conforme o art. 777-B do CTB, a autuação por câmera exige laudo pericial. " +
      "A notificação foi recebida pelo correio.";
    const r = removeInvalidCitations(narrativa);
    expect(r.text).not.toContain("777-B");
    expect(r.text).toContain("Avenida Exemplo");
    expect(r.text).toContain("recebida pelo correio");
    expect(r.removed).toHaveLength(1);
    expect(r.removed[0]!.citations[0]!.reason).toMatch(/não está na base/);
  });

  it("todas as citações dos textos-modelo das teses e peças existem na base", () => {
    for (const t of THESES) {
      const v = validateText(t.texto_modelo);
      expect(v.invalid.map((c) => `${c.raw}: ${c.reason}`), t.id).toEqual([]);
    }
    for (const [id, p] of Object.entries(PIECES)) {
      const v = validateText(p.destinatario + ". " + p.pedido_final);
      expect(v.invalid.map((c) => `${c.raw}: ${c.reason}`), id).toEqual([]);
    }
  });

  it("identifica listas de artigos e parágrafos", () => {
    const c = extractCitations("na forma dos arts. 285, 286 e 287 do CTB");
    expect(c[0]!.artigos).toEqual(["285", "286", "287"]);
    expect(c[0]!.valid).toBe(true);
    const d = extractCitations("conforme §§ 4º e 5º do art. 282 do CTB");
    expect(d[0]!.paragrafos).toEqual(["4", "5"]);
    expect(d[0]!.valid).toBe(true);
  });
});
