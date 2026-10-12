// Menu no celular
const btn = document.querySelector(".menu-btn");
const nav = document.getElementById("nav");
btn?.addEventListener("click", () => {
  const aberto = nav.classList.toggle("aberto");
  btn.setAttribute("aria-expanded", aberto);
});

// Acervo: ordenação e menu lateral no celular
const grade = document.getElementById("grade-acervo");
const ordenar = document.getElementById("ordenar");
if (grade && ordenar) {
  const cards = [...grade.children];
  const aplicar = modo => {
    const preco = c => Number(c.dataset.preco) || null;
    const ord = [...cards].sort((a, b) => {
      if (modo === "recentes") return (b.dataset.data || "").localeCompare(a.dataset.data || "");
      const pa = preco(a), pb = preco(b);
      if (pa === null) return 1; if (pb === null) return -1;   // "sob consulta" vai pro fim
      return modo === "menor" ? pa - pb : pb - pa;
    });
    grade.append(...ord);
  };
  const inicial = new URLSearchParams(location.search).get("ordem");
  if (inicial) { ordenar.value = inicial; aplicar(inicial); }
  ordenar.addEventListener("change", () => {
    aplicar(ordenar.value);
    const url = new URL(location.href);
    ordenar.value === "recentes" ? url.searchParams.delete("ordem") : url.searchParams.set("ordem", ordenar.value);
    history.replaceState(null, "", url);
  });
}
const filtrarBtn = document.querySelector(".filtrar-btn");
const lateral = document.getElementById("lateral");
filtrarBtn?.addEventListener("click", () => {
  const aberto = lateral.classList.toggle("aberta");
  filtrarBtn.setAttribute("aria-expanded", aberto);
});

// Galeria da peça
const principal = document.getElementById("foto-principal");
document.querySelectorAll(".galeria__mini button").forEach(b => {
  b.addEventListener("click", () => {
    principal.src = b.dataset.src;
    document.querySelectorAll(".galeria__mini button").forEach(x => x.removeAttribute("aria-current"));
    b.setAttribute("aria-current", "true");
  });
});

// Conversão: clique em "Tenho interesse" (GA4 + Meta, se configurados)
document.querySelectorAll('[data-evento="interesse"]').forEach(a => {
  a.addEventListener("click", () => {
    const peca = document.querySelector(".ficha__titulo")?.textContent;
    window.gtag?.("event", "generate_lead", { method: "whatsapp", item_name: peca });
    window.fbq?.("track", "Contact", { content_name: peca });
  });
});

// Carrossel da home
const carrossel = document.querySelector(".carrossel");
if (carrossel) {
  const slides = [...carrossel.querySelectorAll(".slide")];
  const pontos = [...carrossel.querySelectorAll(".carrossel__pontos button")];
  let atual = 0, timer;
  const ir = n => {
    atual = (n + slides.length) % slides.length;
    slides.forEach((s, i) => {
      const on = i === atual;
      s.classList.toggle("ativo", on);
      s.toggleAttribute("aria-hidden", !on);
      const link = s.querySelector("a"); if (link) link.tabIndex = on ? 0 : -1;
      if (on) s.querySelector("img").loading = "eager";
    });
    pontos.forEach((p, i) => p.toggleAttribute("aria-current", i === atual));
  };
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const iniciar = () => { if (!reduz && slides.length > 1) { clearInterval(timer); timer = setInterval(() => ir(atual + 1), 6000); } };
  const parar = () => clearInterval(timer);
  carrossel.querySelectorAll(".carrossel__seta").forEach(b => b.addEventListener("click", () => { ir(atual + Number(b.dataset.dir)); iniciar(); }));
  pontos.forEach(p => p.addEventListener("click", () => { ir(Number(p.dataset.ir)); iniciar(); }));
  carrossel.addEventListener("mouseenter", parar);
  carrossel.addEventListener("mouseleave", iniciar);
  carrossel.addEventListener("focusin", parar);
  let x0 = null;
  carrossel.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; parar(); }, { passive: true });
  carrossel.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1));
    x0 = null; iniciar();
  });
  iniciar();
}

// Busca (lupa no topo)
const buscaBtn = document.querySelector(".busca-btn");
const busca = document.getElementById("busca");
if (buscaBtn && busca) {
  const input = document.getElementById("busca-input");
  const lista = document.getElementById("busca-resultados");
  const status = busca.querySelector(".busca__status");
  let indice = null;
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const abrir = async () => {
    busca.hidden = false; buscaBtn.setAttribute("aria-expanded", "true"); input.focus();
    if (!indice) {
      try { indice = await (await fetch("/busca.json")).json(); indice.forEach(p => p.k = norm([p.t, p.d, p.c, p.m, p.a].join(" "))); }
      catch { status.textContent = "Não foi possível carregar a busca. Tente de novo."; }
    }
  };
  const fechar = () => { busca.hidden = true; buscaBtn.setAttribute("aria-expanded", "false"); buscaBtn.focus(); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const procurar = () => {
    const termos = norm(input.value).split(/\s+/).filter(Boolean);
    if (!termos.length || !indice) { lista.innerHTML = ""; status.textContent = ""; return; }
    const achados = indice.filter(p => termos.every(t => p.k.includes(t))).slice(0, 12);
    status.textContent = achados.length ? `${achados.length} ${achados.length === 1 ? "peça encontrada" : "peças encontradas"}` : "Nenhuma peça encontrada. Tente o nome do designer ou o tipo, como poltrona.";
    lista.innerHTML = achados.map(p => `<li><a href="${p.u}"><img src="${esc(p.i)}" alt="" loading="lazy"><span><em>${esc(p.d)}</em>${esc(p.t)}${p.a ? `, ${esc(p.a)}` : ""}<small>${esc(p.p)}</small></span></a></li>`).join("");
  };
  buscaBtn.addEventListener("click", () => busca.hidden ? abrir() : fechar());
  busca.querySelector(".busca__fechar").addEventListener("click", fechar);
  input.addEventListener("input", procurar);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !busca.hidden) fechar();
    if (e.key === "/" && busca.hidden && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); abrir(); }
  });
}
