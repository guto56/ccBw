/**
 * Motor de classificação IBS/CBS por regras determinísticas.
 *
 * Ordem do pipeline (seção 2 do briefing):
 *  (a) valida o NCM na tabela vigente do Siscomex;
 *  (b) cruza o NCM com os anexos da LC 214/2025 (tabela oficial cClassTrib x NCM) e
 *      confronta condições/exceções textuais com a descrição do produto;
 *  (c) sem enquadramento: tributação integral (000001);
 *  (d) o que depende de interpretação vira uma pendência para a IA;
 *  (e) nada decidido pela IA é aprovado automaticamente (ver aplicarRespostaIA).
 *
 * Todo código fiscal sai de src/data/*.json, gerado por `npm run atualizar-tabelas`.
 */
import { ANEXOS, CCLASSTRIB, classTrib, type ClassTrib, type EntradaAnexo, NCM, validarNcm } from "./tabelas";
import { formatarNcm, normalizar, radicais, temAlgum } from "./texto";
import type {
  Confianca,
  PendenciaIA,
  ProdutoEntrada,
  RespostaIA,
  ResultadoMotor,
  Segmento,
  Sugestao,
  Tratamento,
} from "./tipos";

/* ------------------------------------------------------------------ */
/* Escopo: cClassTrib aplicáveis à venda de mercadorias no varejo      */
/* ------------------------------------------------------------------ */

/**
 * Códigos da tabela oficial que dependem só do produto (NCM + descrição).
 * Ficam de fora os que dependem do comprador (administração pública: 200005, 200008,
 * 200010, 200011), de regime especial (diferimento 515001) ou de serviços.
 * O valor é a ordem de benefício: maior primeiro.
 */
const ESCOPO_ANEXOS: Record<string, number> = {
  "200003": 100, // Anexo I, cesta básica, alíquota zero
  "200014": 100, // Anexo XV, hortícolas, frutas e ovos, alíquota zero
  "200013": 100, // absorventes e coletores, alíquota zero (art. 147)
  "200004": 100, // Anexo XII, dispositivos médicos, alíquota zero
  "200007": 100, // Anexo XIII, acessibilidade, alíquota zero
  "200034": 60, // Anexo VII, alimentos, redução 60%
  "200035": 60, // Anexo VIII, higiene e limpeza, redução 60%
  "200038": 60, // Anexo IX, insumos agropecuários, redução 60%
  "200030": 60, // Anexo IV, dispositivos médicos, redução 60%
  "200031": 60, // Anexo V, acessibilidade, redução 60%
  "200033": 60, // Anexo VI, nutrição enteral/erros inatos, redução 60%
};

export const CODIGO_INTEGRAL = "000001";
export const CODIGO_MEDICAMENTO_60 = "200032";
export const CODIGO_MEDICAMENTO_ZERO = "200009";
export const CODIGO_MONOFASICO_COBRADO = "620006";
export const CODIGO_LIVROS = "410008";

/* ------------------------------------------------------------------ */
/* Léxicos usados para confrontar condições com a descrição            */
/* ------------------------------------------------------------------ */

const PET = [
  "cao", "caes", "cachorro*", "canin*", "dog", "dogs", "gato", "gatos", "gatinho*", "felin*", "cat", "cats", "pet", "pets",
  "filhote*", "passaro*", "calopsita", "periquito", "hamster", "roedor*", "aquario*", "ornamenta*", "pedigree", "whiskas",
  "golden", "premier", "royal", "friskies", "dog chow", "cat chow", "special dog", "special cat", "magnus", "gran plus",
  "origens", "kitekat", "felix", "guabi natural", "nutrilus", "max cat", "max dog", "bifinho*", "petisco*", "sache",
  "areia sanitaria", "coleira*", "antipulga*", "vermifugo pet", "bravecto", "nexgard", "simparic", "frontline",
];

const PRODUCAO = [
  "bovin*", "gado", "boi", "bois", "vaca*", "bezerr*", "novilh*", "suin*", "porco*", "leitao", "leitoes", "aves de corte",
  "frango de corte", "frangos", "poedeira*", "postura", "engorda", "codorna*", "equin*", "cavalo*", "muar*", "ovin*",
  "caprin*", "carneir*", "cabra*", "tilapia", "piscicultura", "aquicultura", "camarao de cultivo", "proteinado*",
  "sal mineral", "mineralizado", "nucleo", "premix", "confinamento", "leiteir*", "corte", "rebanho", "pastagem",
  "aftosa", "brucelose", "ivermectina bovina",
];

