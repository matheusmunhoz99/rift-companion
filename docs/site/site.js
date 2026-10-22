"use strict";

// The page and download links remain usable without JavaScript.
const stages = {
  select: {
    title: "A build muda. O confronto também.",
    description:
      "Veja o seu oponente, a composição dos times e sugestões de itens. Importe runas e feitiços direto no cliente, sem ficar copiando de outra aba.",
    tag: "SELEÇÃO DE CAMPEÕES",
    image: "docs/screenshots/champselect.png",
    alt: "Seleção de campeões com composição dos times, counters e build do confronto",
  },
  live: {
    title: "Dez jogadores. Uma visão da partida.",
    description:
      "Acompanhe placar, itens, ouro e objetivos. Compare as rotas e consulte os jogadores sem perder o contexto do jogo.",
    tag: "PARTIDA AO VIVO",
    image: "docs/screenshots/live.png",
    alt: "Placar ao vivo com os dez jogadores, itens, ouro e objetivos",
  },
  post: {
    title: "Acabou o jogo. Ficaram os números.",
    description:
      "Veja notas, destaques e o desempenho dos jogadores. Dano, ouro, farm e visão ajudam a contar o que o resultado sozinho não mostra.",
    tag: "FIM DE PARTIDA",
    image: "docs/screenshots/postgame.png",
    alt: "Resumo pós-partida com notas dos jogadores, pódio e estatísticas",
  },
};

const tabs = [...document.querySelectorAll("[data-stage]")];
const panel = document.querySelector("#stage-panel");
const stageImage = document.querySelector("#stage-image");
function selectStage(tab) {
  const stage = stages[tab.dataset.stage];
  if (!stage) return;
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  }
  panel.setAttribute("aria-labelledby", tab.id);
  document.querySelector("#stage-title").textContent = stage.title;
  document.querySelector("#stage-description").textContent = stage.description;
  document.querySelector("#stage-tag").textContent = stage.tag;
  stageImage.src = stage.image;
  stageImage.alt = stage.alt;
  stageImage.parentElement.href = stage.image;
  stageImage.parentElement.setAttribute("aria-label", "Ampliar: " + stage.alt);
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectStage(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectStage(tabs[next]);
    tabs[next].focus();
  });
});

const dialog = document.querySelector("#image-dialog");
let opener;
if (typeof dialog.showModal === "function") {
  document.querySelectorAll(".zoomable").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      opener = link;
      const caption =
        link.querySelector("img")?.alt || link.getAttribute("aria-label");
      const image = document.querySelector("#dialog-image");
      image.src = link.href;
      image.alt = caption;
      document.querySelector("#dialog-caption").textContent = caption;
      dialog.showModal();
      document.body.classList.add("modal-open");
    });
  });
  dialog
    .querySelector("button")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    opener?.focus({ preventScroll: true });
  });
}

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
if ("IntersectionObserver" in window && !motionPreference.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("is-pending");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.06 },
  );
  document.querySelectorAll(".reveal").forEach((element) => {
    // Never hide content already visible when the script loads.
    if (element.getBoundingClientRect().top >= window.innerHeight) {
      element.classList.add("is-pending");
      observer.observe(element);
    }
  });
  motionPreference.addEventListener("change", () => {
    if (motionPreference.matches) {
      observer.disconnect();
      document
        .querySelectorAll(".is-pending")
        .forEach((element) => element.classList.remove("is-pending"));
    }
  });
}
