import { diffDays, isValidDate } from "../shared/rules/dates";

// Entrada das seções: uma vez, quando a seção aparece.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: "0px 0px -10% 0px" },
);
document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

// A conta do prazo de 30 dias (mesma regra do motor de diagnóstico).
const form = document.getElementById("prazo") as HTMLFormElement | null;
const out = document.getElementById("prazo-out");
function update() {
  if (!form || !out) return;
  const a = (form.elements.namedItem("infracao") as HTMLInputElement).value;
  const b = (form.elements.namedItem("expedicao") as HTMLInputElement).value;
  const verdict = out.querySelector(".verdict")!;
  const note = verdict.nextElementSibling!;
  if (!isValidDate(a) || !isValidDate(b)) {
    out.dataset.state = "vazio";
    verdict.textContent = "Preencha as duas datas.";
    note.textContent = "Elas estão impressas na notificação da autuação.";
    return;
  }
  const d = diffDays(a, b);
  if (d < 0) {
    out.dataset.state = "vazio";
    verdict.textContent = "Confira as datas.";
    note.textContent = "A expedição não pode ser anterior à infração.";
  } else if (d > 30) {
    out.dataset.state = "tarde";
    verdict.textContent = `${d} dias. Fora do prazo.`;
    note.textContent = "Expedida depois de 30 dias, a notificação dá motivo para pedir o arquivamento do auto.";
  } else {
    out.dataset.state = "ok";
    verdict.textContent = `${d} ${d === 1 ? "dia" : "dias"}. Dentro do prazo.`;
    note.textContent = "Por aqui não há falha. O diagnóstico confere também o enquadramento, os dados obrigatórios e a foto.";
  }
}
form?.addEventListener("input", update);
form?.addEventListener("submit", (e) => e.preventDefault());
update();