const VETERINARIO = ["vet", "veterinari*", "uso veterinario", "uso animal", "animal", "animais", ...PET, ...PRODUCAO];

const NAO_ALIMENTO_HUMANO = [
  "racao", "racoes", "alpiste", "painço", "painco", "uso animal", "p animais", "para animais", "trato animal",
  "semente*", "plantio", "para plantio", "p plantio", "certificada", "isca*",
];

const DOMESTICO_INSETICIDA = [
  "aerossol", "aerosol", "spray", "repelente*", "raid", "sbp", "baygon", "detefon", "mata barata*", "mata mosca*",
  "mata mosquito*", "multi inseticida", "inseticida domestico", "refil eletrico", "pastilha mosquito",
];

const AGRO_DEFENSIVO = ["agricola", "lavoura", "herbicida", "fungicida", "formicida", "acaricida", "nematicida", "glifosato", "pulverizacao", "hectare"];

const VAGAS = new Set([
  "diversos", "diverso", "diversas", "produto", "produtos", "mercadoria", "mercadorias", "item", "itens", "outros", "outro",
  "varios", "geral", "generico", "teste", "sem descricao", "material", "materiais", "kit", "avulso",
]);

/** Itens de anexo cujo texto é mais estreito que o NCM: palavras que precisam aparecer na descrição. */
/**
 * semSinal: o que vale quando a descrição não traz nenhum termo. "nao_atende" para itens tão
 * específicos que um produto comum do mesmo NCM quase nunca se enquadra (evita perguntar à IA
 * sobre todo 2106.90.90); "incerto" quando vale a pena perguntar.
 */
const ITENS_CURADOS: { padrao: RegExp; termos: string[]; semSinal?: "nao_atende" | "incerto" }[] = [
  { padrao: /^pao comumente/, termos: ["pao frances", "frances", "cacetinho", "carioquinha", "pao de sal", "pao sal", "pao careca"] },
  { padrao: /^formulas infantis/, termos: ["formula infantil", "formulas infantis", "infantil", "nan", "aptamil", "milnutri", "nestogeno", "enfamil", "pregomin", "neocate"], semSinal: "nao_atende" },
  {
    padrao: /dietoterap|erros inatos|isenta de|isenta demetionina|cetogenica|baixo teor de proteina|hiperlipidica|trioleato|enteral|parenteral/,
    termos: ["enteral", "parenteral", "fenilalanina", "pku", "metabolismo", "cetogenica", "isenta", "aminoacido*", "erros inatos", "trieste", "dieta enteral"],
    semSinal: "nao_atende",
  },
  {
    padrao: /deficiencia|deficientes|cadeira de rodas|surdos|acessibilidade/,
    termos: ["pcd", "deficiencia", "deficiente*", "cadeira de rodas", "bengala*", "aparelho auditivo", "auditivo", "braille", "andador*", "muleta*", "protese*", "adaptad*", "surdo*", "cego*", "baixa visao", "lupa eletronica"],
    semSinal: "nao_atende",
  },
  { padrao: /^bioestimulantes/, termos: ["bioinsumo*", "bioestimulante*", "biologico", "trichoderma", "bacillus", "inoculante*"], semSinal: "nao_atende" },
  { padrao: /^leite fermentado/, termos: ["leite", "lacte*", "iogurte*", "iogur*", "fermentado", "yakult", "danone", "danoninho", "bebida lactea", "composto lacteo"] },
  { padrao: /^fraldas/, termos: ["fralda*", "geriatric*", "roupa intima descartavel"], semSinal: "nao_atende" },
  { padrao: /^absorventes/, termos: ["absorvente*", "calcinha absorvente"], semSinal: "nao_atende" },
  { padrao: /^tampoes/, termos: ["tampao", "tampoes", "o b", "ob"], semSinal: "nao_atende" },
  { padrao: /^coletores menstruais/, termos: ["coletor*"], semSinal: "nao_atende" },
  { padrao: /^semente genetica/, termos: ["semente*", "plantio", "certificada"] },
  { padrao: /^sementes e cereais/, termos: ["racao", "p racao", "para racao", "trato", "uso animal", "alimentacao animal", "gado", "aves", "suinos"] },
  {
    padrao: /^carnes/,
    termos: [
      "carne*", "bov*", "suin*", "ovin*", "caprin*", "frango*", "galinha*", "peru", "chester", "picanha", "alcatra", "acem",
      "patinho", "costela*", "fraldinha", "maminha", "cupim", "musculo", "coxao", "file", "fil", "contrafile", "contra file",
      "lagarto", "paleta", "pernil", "lombo", "bisteca*", "toucinho", "coxa*", "sobrecoxa*", "asa*", "peito", "moida", "moido",
      "charque", "carne seca", "jerked", "figado", "bucho", "mocoto", "rabada", "cordeiro", "carre", "file mignon", "miudo*",
      "coracao", "moela*", "pescoco", "dorso", "pe de porco", "orelha", "costelinha",
    ],
  },
  { padrao: /^queijo/, termos: ["queijo*", "mussarela", "mucarela", "mozarela", "muzzarela", "minas", "prato", "coalho", "ricota", "requeijao", "provolone", "parmesao", "reino"] },
  {
    padrao: /^massas alimenticias/,
    termos: [
      "macarrao", "espaguete", "spaghetti", "penne", "parafuso", "talharim", "lasanha", "massa*", "aletria", "conchinha",
      "fusilli", "nhoque", "gravata", "padre nosso", "ave maria", "cabelo de anjo", "miojo", "lamen", "instantaneo", "cappelletti", "ravioli",
    ],
  },
  { padrao: /^peixes/, termos: ["peixe*", "tilapia", "sardinha*", "merluza", "pescada", "corvina", "cacao", "pintado", "tambaqui", "file de", "bacalhau", "salmao", "atum", "tainha", "pescadinha"] },
];

