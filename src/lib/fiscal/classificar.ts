import "server-only";
import { chaveCache, type CacheIA } from "./cache";
import type { ClienteIA, PerguntaIA } from "./ia";
import { aplicarRespostaIA, classificarProduto } from "./motor";
import { normalizar } from "./texto";
import type { ProdutoEntrada, RespostaIA, Segmento, Sugestao } from "./tipos";

export interface ResultadoLote {
  resultados: { id: string; sugestao: Sugestao }[];
  estatisticas: {
    itens: number;
    porRegra: number;
    pendenciasIA: number;
    respostasCache: number;
    respostasIA: number;
    semResposta: number;
    modelo: string | null;
  };
}

/**
 * Classifica um lote: regras primeiro; a IA só recebe as pendências (NCM ausente/inválido,
 * condição de anexo que depende da descrição, descrição vaga). Respostas ficam em cache por
 * (tipo + NCM + descrição normalizada + código condicionado).
 */
export async function classificarLote(
  produtos: ProdutoEntrada[],
  segmento: Segmento,
  deps: { ia: ClienteIA | null; cache: CacheIA },
): Promise<ResultadoLote> {
  const iniciais = produtos.map((p) => ({ p, r: classificarProduto(p, segmento) }));
  const pendentes = iniciais.filter((x) => x.r.pendencia);

  const chaves = new Map<string, string>(); // id do produto -> chave
  for (const { p, r } of pendentes) {
    chaves.set(p.id, chaveCache(r.pendencia!.tipo, p.ncm.replace(/\D/g, ""), normalizar(p.descricao), `${segmento}|${r.pendencia!.seSim ?? ""}`));
  }

  const respostas = new Map<string, RespostaIA>(); // por chave
  let doCache = 0;
  let daIA = 0;
  const modelo = deps.ia?.modelo ?? null;

  if (deps.ia && pendentes.length) {
    const unicas = [...new Set(chaves.values())];
    const doBanco = await deps.cache.ler(unicas, deps.ia.modelo);
    for (const [k, v] of doBanco) respostas.set(k, v);
    doCache = doBanco.size;

    // Uma pergunta por chave ainda não respondida.
    const perguntas: PerguntaIA[] = [];
    const vistas = new Set<string>();
    for (const { p, r } of pendentes) {
      const k = chaves.get(p.id)!;
      if (respostas.has(k) || vistas.has(k)) continue;
      vistas.add(k);
      perguntas.push({ id: k.slice(0, 16), tipo: r.pendencia!.tipo, pergunta: r.pendencia!.pergunta, segmento });
    }
    if (perguntas.length) {
      const porIdCurto = new Map([...vistas].map((k) => [k.slice(0, 16), k]));
      const novas = await deps.ia.responder(perguntas);
      const gravar: { chave: string; resposta: RespostaIA }[] = [];
      for (const [idCurto, resp] of novas) {
        const k = porIdCurto.get(idCurto);
        if (!k) continue;
        respostas.set(k, resp);
        gravar.push({ chave: k, resposta: resp });
      }
      daIA = gravar.length;
      await deps.cache.gravar(gravar, deps.ia.modelo);
    }
  }

  let semResposta = 0;
  const resultados = iniciais.map(({ p, r }) => {
    if (!r.pendencia) return { id: p.id, sugestao: r.sugestao };
    const resp = respostas.get(chaves.get(p.id)!) ?? null;
    if (!resp) semResposta++;
    const sugestao = aplicarRespostaIA(p, segmento, r, resp);
    if (!deps.ia) {
      sugestao.alertas = sugestao.alertas.filter((a) => !a.startsWith("A IA não respondeu"));
      sugestao.alertas.push("IA desativada neste ambiente; item marcado para revisão.");
    }
    return { id: p.id, sugestao };
  });

  return {
    resultados,
    estatisticas: {
      itens: produtos.length,
      porRegra: produtos.length - pendentes.length,
      pendenciasIA: pendentes.length,
      respostasCache: doCache,
      respostasIA: daIA,
      semResposta,
      modelo,
    },
  };
}
