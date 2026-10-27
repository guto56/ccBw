import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { Shell, Working, usePath } from "./ui";

const Enviar = lazy(() => import("./pages/Enviar"));
const Caso = lazy(() => import("./pages/Caso"));
const Frotas = lazy(() => import("./pages/Frotas"));
const Admin = lazy(() => import("./pages/Admin"));
const Legal = lazy(() => import("./pages/Legal"));

function App() {
  const path = usePath().split("#")[0]!;
  let page;
  if (path === "/enviar") page = <Enviar />;
  else if (path === "/c" || path === "/c/") page = <Caso />;
  else if (path === "/frotas") page = <Frotas />;
  else if (path === "/admin") page = <Admin />;
  else if (path === "/termos") page = <Legal kind="termos" />;
  else if (path === "/privacidade") page = <Legal kind="privacidade" />;
  else
    page = (
      <Shell>
        <h1 className="app-title">Página não encontrada</h1>
        <p className="mt-6">
          <a className="link" href="/">
            Voltar ao início
          </a>
        </p>
      </Shell>
    );
  return (
    <Suspense
      fallback={
        <Shell>
          <Working title="Carregando" />
        </Shell>
      }
    >
      {page}
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
