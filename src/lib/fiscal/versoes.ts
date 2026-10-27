import versoes from "../../../data/fontes/versoes.json";

/** Versões das tabelas oficiais embutidas (arquivo pequeno, seguro para qualquer página). */
export const VERSOES = {
  ncm: `${versoes.ncm.versao} (${versoes.ncm.ato})`,
  cclasstrib: `Tabela cClassTrib/CST publicada em ${versoes.cclasstrib.publicacaoMaisRecente} (IT 2025.002)`,
};
