import { describe, expect, it, vi } from "vitest";
import { classificarProduto, aplicarRespostaIA, descricaoVaga } from "@/lib/fiscal/motor";
import { classificarLote } from "@/lib/fiscal/classificar";
import { cacheMemoria } from "@/lib/fiscal/cache";
import { validarNcm, existeClassTrib } from "@/lib/fiscal/tabelas";
import type { ClienteIA } from "@/lib/fiscal/ia";
import type { ProdutoEntrada, RespostaIA, Segmento } from "@/lib/fiscal/tipos";

let seq = 0;
function prod(descricao: string, ncm: string): ProdutoEntrada {
  seq++;
  return { id: `p${seq}`, codigo: String(seq), descricao, ncm };
}
function cls(descricao: string, ncm: string, seg: Segmento = "mercado") {
  return classificarProduto(prod(descricao, ncm), seg);
}

describe("validação de NCM", () => {
  it("aceita NCM vigente de 8 dígitos, com ou sem pontos", () => {
    expect(validarNcm("1006.30.21").ok).toBe(true);
    expect(validarNcm("10063021").ok).toBe(true);
  });
  it("recusa NCM inexistente, curto ou vazio", () => {
    expect(validarNcm("12345678")).toMatchObject({ ok: false });
    expect(validarNcm("100630")).toMatchObject({ ok: false });
    expect(validarNcm("")).toMatchObject({ ok: false });
  });
});

