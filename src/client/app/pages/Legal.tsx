import { useEffect } from "react";
import { Shell } from "../ui";

function Draft() {
  return (
    <p className="mt-6 panel small" role="note">
      <strong>Rascunho para revisão jurídica.</strong> Este texto ainda não foi revisado por advogado e vale apenas para o ambiente de testes.
    </p>
  );
}

function Termos() {
  return (
    <article className="max-w-[68ch]">
      <h1 className="app-title">Termos de uso</h1>
      <Draft />
      <div className="mt-10 grid gap-5">
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>O serviço</h2>
        <p>O ContraMulta lê a notificação de trânsito enviada pelo usuário, aponta falhas formais encontradas por regras fixas e, mediante pagamento, gera um modelo de defesa prévia ou de recurso para o próprio usuário revisar, assinar e protocolar.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>O que não é</h2>
        <p>O ContraMulta não é escritório de advocacia, não presta consultoria jurídica e não representa o usuário perante órgãos de trânsito. Não é órgão público e não tem relação com DETRAN, prefeituras, polícias ou o CONTRAN.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Sem garantia de resultado</h2>
        <p>A decisão sobre a defesa ou o recurso é do órgão de trânsito. A “força da defesa” é uma classificação calculada por regra e não é promessa nem probabilidade de êxito.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Responsabilidade do usuário</h2>
        <p>O usuário confere os dados lidos da notificação, revisa a peça antes de assinar, protocola dentro do prazo e pelo canal indicado na notificação, e responde pela veracidade do que declarar.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Pagamento</h2>
        <p>No ambiente de testes, o pagamento é simulado e nada é cobrado. As condições de reembolso serão definidas antes da cobrança real.</p>
      </div>
    </article>
  );
}

function Privacidade() {
  return (
    <article className="max-w-[68ch]">
      <h1 className="app-title">Política de privacidade</h1>
      <Draft />
      <div className="mt-10 grid gap-5">
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Que dados coletamos</h2>
        <p>As imagens ou o PDF da notificação, a foto da infração e o CRLV, quando enviados; os dados lidos desses documentos e confirmados por você; e, depois do pagamento, nome, CPF, CNH (opcional) e endereço para preencher a peça. O e-mail é opcional.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Para que usamos</h2>
        <p>Para gerar o diagnóstico e a peça que você pediu. As imagens e os dados lidos são enviados a um provedor de IA (via OpenRouter) apenas para extração e descrição. Os resultados que você informar (deferido, indeferido) são usados, sem identificação, para ajustar o peso dos argumentos.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Proteção</h2>
        <p>Nome, CPF, CNH e endereço ficam cifrados no banco de dados. CPF e CNH nunca aparecem em registros de sistema e aparecem mascarados para a equipe. O acesso ao caso é feito só por um link com chave aleatória; não há cadastro nem senha.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Por quanto tempo</h2>
        <p>Os arquivos enviados, a peça e os dados pessoais são apagados automaticamente 30 dias após o envio. Você pode apagar antes, pelo próprio link do caso.</p>
        <h2 className="lead font-semibold" style={{ fontFamily: "var(--font-text)", letterSpacing: 0 }}>Seus direitos</h2>
        <p>Você pode pedir acesso, correção ou exclusão dos seus dados. O canal de atendimento do encarregado de dados será publicado antes da operação real.</p>
      </div>
    </article>
  );
}

export default function Legal({ kind }: { kind: "termos" | "privacidade" }) {
  useEffect(() => {
    document.title = `${kind === "termos" ? "Termos de uso" : "Privacidade"} · ContraMulta`;
  }, [kind]);
  return <Shell>{kind === "termos" ? <Termos /> : <Privacidade />}</Shell>;
}
