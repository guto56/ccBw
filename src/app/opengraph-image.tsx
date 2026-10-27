import { ImageResponse } from "next/og";

export const alt = "Carimbo: classificação IBS/CBS em lote para escritórios contábeis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento: um trecho de formulário contínuo com os códigos preenchidos. */
export default function Imagem() {
  const linhas = [
    ["ARROZ TIPO 1 5KG", "1006.30.21", "200", "200003", "Alíquota zero"],
    ["OLEO DE SOJA 900ML", "1507.90.11", "200", "200034", "Redução 60%"],
    ["SABONETE 85G", "3401.11.90", "200", "200035", "Redução 60%"],
    ["REFRIGERANTE 2L", "2202.10.00", "000", "000001", "Integral"],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F6F8F5", padding: 64, color: "#1E2733", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="none" stroke="#1E2733" strokeWidth="2" />
            <path d="M9.6 16.6c1.5 1.1 2.7 2.4 3.6 4 .3.5.8.5 1.1 0 1.8-4 4.4-7.3 8.2-9.9" fill="none" stroke="#1F3FB0" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 700 }}>Carimbo</span>
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 36, lineHeight: 1.08, maxWidth: 980 }}>NCM, CST e cClassTrib do IBS/CBS em lote, com a fonte de cada linha.</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, border: "2px solid #8E9A92", borderRadius: 4, background: "#FBFCFA" }}>
          {linhas.map((l, i) => (
            <div key={l[0]} style={{ display: "flex", height: 44, alignItems: "center", background: i % 2 === 0 ? "#E3EEE4" : "#FBFCFA", fontSize: 24 }}>
              <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: "#D5DCD6" }} />
              </div>
              <div style={{ width: 380 }}>{l[0]}</div>
              <div style={{ width: 190, fontFamily: "monospace" }}>{l[1]}</div>
              <div style={{ width: 90, fontFamily: "monospace" }}>{l[2]}</div>
              <div style={{ width: 150, fontFamily: "monospace" }}>{l[3]}</div>
              <div style={{ color: l[4] === "Integral" ? "#1E2733" : "#2E7A4E", fontWeight: 700 }}>{l[4]}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