describe("motor determinístico: casos do briefing", () => {
  it("arroz: Anexo I, alíquota zero (200003)", () => {
    const { sugestao, pendencia } = cls("ARROZ TIPO 1 TIO JOAO 5KG", "10063021");
    expect(sugestao).toMatchObject({ tratamento: "zero", cst: "200", cClassTrib: "200003", confianca: "alta", status: "sugerido", origem: "regra" });
    expect(sugestao.fonte).toContain("Anexo I");
    expect(pendencia).toBeUndefined();
  });

  it("feijão: Anexo I, alíquota zero", () => {
    const { sugestao } = cls("FEIJAO CARIOCA KICALDO 1KG", "07133319");
    expect(sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200003" });
  });

  it("leite UHT: Anexo I, alíquota zero", () => {
    const { sugestao } = cls("LEITE UHT INTEGRAL ITALAC 1L", "04012010");
    expect(sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200003" });
  });

  it("café: Anexo I, alíquota zero", () => {
    const { sugestao } = cls("CAFE TORRADO MOIDO PILAO 500G", "09012100");
    expect(sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200003" });
  });

  it("carne bovina: Anexo I, alíquota zero; foie gras é exceção", () => {
    expect(cls("PICANHA BOVINA KG", "02013000").sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200003" });
  });

  it("dipirona: medicamento, redução 60% (200032) com alerta do Anexo XIV", () => {
    const { sugestao } = cls("DIPIRONA SODICA 500MG 10 COMPRIMIDOS", "30049099", "farmacia");
    expect(sugestao).toMatchObject({ tratamento: "reducao60", cClassTrib: "200032", confianca: "media" });
    expect(sugestao.alertas.join(" ")).toContain("Anexo XIV");
  });

  it("ração para cães: integral (animais domésticos são excluídos)", () => {
    expect(cls("RACAO GOLDEN CAES ADULTO 15KG", "23091000", "petshop").sugestao).toMatchObject({ tratamento: "integral", cClassTrib: "000001" });
    expect(cls("RACAO PREMIER GATOS 1KG", "23099010", "petshop").sugestao).toMatchObject({ tratamento: "integral" });
  });

  it("ração para bovinos: Anexo IX, redução 60% (200038)", () => {
    const { sugestao } = cls("RACAO BOVINOS ENGORDA 40KG", "23099010", "agropecuaria");
    expect(sugestao).toMatchObject({ tratamento: "reducao60", cClassTrib: "200038", confianca: "alta" });
  });

  it("ração sem destino claro: pendência para a IA e sugestão conservadora", () => {
    const { sugestao, pendencia } = cls("RACAO 25KG", "23099090", "agropecuaria");
    expect(sugestao).toMatchObject({ tratamento: "integral", status: "revisar" });
    expect(pendencia).toMatchObject({ tipo: "condicao", seSim: "200038" });
  });

  it("sabonete: Anexo VIII, redução 60% (200035)", () => {
    expect(cls("SABONETE LUX 85G", "34011190").sugestao).toMatchObject({ tratamento: "reducao60", cClassTrib: "200035" });
  });

  it("refrigerante: integral, com alerta de Imposto Seletivo", () => {
    const { sugestao } = cls("REFRIGERANTE COCA COLA 2L", "22021000");
    expect(sugestao).toMatchObject({ tratamento: "integral", cst: "000", cClassTrib: "000001", confianca: "alta" });
    expect(sugestao.alertas.join(" ")).toContain("Imposto Seletivo");
  });

  it("eletrônico: smartphone comum é integral (o anexo V é só para pessoa com deficiência)", () => {
    expect(cls("SMARTPHONE SAMSUNG GALAXY A15 128GB", "85171300", "outro").sugestao).toMatchObject({ tratamento: "integral", cClassTrib: "000001" });
    expect(cls("NOTEBOOK LENOVO IDEAPAD 15", "84713012", "outro").sugestao).toMatchObject({ tratamento: "integral", confianca: "alta" });
  });

  it("NCM inexistente: status NCM inválido e pedido de NCM para a IA", () => {
    const { sugestao, pendencia } = cls("BISCOITO RECHEADO CHOCOLATE 140G", "12345678");
    expect(sugestao.status).toBe("ncm_invalido");
    expect(sugestao.cClassTrib).toBe("");
    expect(pendencia?.tipo).toBe("sugerir_ncm");
  });

  it("descrição vaga: revisar, confiança baixa, pendência de descrição vaga", () => {
    expect(descricaoVaga("DIVERSOS")).toBe(true);
    expect(descricaoVaga("PRODUTO 01")).toBe(true);
    expect(descricaoVaga("ARROZ 5KG")).toBe(false);
    const { sugestao, pendencia } = cls("DIVERSOS", "22029900");
    expect(sugestao).toMatchObject({ status: "revisar", confianca: "baixa" });
    expect(pendencia?.tipo).toBe("descricao_vaga");
  });
});

describe("motor determinístico: condições e exceções", () => {
  it("massa alimentícia 1902.1 é Anexo I; pão francês é Anexo I; biscoito no mesmo NCM pede confirmação", () => {
    expect(cls("MACARRAO ESPAGUETE 500G", "19021900").sugestao.tratamento).toBe("zero");
    expect(cls("PAO FRANCES KG", "19059090").sugestao.tratamento).toBe("zero");
    const b = cls("BISCOITO RECHEADO 140G", "19059090");
    expect(b.sugestao).toMatchObject({ tratamento: "integral", status: "revisar" });
    expect(b.pendencia?.seSim).toBe("200003");
  });
  it("suco com açúcar não entra no Anexo VII", () => {
    expect(cls("SUCO NECTAR UVA 1L", "20096900").sugestao.tratamento).toBe("integral");
  });
  it("hortifrúti e ovos: Anexo XV, alíquota zero", () => {
    expect(cls("BANANA PRATA KG", "08039000").sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200014" });
    expect(cls("OVOS BRANCOS DUZIA", "04072100").sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200014" });
  });
  it("absorvente zero; fralda 60% no mesmo NCM", () => {
    expect(cls("ABSORVENTE ALWAYS NOTURNO", "96190000").sugestao).toMatchObject({ tratamento: "zero", cClassTrib: "200013" });
    expect(cls("FRALDA PAMPERS M 30UN", "96190000").sugestao).toMatchObject({ tratamento: "reducao60", cClassTrib: "200035" });
  });
  it("inseticida doméstico fica fora do Anexo IX; defensivo agrícola entra", () => {
    expect(cls("INSETICIDA RAID AEROSSOL 300ML", "38089199").sugestao.tratamento).toBe("integral");
    expect(cls("HERBICIDA GLIFOSATO 20L", "38089329", "agropecuaria").sugestao).toMatchObject({ tratamento: "reducao60", cClassTrib: "200038" });
  });
  it("ração no mercado com marca pet conhecida", () => {
    expect(cls("WHISKAS SACHE CARNE 85G", "23091000").sugestao.tratamento).toBe("integral");
  });
  it("todo código sugerido existe na tabela oficial", () => {
    for (const [d, n] of [["ARROZ", "10063021"], ["SABONETE", "34011190"], ["DIPIRONA", "30049099"], ["GLP 13KG", "27111910"]] as const) {
      expect(existeClassTrib(cls(d, n).sugestao.cClassTrib)).toBe(true);
    }
  });
});

describe("IA: nada decidido só pela IA é aprovado sozinho", () => {
  const resp = (x: Partial<RespostaIA>): RespostaIA => ({ id: "x", confianca: "alta", justificativa: "teste", ncm: null, atende: null, ...x });

  it("NCM sugerido pela IA: reclassifica, mantém status NCM inválido e origem ia", () => {
    const p = prod("ARROZ BRANCO TIPO 1 5KG", "1006");
    const r = classificarProduto(p, "mercado");
    const s = aplicarRespostaIA(p, "mercado", r, resp({ ncm: "10063021" }));
    expect(s).toMatchObject({ status: "ncm_invalido", origem: "ia", ncmSugerido: "10063021", cClassTrib: "200003" });
    expect(s.confianca).not.toBe("alta");
  });

  it("condição confirmada pela IA: aplica o benefício, mas fica em revisar", () => {
    const p = prod("RACAO 25KG", "23099090");
    const r = classificarProduto(p, "agropecuaria");
    const s = aplicarRespostaIA(p, "agropecuaria", r, resp({ atende: true }));
    expect(s).toMatchObject({ cClassTrib: "200038", status: "revisar", origem: "ia", confianca: "media" });
  });

  it("IA sugere NCM inexistente: continua inválido com alerta", () => {
    const p = prod("COISA ESTRANHA", "");
    const r = classificarProduto(p, "mercado");
    const s = aplicarRespostaIA(p, "mercado", r, resp({ ncm: "99999999" }));
    expect(s.status).toBe("ncm_invalido");
    expect(s.alertas.join(" ")).toContain("não existe");
  });

  it("lote: usa cache, não derruba o lote quando a IA falha e nunca aprova", async () => {
    const responder = vi.fn(async (perguntas: { id: string }[]) => new Map(perguntas.map((q) => [q.id, resp({ id: q.id, atende: false, confianca: "media" })])));
    const ia: ClienteIA = { modelo: "teste", responder };
    const cache = cacheMemoria();
    const itens = [prod("RACAO 25KG", "23099090"), prod("RACAO 25KG", "23099090"), prod("ARROZ 5KG", "10063021")];
    const a = await classificarLote(itens, "agropecuaria", { ia, cache });
    expect(responder).toHaveBeenCalledTimes(1);
    expect(a.estatisticas).toMatchObject({ itens: 3, pendenciasIA: 2, respostasIA: 1 });
    expect(a.resultados.every((x) => x.sugestao.status !== "aprovado")).toBe(true);
    const b = await classificarLote(itens, "agropecuaria", { ia, cache });
    expect(responder).toHaveBeenCalledTimes(1);
    expect(b.estatisticas.respostasCache).toBe(1);

    const falha: ClienteIA = { modelo: "falha", responder: async () => new Map() };
    const c = await classificarLote(itens, "agropecuaria", { ia: falha, cache: cacheMemoria() });
    expect(c.resultados[0].sugestao.status).toBe("revisar");
    expect(c.resultados[2].sugestao.cClassTrib).toBe("200003");
  });
});