/* ------------------------------------------------------------------ */
/* Apoio                                                               */
/* ------------------------------------------------------------------ */

const ROMANO = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"];

const ORDEM_CONFIANCA: Record<Confianca, number> = { alta: 3, media: 2, baixa: 1 };

export function menorConfianca(a: Confianca, b: Confianca): Confianca {
  return ORDEM_CONFIANCA[a] <= ORDEM_CONFIANCA[b] ? a : b;
}

export function tratamentoDe(ct: ClassTrib): Tratamento {
  if (ct.cst === "000") return "integral";
  if (ct.cst === "200" && ct.pRedIBS === 100 && ct.pRedCBS === 100) return "zero";
  if (ct.cst === "200" && ct.pRedIBS === 60 && ct.pRedCBS === 60) return "reducao60";
  return "outro";
}

function artigo(ct: ClassTrib): string | null {
  const m = ct.url?.match(/#art(\d+)/i);
  return m ? `art. ${m[1]}` : null;
}

function nomeAnexo(n: number | null): string | null {
  return n && n > 0 && n < ROMANO.length ? `Anexo ${ROMANO[n]}` : null;
}

function fonteDe(ct: ClassTrib, item?: string | null): string {
  const partes = ["LC 214/2025"];
  const an = nomeAnexo(ct.anexo);
  if (an) partes.push(an);
  const art = artigo(ct);
  if (art) partes.push(art);
  let s = `${partes.join(", ")} · tabela cClassTrib ${ct.cClassTrib} (CST ${ct.cst}, publicação ${CCLASSTRIB.publicacaoMaisRecente})`;
  if (item) s += ` · item: "${resumir(item, 140)}"`;
  return s;
}

function resumir(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

const ROTULO_BENEFICIO: Record<Tratamento, string> = {
  zero: "alíquota zero de IBS e CBS",
  reducao60: "redução de 60% das alíquotas de IBS e CBS",
  integral: "tributação integral",
  outro: "tratamento específico",
};

export function descricaoVaga(descricao: string): boolean {
  const n = normalizar(descricao);
  if (!n) return true;
  const palavras = n.split(" ").filter((p) => p.length > 1 && !/^\d+$/.test(p));
  if (palavras.length === 0) return true;
  if (palavras.every((p) => VAGAS.has(p) || p.length <= 2)) return true;
  if (VAGAS.has(n)) return true;
  // "PRODUTO 123", "ITEM 04", "DIVERSOS 1"
  if (palavras.length <= 2 && VAGAS.has(palavras[0])) return true;
  return n.replace(/\s/g, "").length < 4;
}

function sugestaoBase(ct: ClassTrib, parcial: Partial<Sugestao> & Pick<Sugestao, "justificativa" | "confianca">): Sugestao {
  return {
    tratamento: tratamentoDe(ct),
    cst: ct.cst,
    cClassTrib: ct.cClassTrib,
    pRedIBS: ct.pRedIBS,
    pRedCBS: ct.pRedCBS,
    fonte: fonteDe(ct),
    fonteUrl: ct.url,
    status: "sugerido",
    origem: "regra",
    alertas: [],
    ...parcial,
  };
}

/* ------------------------------------------------------------------ */
/* (b) Avaliação de cada entrada de anexo contra a descrição           */
/* ------------------------------------------------------------------ */

type Veredito = { r: "atende" | "nao_atende" | "incerto"; confianca: Confianca; motivo: string; pergunta?: string };

interface Contexto {
  desc: string; // normalizada
  rads: Set<string>;
  ncm: string;
  ncmDescricao: string;
  /** Descrições da hierarquia do NCM (capítulo até item), concatenadas. */
  ncmCaminho: string;
  segmento: Segmento;
}

function primeiraClausula(item: string): string {
  const n = normalizar(item);
  const corte = n.search(
    / (classificad|da ncm|dos codigos|das subposicoes|do codigo|dos seguintes|em conformidade|comumente|mesmo|todos destinad|exceto|inclusive)/,
  );
  const clausula = corte > 0 ? n.slice(0, corte) : n;
  // Só o primeiro termo da enumeração ("Calcário, casca de coco, ..." -> "calcário").
  return normalizar(item.split(/[,;(]/)[0]).length < clausula.length ? normalizar(item.split(/[,;(]/)[0]) : clausula;
}

function ncmCitado(item: string, ncm: string): boolean {
  const t = item.replace(/\s/g, "");
  const formatos = [
    formatarNcm(ncm),
    `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}`,
    `${ncm.slice(0, 4)}.${ncm.slice(4, 5)}`,
    `${ncm.slice(0, 2)}.${ncm.slice(2, 4)}`,
    ncm,
  ];
  return formatos.some((f) => t.includes(f));
}

function avaliarAnimais(ctx: Contexto, exigeVeterinario: boolean): Veredito {
  const pet = temAlgum(ctx.desc, PET);
  const prod = temAlgum(ctx.desc, PRODUCAO);
  if (exigeVeterinario && !pet && !prod && !temAlgum(ctx.desc, VETERINARIO)) {
    return { r: "nao_atende", confianca: "alta", motivo: "o item é de uso veterinário e a descrição não indica uso animal" };
  }
  if (pet && !prod) return { r: "nao_atende", confianca: "alta", motivo: `a descrição indica animal doméstico ("${pet}"), que a lei exclui` };
  if (prod && !pet) return { r: "atende", confianca: "alta", motivo: `a descrição indica animal de produção ("${prod}")` };
  return {
    r: "incerto",
    confianca: ctx.segmento === "agropecuaria" || ctx.segmento === "petshop" ? "media" : "baixa",
    motivo: "a lei exclui produtos para animais domésticos e a descrição não deixa claro o destino",
    pergunta: "O produto é destinado a animais de produção (gado, aves, suínos, peixes de cultivo), e não a animais domésticos/pets?",
  };
}

function avaliarEntrada(e: EntradaAnexo, ctx: Contexto): Veredito {
  const item = e.item ?? "";
  const itemN = normalizar(item);
  const exc = normalizar(e.exc ?? "");
  const cond = normalizar(e.cond ?? "");
  const ehAlimento = e.c === "200003" || e.c === "200014" || e.c === "200034";

  if (ehAlimento) {
    const sinal = temAlgum(ctx.desc, NAO_ALIMENTO_HUMANO);
    if (sinal) return { r: "nao_atende", confianca: "alta", motivo: `a condição é ser alimento humano e a descrição indica outro destino ("${sinal}")` };
    if (/foie/.test(exc) && /foie/.test(ctx.desc)) return { r: "nao_atende", confianca: "alta", motivo: "foie gras é exceção expressa do anexo" };
    if (/lagost/.test(exc) && /lagost/.test(ctx.desc)) return { r: "nao_atende", confianca: "alta", motivo: "lagosta e lagostim são exceção expressa do anexo" };
    if (/casca rija/.test(exc) && /^080[12]/.test(ctx.ncm)) {
      const regional = temAlgum(ctx.desc, ["castanha do para", "castanha do brasil", "castanha de caju", "caju", "baru", "pequi", "sapucaia", "coco", "cocos"]);
      if (regional) return { r: "atende", confianca: "alta", motivo: `fruta de casca rija regional ("${regional}")` };
      const importada = temAlgum(ctx.desc, ["pistache", "amendoa*", "macadamia", "avela*", "noz", "nozes", "peca", "pecan"]);
      if (importada) return { r: "nao_atende", confianca: "alta", motivo: `fruta de casca rija não regional ("${importada}") é exceção do anexo` };
      return {
        r: "incerto",
        confianca: "baixa",
        motivo: "frutas de casca rija não regionais são exceção",
        pergunta: "Esta fruta de casca rija é regional brasileira (ex.: castanha-do-brasil, castanha de caju, baru, pequi), e não importada/não regional (ex.: pistache, amêndoa, macadâmia, avelã, noz europeia)?",
      };
    }
  }

  const animais = /animais domesticos|uso veterinario/.test(`${exc} ${itemN} ${cond}`);
  if (animais) {
    const v = avaliarAnimais(ctx, /veterinari|vacinas|medicamentos/.test(itemN) || ctx.ncm.startsWith("30"));
    if (v.r !== "atende" || !/^sementes e cereais/.test(itemN)) return v;
  }

  if (/^inseticidas/.test(itemN)) {
    const dom = temAlgum(ctx.desc, DOMESTICO_INSETICIDA);
    if (dom) return { r: "nao_atende", confianca: "alta", motivo: `produto de uso doméstico ("${dom}"), não insumo agropecuário` };
    const agro = temAlgum(ctx.desc, AGRO_DEFENSIVO);
    if (agro || ctx.segmento === "agropecuaria") return { r: "atende", confianca: agro ? "alta" : "media", motivo: "defensivo de uso agropecuário" };
    return {
      r: "incerto",
      confianca: "baixa",
      motivo: "o anexo cobre defensivos agropecuários, não inseticidas domésticos",
      pergunta: "O produto é um defensivo de uso agropecuário registrado no MAPA (e não um inseticida de uso doméstico)?",
    };
  }

  // Itens estreitos: termos curados.
  const curado = ITENS_CURADOS.find((c) => c.padrao.test(itemN) || (c.semSinal === "nao_atende" && c.padrao.test(cond)));
  if (curado) {
    const achou = temAlgum(ctx.desc, curado.termos);
    if (achou) return { r: "atende", confianca: "alta", motivo: `a descrição corresponde ao item do anexo ("${achou}")` };
    if (curado.semSinal === "nao_atende") {
      return { r: "nao_atende", confianca: "media", motivo: `o item do anexo ("${resumir(item, 70)}") é mais restrito que o NCM e a descrição não o indica` };
    }
    return {
      r: "incerto",
      confianca: "baixa",
      motivo: "o NCM está no anexo, mas o item do anexo é mais restrito que o NCM",
      pergunta: `O produto corresponde a este item da LC 214/2025: "${resumir(item, 220)}"?`,
    };
  }

  // Condição "sem adição de açúcar/edulcorantes" (sucos, polpas, conservas vegetais).
  if (/sem adicao de acucar/.test(itemN) && e.c !== "200014") {
    const adocado = temAlgum(ctx.desc, ["nectar", "refresco", "adocado*", "com acucar", "xarope", "calda", "cristalizad*", "em calda", "tang", "del valle", "ades"]);
    if (adocado) return { r: "nao_atende", confianca: "alta", motivo: `a condição é não ter açúcar adicionado e a descrição indica o contrário ("${adocado}")` };
    const puro = temAlgum(ctx.desc, ["sem acucar", "zero acucar", "integral", "100", "natural", "sem adicao", "in natura", "congelad*"]);
    if (!puro) {
      return {
        r: "incerto",
        confianca: "baixa",
        motivo: "o anexo exige produto sem adição de açúcar ou edulcorantes",
        pergunta: `O produto é sem adição de açúcar ou outros edulcorantes (e sem conservantes, se for suco ou polpa)? Item da lei: "${resumir(item, 180)}"`,
      };
    }
  }

  // Genérico: palavra principal do item na descrição.
  const cabeca = radicais(primeiraClausula(item));
  for (const r of cabeca) {
    if (ctx.rads.has(r)) return { r: "atende", confianca: "alta", motivo: "a descrição corresponde ao item do anexo" };
  }
  const citado = ncmCitado(item, ctx.ncm) || /capitulo \d/.test(itemN);
  const casaComNcm = [...radicais(ctx.ncmCaminho)].some((r) => ctx.rads.has(r));
  if (citado && casaComNcm) {
    return { r: "atende", confianca: "alta", motivo: "o NCM está citado no anexo e a descrição corresponde à do NCM" };
  }
  const ncmGenerico = /^outr/i.test(ctx.ncmDescricao);
  if ((citado && !ncmGenerico) || (casaComNcm && !ncmGenerico)) {
    return { r: "atende", confianca: "media", motivo: "o NCM está no anexo, mas a descrição não repete o nome do item" };
  }
  return {
    r: "incerto",
    confianca: "baixa",
    motivo: "o NCM está no anexo, mas a descrição não confirma o item",
    pergunta: `O produto corresponde a este item da LC 214/2025: "${resumir(item, 220)}"?`,
  };
}

/* ------------------------------------------------------------------ */
/* Classificação                                                       */
/* ------------------------------------------------------------------ */

interface Candidato {
  ct: ClassTrib;
  beneficio: number;
  v: Veredito;
  entrada: EntradaAnexo;
}

function candidatosAnexo(ctx: Contexto): Candidato[] {
  const entradas = ANEXOS[ctx.ncm] ?? [];
  const vedados = new Set(entradas.filter((e) => e.perm === 0).map((e) => e.c));
  const porCodigo = new Map<string, Candidato>();
  const ordemR = { atende: 3, incerto: 2, nao_atende: 1 } as const;
  for (const e of entradas) {
    if (e.perm !== 1 || !(e.c in ESCOPO_ANEXOS) || vedados.has(e.c)) continue;
    const v = avaliarEntrada(e, ctx);
    const atual = porCodigo.get(e.c);
    if (
      !atual ||
      ordemR[v.r] > ordemR[atual.v.r] ||
      (v.r === atual.v.r && ORDEM_CONFIANCA[v.confianca] > ORDEM_CONFIANCA[atual.v.confianca])
    ) {
      porCodigo.set(e.c, { ct: classTrib(e.c), beneficio: ESCOPO_ANEXOS[e.c], v, entrada: e });
    }
  }
  return [...porCodigo.values()].sort((a, b) => b.beneficio - a.beneficio);
}

function sugestaoDeCandidato(c: Candidato, ctx: Contexto): Sugestao {
  const an = nomeAnexo(c.ct.anexo);
  const onde = an ? `no ${an} da LC 214/2025` : "na LC 214/2025";
  return sugestaoBase(c.ct, {
    confianca: c.v.confianca,
    justificativa: `NCM ${formatarNcm(ctx.ncm)} listado ${onde} com ${ROTULO_BENEFICIO[tratamentoDe(c.ct)]}; ${c.v.motivo}.`,
    fonte: fonteDe(c.ct, c.entrada.item),
  });
}

function integral(ctx: Contexto, confianca: Confianca, motivo?: string): Sugestao {
  const ct = classTrib(CODIGO_INTEGRAL);
  return sugestaoBase(ct, {
    confianca,
    justificativa:
      motivo ??
      `NCM ${formatarNcm(ctx.ncm)} (${resumir(ctx.ncmDescricao, 60)}) não consta dos anexos de redução da LC 214/2025; tributação integral.`,
    fonte: `LC 214/2025, art. 4º · tabela cClassTrib ${ct.cClassTrib} (CST ${ct.cst}, publicação ${CCLASSTRIB.publicacaoMaisRecente})`,
  });
}

const PREFIXOS_COMBUSTIVEL = ["27101259", "27101921", "27101911", "27111910", "27111100", "27112100", "22071010", "22071090", "22072011", "22072019", "38260000"];
const BEBIDAS_SELETIVO = ["220210", "22029", "2203", "2204", "2205", "2206", "2208", "2402", "2403"];

function regrasEspecificas(ctx: Contexto, melhor: Candidato | undefined): Sugestao | null {
  // Medicamentos de uso humano (capítulo 30, posições 30.03 e 30.04): art. 133, redução 60%,
  // salvo os listados no Anexo XIV (art. 146, alíquota zero). O Anexo XIV lista princípios ativos,
  // sem NCM próprio na tabela, por isso a confiança fica média.
  if (/^300[34]/.test(ctx.ncm) && (!melhor || melhor.v.r !== "atende")) {
    if (temAlgum(ctx.desc, ["vet", "veterinari*", "uso veterinario", ...PET])) return null;
    const ct = classTrib(CODIGO_MEDICAMENTO_60);
    return sugestaoBase(ct, {
      confianca: "media",
      justificativa: `Medicamento (NCM ${formatarNcm(ctx.ncm)}) registrado na Anvisa tem redução de 60% (art. 133 da LC 214/2025), salvo se constar do Anexo XIV.`,
      alertas: [
        `Confira se o princípio ativo está no Anexo XIV da LC 214/2025: nesse caso o tratamento é alíquota zero (cClassTrib ${CODIGO_MEDICAMENTO_ZERO}).`,
        "Vale só para medicamento com registro na Anvisa ou manipulado.",
      ],
    });
  }
  if (melhor) return null;
  if (PREFIXOS_COMBUSTIVEL.some((p) => ctx.ncm.startsWith(p))) {
    const ct = classTrib(CODIGO_MONOFASICO_COBRADO);
    return sugestaoBase(ct, {
      confianca: "media",
      justificativa: `Combustível (NCM ${formatarNcm(ctx.ncm)}) sujeito à tributação monofásica; na revenda o IBS/CBS já foi cobrado anteriormente.`,
      status: "revisar",
      alertas: ["Monofásico: confirme se o cliente é revendedor e não o responsável pela retenção."],
    });
  }
  if (/^490[123]/.test(ctx.ncm)) {
    const ct = classTrib(CODIGO_LIVROS);
    return sugestaoBase(ct, {
      confianca: "media",
      justificativa: `Livros, jornais e periódicos (NCM ${formatarNcm(ctx.ncm)}) são imunes ao IBS e à CBS.`,
    });
  }
  return null;
}

function alertasGerais(ctx: Contexto): string[] {
  const out: string[] = [];
  if (BEBIDAS_SELETIVO.some((p) => ctx.ncm.startsWith(p))) {
    out.push("Pode haver incidência do Imposto Seletivo (LC 214/2025, art. 409), que não altera o CST/cClassTrib de IBS/CBS.");
  }
  return out;
}

export interface OpcoesMotor {
  hoje?: string;
}

export function classificarProduto(p: ProdutoEntrada, segmento: Segmento, op: OpcoesMotor = {}): ResultadoMotor {
  const vaga = descricaoVaga(p.descricao);
  const val = validarNcm(p.ncm, op.hoje);

  if (!val.ok) {
    return {
      sugestao: {
        tratamento: "integral",
        cst: "",
        cClassTrib: "",
        pRedIBS: 0,
        pRedCBS: 0,
        confianca: "baixa",
        justificativa: `${val.motivo} Sem NCM válido não há como enquadrar o produto.`,
        fonte: `Tabela NCM ${NCM.versao} (${NCM.ato})`,
        fonteUrl: "https://portalunico.siscomex.gov.br/classif/",
        status: "ncm_invalido",
        origem: "regra",
        alertas: [],
      },
      pendencia: vaga
        ? undefined
        : {
            tipo: "sugerir_ncm",
            pergunta: `Sugira o NCM de 8 dígitos para o produto "${p.descricao}"${val.codigo ? ` (o NCM informado ${val.codigo} é inválido)` : ""}.`,
          },
    };
  }

  const ctx: Contexto = {
    desc: normalizar(p.descricao),
    rads: radicais(p.descricao),
    ncm: val.codigo,
    ncmDescricao: val.caminho.at(-1) ?? val.descricao,
    ncmCaminho: val.caminho.slice(1).join(" "),
    segmento,
  };

  const candidatos = candidatosAnexo(ctx);
  const atendem = candidatos.filter((c) => c.v.r === "atende");
  const melhorAtende = atendem[0];
  const incertoAcima = candidatos.find((c) => c.v.r === "incerto" && (!melhorAtende || c.beneficio > melhorAtende.beneficio));

  let sugestao: Sugestao;
  let pendencia: PendenciaIA | undefined;

  const especifica = regrasEspecificas(ctx, melhorAtende ?? incertoAcima);
  if (especifica) {
    sugestao = especifica;
  } else if (incertoAcima) {
    // Sugestão conservadora (o que vale sem o benefício) até alguém confirmar a condição.
    const anexoIncerto = nomeAnexo(incertoAcima.ct.anexo);
    sugestao = melhorAtende
      ? sugestaoDeCandidato(melhorAtende, ctx)
      : integral(
          ctx,
          "baixa",
          `NCM ${formatarNcm(ctx.ncm)} aparece ${anexoIncerto ? `no ${anexoIncerto}` : "em anexo"} da LC 214/2025 sob condição; até a confirmação vale a tributação integral.`,
        );
    sugestao.status = "revisar";
    sugestao.confianca = menorConfianca(sugestao.confianca, incertoAcima.v.confianca);
    sugestao.alertas.push(
      `Pode ter ${ROTULO_BENEFICIO[tratamentoDe(incertoAcima.ct)]} (cClassTrib ${incertoAcima.ct.cClassTrib}) se: ${resumir(incertoAcima.entrada.item ?? "", 160)}`,
    );
    sugestao.justificativa = `${sugestao.justificativa.replace(/\.$/, "")}; ${incertoAcima.v.motivo}.`;
    pendencia = {
      tipo: "condicao",
      pergunta: `Produto "${p.descricao}" (NCM ${formatarNcm(ctx.ncm)}: ${ctx.ncmDescricao}). ${incertoAcima.v.pergunta ?? ""}`.trim(),
      seSim: incertoAcima.ct.cClassTrib,
    };
  } else if (melhorAtende) {
    sugestao = sugestaoDeCandidato(melhorAtende, ctx);
  } else {
    const excluidos = candidatos.filter((c) => c.v.r === "nao_atende");
    sugestao = excluidos.length
      ? integral(
          ctx,
          excluidos.every((c) => c.v.confianca === "alta") ? "alta" : "media",
          `NCM ${formatarNcm(ctx.ncm)} aparece no anexo, mas ${excluidos[0].v.motivo}; tributação integral.`,
        )
      : integral(ctx, "alta");
  }

  sugestao.alertas.push(...alertasGerais(ctx));

  if (vaga) {
    sugestao.status = "revisar";
    sugestao.confianca = "baixa";
    sugestao.alertas.unshift("Descrição vaga: o enquadramento foi feito só pelo NCM informado.");
    pendencia = {
      tipo: "descricao_vaga",
      pergunta: `A descrição "${p.descricao}" é vaga. O NCM informado é ${formatarNcm(ctx.ncm)} (${ctx.ncmDescricao}). Se for possível inferir o produto, sugira o NCM; se não, responda ncm null.`,
    };
  }

  return { sugestao, pendencia };
}

/* ------------------------------------------------------------------ */
/* (d)/(e) Aplicação da resposta da IA                                  */
/* ------------------------------------------------------------------ */

export function aplicarRespostaIA(
  p: ProdutoEntrada,
  segmento: Segmento,
  r: ResultadoMotor,
  resposta: RespostaIA | null,
  op: OpcoesMotor = {},
): Sugestao {
  const base: Sugestao = { ...r.sugestao, alertas: [...r.sugestao.alertas] };
  if (!r.pendencia) return base;
  if (!resposta) {
    base.alertas.push("A IA não respondeu para este item; revise manualmente.");
    if (base.status === "sugerido") base.status = "revisar";
    return base;
  }

  const confIA = menorConfianca(resposta.confianca, "media");

  if (r.pendencia.tipo === "condicao") {
    let s: Sugestao = base;
    if (resposta.atende === true && r.pendencia.seSim) {
      const ct = classTrib(r.pendencia.seSim);
      s = sugestaoBase(ct, {
        confianca: confIA,
        justificativa: `${ROTULO_BENEFICIO[tratamentoDe(ct)]} conforme a IA: ${resposta.justificativa}`,
        fonte: base.fonte.includes(ct.cClassTrib) ? base.fonte : fonteDe(ct),
        alertas: base.alertas.filter((a) => !a.startsWith("Pode ter")),
      });
    } else {
      s.confianca = menorConfianca(s.confianca, confIA);
      s.alertas.push(`IA: ${resposta.justificativa}`);
    }
    s.origem = "ia";
    s.status = "revisar";
    return s;
  }

  // sugerir_ncm ou descricao_vaga
  const ncm = (resposta.ncm ?? "").replace(/\D/g, "");
  const val = ncm ? validarNcm(ncm, op.hoje) : null;
  if (!val || !val.ok) {
    base.alertas.push(
      ncm ? `A IA sugeriu o NCM ${ncm}, que não existe na tabela vigente.` : `IA: ${resposta.justificativa || "não foi possível sugerir um NCM."}`,
    );
    base.origem = "ia";
    if (base.status === "sugerido") base.status = "revisar";
    return base;
  }
  if (r.pendencia.tipo === "descricao_vaga" && ncm === p.ncm.replace(/\D/g, "")) {
    base.alertas.push(`IA confirma o NCM informado: ${resposta.justificativa}`);
    base.origem = "ia";
    return base;
  }
  const novo = classificarProduto({ ...p, ncm }, segmento, op).sugestao;
  return {
    ...novo,
    status: r.sugestao.status === "ncm_invalido" ? "ncm_invalido" : "revisar",
    origem: "ia",
    ncmSugerido: ncm,
    confianca: menorConfianca(novo.confianca, confIA),
    justificativa: `NCM ${formatarNcm(ncm)} sugerido pela IA (${resposta.justificativa.replace(/\.$/, "")}); ${novo.justificativa.charAt(0).toLowerCase()}${novo.justificativa.slice(1)}`,
    alertas: [...base.alertas.filter((a) => !a.startsWith("Descrição vaga")), ...novo.alertas],
  };
}
