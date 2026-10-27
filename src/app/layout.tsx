import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const texto = Schibsted_Grotesk({
  variable: "--fonte-texto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const codigo = IBM_Plex_Mono({
  variable: "--fonte-codigo",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const URL_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(URL_BASE),
  title: {
    default: "Carimbo: classificação IBS/CBS em lote para escritórios contábeis",
    template: "%s · Carimbo",
  },
  description:
    "Suba os XMLs ou a planilha de produtos do cliente do Simples e receba NCM validado, CST e cClassTrib de IBS/CBS sugeridos com a fonte legal de cada linha. Sugestões para revisão do contador responsável.",
  applicationName: "Carimbo",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Carimbo",
    title: "Carimbo: classificação IBS/CBS em lote",
    description: "NCM, CST e cClassTrib sugeridos com fonte legal, para revisão do contador. O XML não sai do seu computador.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#12171d" },
  ],
};

// Aplica o tema salvo antes da primeira pintura (sem piscar).
const scriptTema = `try{var t=localStorage.getItem("carimbo-tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${codigo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
