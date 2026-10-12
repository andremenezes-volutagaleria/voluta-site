// Gera o site estático da Voluta em /dist a partir de /content.
// Uso: node build.mjs   (sem dependências)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content/site.json"), "utf8"));
site.designers = Object.fromEntries((site.designers || []).map(d => [d.nome, d.info]));

// ---------- utilidades ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const brl = n => "R$ " + Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
// Fotos: o Netlify redimensiona e comprime na hora (Netlify Image CDN). Fora do Netlify (prévia local), usa o original.
const NETLIFY = !!process.env.NETLIFY;
const thumb = (url, w = 900) => {
  if (!url) return "";
  if (url.includes("static-assets.artlogic.net")) return url.replace(/w_\d+,h_\d+,c_limit/, `w_${w},h_${w},c_limit`);
  if (NETLIFY) return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80`;
  return url;
};
const wa = msg => `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`;
const paragrafos = txt => txt.split(/\n\n+/).map(b => b.startsWith("## ") ? `<h2>${esc(b.slice(3).split("\n")[0])}</h2>${b.split("\n").slice(1).join(" ").trim() ? `<p>${esc(b.split("\n").slice(1).join(" "))}</p>` : ""}` : `<p>${esc(b)}</p>`).join("\n");
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };

// ---------- dados ----------
const pecas = fs.readdirSync(path.join(ROOT, "content/pecas"))
  .filter(f => f.endsWith(".json"))
  .map(f => ({ slug: f.replace(/\.json$/, ""), ...JSON.parse(fs.readFileSync(path.join(ROOT, "content/pecas", f), "utf8")) }))
  .filter(p => p.status !== "oculto" && (p.imagens || []).filter(Boolean).length) // peça sem foto só aparece no painel
  .sort((a, b) => (a.status === "vendido") - (b.status === "vendido") || (a.ordem ?? 999) - (b.ordem ?? 999));

const designers = [...new Set(pecas.map(p => p.designer))]
  .sort((a, b) => (a === "Anônimo") - (b === "Anônimo") || a.localeCompare(b, "pt-BR"));
const categorias = site.categorias.filter(c => pecas.some(p => p.categoria === c));

const precoTexto = p => {
  if (p.status === "vendido") return "Vendido";
  if (!p.preco) return "Preço sob consulta";
  return `${brl(p.preco)} à vista${p.parcelamento ? ` · ${p.parcelamento}` : ""}`;
};

// ---------- layout ----------
const analytics = () => [
  site.ga4_id && `<script async src="https://www.googletagmanager.com/gtag/js?id=${site.ga4_id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${site.ga4_id}');</script>`,
  site.meta_pixel_id && `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${site.meta_pixel_id}');fbq('track','PageView');</script>`,
].filter(Boolean).join("\n");

const NAV = [["/acervo/", "Acervo"], ["/designers/", "Designers"], ["/restauro/", "Restauro"], ["/sobre/", "Sobre"], ["/contato/", "Contato"]];

const page = ({ title, desc = site.descricao, url = "/", img, body, current = "", jsonld = "" }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} | Voluta` : "Voluta — mobiliário modernista brasileiro")}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${site.url}${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Voluta">
<meta property="og:title" content="${esc(title || "Voluta")}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${site.url}${url}">
${img ? `<meta property="og:image" content="${esc(thumb(img, 1200))}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/poppins-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jost-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css">
${jsonld}
${analytics()}
</head>
<body>
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <div class="topo__in">
    <a class="marca" href="/" aria-label="Voluta, página inicial"><img src="${esc(site.logo)}" alt="Voluta" width="140" height="48"></a>
    <nav id="nav" class="nav" aria-label="Principal">
      ${NAV.map(([h, t]) => `<a href="${h}"${current === h ? ' aria-current="page"' : ""}>${t}</a>`).join("")}
    </nav>
    <div class="topo__acoes">
      <button class="busca-btn" aria-label="Buscar no acervo" aria-expanded="false" aria-controls="busca">
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
    </div>
  </div>
  <div class="busca" id="busca" hidden>
    <div class="busca__in">
      <label class="busca__campo">
        <span class="visually-hidden">Buscar peça, designer ou material</span>
        <input type="search" id="busca-input" placeholder="Buscar peça, designer ou material" autocomplete="off">
      </label>
      <button class="busca__fechar" aria-label="Fechar busca">Fechar</button>
      <p class="busca__status" aria-live="polite"></p>
      <ul class="busca__resultados" id="busca-resultados"></ul>
    </div>
  </div>
</header>
<main id="conteudo">
${body}
</main>
<footer class="rodape">
  <div class="rodape__in">
    <div>
      <p class="rodape__nome">Voluta</p>
      <p>${esc(site.cidade)}</p>
    </div>
    <div class="rodape__links">
      <a href="${wa("Olá! Vim pelo site da Voluta")}">WhatsApp ${esc(site.whatsapp_exibicao)}</a>
      <a href="mailto:${site.email}">${site.email}</a>
      <a href="https://www.instagram.com/${site.instagram}/">Instagram @${site.instagram}</a>
    </div>
    <div class="rodape__links">
      <a href="/acervo/">Acervo</a><a href="/sobre/">Sobre a Voluta</a><a href="/restauro/">Restauro</a><a href="/politica-de-devolucao/">Política de devolução</a>
    </div>
  </div>
  <p class="rodape__copy">© ${new Date().getFullYear()} Voluta</p>
</footer>
<a class="wa-float" href="${wa("Olá! Vim pelo site da Voluta")}" aria-label="Conversar no WhatsApp">
  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.8c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.2-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4Z"/></svg>
</a>
<script src="/js/site.js" defer></script>
</body>
</html>`;

// ---------- componentes ----------
const card = p => `<li class="card${p.status === "vendido" ? " card--vendido" : ""}" data-preco="${p.preco || ""}" data-data="${esc(p.data || "")}">
  <a href="/acervo/${p.slug}/">
    <div class="card__img"><img src="${esc(thumb(p.imagens[0], 800))}" alt="${esc(`${p.titulo}, ${p.designer}`)}" loading="lazy">${p.status === "vendido" ? `<span class="selo">Vendida</span>` : ""}</div>
    <p class="card__designer">${esc(p.designer)}</p>
    <h3 class="card__titulo">${esc(p.titulo)}${p.ano ? `, <span class="card__ano">${esc(p.ano)}</span>` : ""}</h3>
    <p class="card__preco">${esc(precoTexto(p))}</p>
  </a>
</li>`;

// ---------- páginas ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "static"), OUT, { recursive: true });

// Home
const disponiveis = pecas.filter(p => p.status !== "vendido");
const vendidos = pecas.filter(p => p.status === "vendido");
const porData = [...disponiveis].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
// Carrossel: fotos livres cadastradas em "Textos e contatos" (ambiente, ateliê, detalhes...)
const slides = (site.carrossel || []).filter(s => s.foto).slice(0, 6);
const novas = porData.slice(0, 4);
let destaques = disponiveis.filter(p => p.destaque && !novas.includes(p)).slice(0, 6);
if (destaques.length > 3) destaques = destaques.slice(0, destaques.length - (destaques.length % 3));
const tipos = categorias.map(c => ({ nome: c, slug: slugify(c), lista: disponiveis.filter(p => p.categoria === c) })).filter(t => t.lista.length || vendidos.some(p => p.categoria === t.nome));

write("index.html", page({
  url: "/", img: slides[0]?.foto || disponiveis[0]?.imagens[0],
  body: `
<h1 class="visually-hidden">Voluta — mobiliário modernista brasileiro, garimpado e restaurado em Belo Horizonte</h1>
${slides.length ? `<section class="carrossel" aria-roledescription="carrossel" aria-label="Voluta em imagens">
  <div class="carrossel__trilho">
    ${slides.map((sl, n) => {
      const temTexto = sl.titulo || sl.texto || sl.link;
      const legenda = `${sl.titulo ? `<span class="slide__titulo">${esc(sl.titulo)}</span>` : ""}${sl.texto ? `<span class="slide__texto">${esc(sl.texto)}</span>` : ""}${sl.link ? `<span class="slide__link">${esc(sl.link_texto || "Ver mais")}</span>` : ""}`;
      return `<div class="slide${n === 0 ? " ativo" : ""}" role="group" aria-roledescription="slide" aria-label="${n + 1} de ${slides.length}"${n ? ' aria-hidden="true"' : ""}>
      <img src="${esc(thumb(sl.foto, 2400))}" alt="${esc(sl.descricao_foto || sl.titulo || "Voluta")}"${n === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}>
      ${temTexto ? (sl.link ? `<a class="slide__legenda" href="${esc(sl.link)}"${n ? ' tabindex="-1"' : ""}>${legenda}</a>` : `<div class="slide__legenda">${legenda}</div>`) : ""}
    </div>`; }).join("")}
  </div>
  ${slides.length > 1 ? `<div class="carrossel__ctrl">
    <button class="carrossel__seta" data-dir="-1" aria-label="Foto anterior"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
    <div class="carrossel__pontos">${slides.map((_, n) => `<button aria-label="Ir para a foto ${n + 1}"${n === 0 ? ' aria-current="true"' : ""} data-ir="${n}"></button>`).join("")}</div>
    <button class="carrossel__seta" data-dir="1" aria-label="Próxima foto"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
  </div>` : ""}
</section>` : ""}
${destaques.length ? `<section class="secao">
  <div class="secao__cab"><h2>Destaques</h2><a href="/acervo/">Ver todo o acervo</a></div>
  <ul class="grade grade--3">${destaques.map(card).join("")}</ul>
</section>` : ""}
${novas.length ? `<section class="secao">
  <div class="secao__cab"><h2>Acabaram de chegar</h2><a href="/acervo/">Ver mais recentes</a></div>
  <ul class="grade grade--4">${novas.map(card).join("")}</ul>
</section>` : ""}
<section class="secao">
  <div class="secao__cab"><h2>Navegue pelo acervo</h2><a href="/acervo/">Ver tudo</a></div>
  <ul class="atalhos">
    ${tipos.filter(t => t.lista.length).map(t => `<li><a href="/acervo/tipo/${t.slug}/">
      <div class="atalhos__img"><img src="${esc(thumb(t.lista[0].imagens[0], 600))}" alt="" loading="lazy"></div>
      <span class="atalhos__nome">${esc(t.nome)}</span>
    </a></li>`).join("")}
  </ul>
</section>
${vendidos.length ? `<section class="secao">
  <div class="secao__cab"><h2>Já passaram pela Voluta</h2><a href="/acervo/vendidas/">Ver todas as vendidas</a></div>
  <ul class="grade grade--4">${[...vendidos].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 4).map(card).join("")}</ul>
</section>` : ""}
<section class="secao indice">
  <h2>Designers e fabricantes</h2>
  <ul class="indice__lista">
    ${designers.map(d => `<li><a href="/designers/${slugify(d)}/"><span class="indice__nome">${esc(d)}</span></a></li>`).join("")}
  </ul>
</section>
<section class="faixa">
  <p>Curadoria e histórias das peças no Instagram.</p>
  <a class="botao botao--claro" href="https://www.instagram.com/${site.instagram}/">Seguir @${site.instagram}</a>
</section>`,
  jsonld: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FurnitureStore", name: "Voluta", url: site.url, email: site.email, telephone: "+" + site.whatsapp, address: { "@type": "PostalAddress", addressLocality: "Belo Horizonte", addressRegion: "MG", addressCountry: "BR" }, sameAs: [`https://www.instagram.com/${site.instagram}/`] })}</script>`,
}));

// Índice de busca (lido pela lupa do topo)
write("busca.json", JSON.stringify(pecas.map(p => ({
  u: `/acervo/${p.slug}/`, t: p.titulo, d: p.designer, c: p.categoria, m: p.materiais || "", a: p.ano || "",
  i: thumb(p.imagens[0], 200), p: precoTexto(p),
}))));

// Acervo: páginas de listagem com menu lateral (todas, por tipo, por designer, vendidas)
const lado = ativo => {
  const item = (href, nome, n, chave) => `<li><a href="${href}"${ativo === chave ? ' aria-current="page"' : ""}${n ? "" : ' class="so-vendidas"'}>${esc(nome)}</a></li>`;
  return `<aside class="lateral" id="lateral" aria-label="Filtrar acervo">
  <div class="lateral__grupo">
    <h2>Tipo de peça</h2>
    <ul>${item("/acervo/", "Todas", disponiveis.length, "todas")}${tipos.map(t => item(`/acervo/tipo/${t.slug}/`, t.nome, t.lista.length, "tipo:" + t.slug)).join("")}</ul>
  </div>
  <div class="lateral__grupo">
    <h2>Designer</h2>
    <ul>${designers.map(d => item(`/designers/${slugify(d)}/`, d, pecas.filter(p => p.designer === d && p.status !== "vendido").length, "designer:" + slugify(d))).join("")}</ul>
  </div>
  ${vendidos.length ? `<div class="lateral__grupo"><h2>Disponibilidade</h2><ul>${item("/acervo/", "Disponíveis", disponiveis.length, "disp")}${item("/acervo/vendidas/", "Vendidas", vendidos.length, "vendidas")}</ul></div>` : ""}
</aside>`;
};

const listagem = ({ rel, url, titulo, sub = "", lista, ativo, desc, current = "/acervo/", vendidas = [] }) => write(rel, page({
  title: titulo === "Acervo" ? "Acervo" : `${titulo} | Acervo`, url, current, desc, img: lista[0]?.imagens[0],
  body: `
<div class="acervo">
  ${lado(ativo)}
  <section class="acervo__conteudo">
    <div class="acervo__cab">
      <div>
        <h1 class="titulo-pagina">${esc(titulo)}</h1>
        ${sub ? `<p class="subtitulo">${esc(sub)}</p>` : ""}
      </div>
      <div class="acervo__ferramentas">
        <button class="filtrar-btn" aria-expanded="false" aria-controls="lateral">Filtrar</button>
        <label class="ordem"><span>Ordenar</span>
          <select id="ordenar">
            <option value="recentes">Mais recentes</option>
            <option value="menor">Menor preço</option>
            <option value="maior">Maior preço</option>
          </select>
        </label>
      </div>
    </div>
    <p class="contagem">${lista.length} ${lista.length === 1 ? "peça" : "peças"}</p>
    ${lista.length ? `<ul class="grade grade--acervo" id="grade-acervo">${lista.map(card).join("")}</ul>` : `<p class="vazio">Nenhuma peça disponível aqui no momento. <a href="${wa(`Olá! Procuro peças de ${titulo}. Vocês têm algo chegando?`)}">Fale com a gente</a> pra saber das próximas.</p>`}
    ${vendidas.length ? `<div class="ja-vendidas"><div class="secao__cab"><h2>Já passaram pela Voluta</h2></div><ul class="grade grade--acervo">${vendidas.map(card).join("")}</ul></div>` : ""}
  </section>
</div>`,
}));

const ordenarData = l => [...l].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
listagem({ rel: "acervo/index.html", url: "/acervo/", titulo: "Acervo", lista: ordenarData(disponiveis), ativo: "todas",
  desc: "Mobiliário modernista brasileiro disponível na Voluta: poltronas, sofás, mesas, bancos e mais." });
tipos.forEach(t => listagem({ rel: `acervo/tipo/${t.slug}/index.html`, url: `/acervo/tipo/${t.slug}/`, titulo: t.nome, lista: ordenarData(t.lista), vendidas: ordenarData(vendidos.filter(p => p.categoria === t.nome)), ativo: "tipo:" + t.slug,
  desc: `${t.nome} modernistas brasileiras disponíveis na Voluta.` }));
if (vendidos.length) listagem({ rel: "acervo/vendidas/index.html", url: "/acervo/vendidas/", titulo: "Vendidas", sub: "Peças que já passaram pela Voluta.", lista: ordenarData(vendidos), ativo: "vendidas",
  desc: "Peças já vendidas pela Voluta." });
designers.forEach(d => {
  const lista = ordenarData(disponiveis.filter(p => p.designer === d));
  listagem({ rel: `designers/${slugify(d)}/index.html`, url: `/designers/${slugify(d)}/`, titulo: d, sub: site.designers[d] || "", lista, vendidas: ordenarData(vendidos.filter(p => p.designer === d)), ativo: "designer:" + slugify(d),
    desc: `Peças de ${d} no acervo da Voluta.`, current: "/designers/" });
});

// Peças
pecas.forEach((p, i) => {
  const url = `/acervo/${p.slug}/`;
  const msg = `Olá! Tenho interesse na peça "${p.titulo}" (${p.designer})${p.codigo ? `, código ${p.codigo}` : ""}. ${site.url}${url}`;
  const mesmos = pecas.filter(o => o !== p && o.designer === p.designer && o.status !== "vendido").slice(0, 3);
  const outros = mesmos.length ? mesmos : pecas.filter(o => o !== p && o.categoria === p.categoria && o.status !== "vendido").slice(0, 3);
  const ant = pecas[(i - 1 + pecas.length) % pecas.length], prox = pecas[(i + 1) % pecas.length];
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.titulo, description: p.descricao, image: p.imagens.map(u => thumb(u, 1600)), brand: { "@type": "Brand", name: p.designer }, ...(p.preco ? { offers: { "@type": "Offer", priceCurrency: "BRL", price: p.preco, availability: p.status === "vendido" ? "https://schema.org/SoldOut" : "https://schema.org/InStock", url: site.url + url } } : {}) };
  write(`acervo/${p.slug}/index.html`, page({
    title: `${p.titulo}, ${p.designer}`, url, current: "/acervo/", img: p.imagens[0],
    desc: p.descricao.slice(0, 155),
    jsonld: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    body: `
<nav class="migalha" aria-label="Você está em"><a href="/acervo/">Acervo</a> / <a href="/acervo/tipo/${slugify(p.categoria)}/">${esc(p.categoria)}</a></nav>
<article class="peca">
  <div class="galeria">
    <div class="galeria__principal"><img id="foto-principal" src="${esc(thumb(p.imagens[0], 1600))}" alt="${esc(`${p.titulo}, ${p.designer}`)}"></div>
    ${p.imagens.length > 1 ? `<ul class="galeria__mini">${p.imagens.map((u, n) => `<li><button data-src="${esc(thumb(u, 1600))}" aria-label="Ver foto ${n + 1} de ${p.imagens.length}"${n === 0 ? ' aria-current="true"' : ""}><img src="${esc(thumb(u, 200))}" alt="" loading="lazy"></button></li>`).join("")}</ul>` : ""}
  </div>
  <div class="ficha">
    <p class="ficha__designer"><a href="/designers/${slugify(p.designer)}/">${esc(p.designer)}</a>${site.designers[p.designer] ? `<span>${esc(site.designers[p.designer])}</span>` : ""}</p>
    <h1 class="ficha__titulo">${esc(p.titulo)}</h1>
    ${p.ano ? `<p class="ficha__ano">${esc(p.ano)}</p>` : ""}
    <p class="ficha__preco">${esc(precoTexto(p))}</p>
    ${p.preco_obs && p.status !== "vendido" ? `<p class="ficha__obs">${esc(p.preco_obs)}</p>` : ""}
    ${p.status === "vendido"
      ? `<a class="botao botao--linha" href="${wa(`Olá! Vi a peça vendida "${p.titulo}" no site. Vocês têm algo parecido?`)}">Procurar peça parecida</a>`
      : `<a class="botao botao--wa" href="${wa(msg)}" data-evento="interesse">Tenho interesse</a>`}
    <dl class="ficha__dados">
      ${p.dimensoes ? `<dt>Dimensões</dt><dd>${esc(p.dimensoes)}</dd>` : ""}
      ${p.materiais ? `<dt>Materiais</dt><dd>${esc(p.materiais)}</dd>` : ""}
      ${p.codigo ? `<dt>Código</dt><dd>${esc(p.codigo)}</dd>` : ""}
    </dl>
    <div class="ficha__texto">${paragrafos(p.descricao)}</div>
    <p class="ficha__garantia">Envio para todo o Brasil com transporte especializado. <a href="/politica-de-devolucao/">Política de devolução</a></p>
  </div>
</article>
<nav class="vizinhas" aria-label="Outras peças"><a href="/acervo/${ant.slug}/">Peça anterior</a><a href="/acervo/${prox.slug}/">Próxima peça</a></nav>
${outros.length ? `<section class="secao"><div class="secao__cab"><h2>${mesmos.length ? `Mais de ${esc(p.designer)}` : `Outras ${esc(p.categoria.toLowerCase())}`}</h2></div><ul class="grade">${outros.map(card).join("")}</ul></section>` : ""}`,
  }));
});

// Designers
write("designers/index.html", page({
  title: "Designers", url: "/designers/", current: "/designers/",
  desc: "Designers e fabricantes do modernismo brasileiro e internacional presentes no acervo da Voluta.",
  body: `<section class="secao indice indice--pagina"><h1 class="titulo-pagina">Designers e fabricantes</h1><ul class="indice__lista">${designers.map(d => `<li><a href="/designers/${slugify(d)}/"><span class="indice__nome">${esc(d)}</span><span class="indice__info">${esc(site.designers[d] || "")}</span></a></li>`).join("")}</ul></section>`,
}));

// Páginas de texto
const textoPagina = (rel, titulo, texto, current, img) => write(rel, page({
  title: titulo, url: "/" + rel.replace("index.html", ""), current,
  body: `<section class="secao texto">${img ? `<img class="texto__img" src="${esc(img)}" alt="">` : ""}<div class="texto__corpo"><h1 class="titulo-pagina">${esc(titulo)}</h1>${paragrafos(texto)}</div></section>`,
}));
textoPagina("sobre/index.html", "Sobre a Voluta", site.sobre, "/sobre/", site.imagem_sobre);
textoPagina("restauro/index.html", "Restauro", site.restauro, "/restauro/");
textoPagina("politica-de-devolucao/index.html", "Política de devolução", site.devolucao, "");

write("contato/index.html", page({
  title: "Contato", url: "/contato/", current: "/contato/",
  body: `<section class="secao texto"><div class="texto__corpo">
  <h1 class="titulo-pagina">Contato</h1>
  <p>O atendimento é feito de forma reservada, direto com a gente. O caminho mais rápido é o WhatsApp.</p>
  <ul class="contatos">
    <li><a class="botao botao--wa" href="${wa("Olá! Vim pelo site da Voluta")}">Conversar no WhatsApp</a></li>
    <li><a href="mailto:${site.email}">${site.email}</a></li>
    <li><a href="https://www.instagram.com/${site.instagram}/">@${site.instagram}</a></li>
    <li>${esc(site.cidade)}</li>
  </ul>
  <h2>Quer vender uma peça?</h2>
  <p>Compramos mobiliário modernista. <a href="https://venda.volutagaleria.com.br">Envie as fotos da sua peça</a>.</p>
</div></section>`,
}));

write("404.html", page({ title: "Página não encontrada", body: `<section class="secao texto"><div class="texto__corpo"><h1 class="titulo-pagina">Esta página não existe mais</h1><p>A peça pode ter sido vendida ou mudado de endereço.</p><p><a class="botao" href="/acervo/">Ver o acervo</a></p></div></section>` }));

// SEO: sitemap, robots
const urls = ["/", "/acervo/", "/designers/", "/sobre/", "/restauro/", "/contato/", "/politica-de-devolucao/", ...pecas.map(p => `/acervo/${p.slug}/`), ...designers.map(d => `/designers/${slugify(d)}/`), ...tipos.map(t => `/acervo/tipo/${t.slug}/`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${site.url}${u}</loc></url>`).join("\n")}\n</urlset>`);
write("robots.txt", `User-agent: *\nDisallow: /admin/\nSitemap: ${site.url}/sitemap.xml\n`);

// Redirecionamentos das URLs do Artlogic (mantém links de anúncios e do Google)
const ARTISTAS_ANTIGOS = { "42-anonimo": "Anônimo", "33-moveis-cimo": "Móveis CIMO", "49-le-corbusier": "Le Corbusier", "37-celina-decoracoes": "Celina Decorações", "44-fernando-jaeger": "Fernando Jaeger", "30-percival-lafer": "Percival Lafer", "40-moveis-cantu": "Móveis Cantu", "36-warren-platner": "Warren Platner", "31-sergio-rodrigues": "Sérgio Rodrigues", "35-joaquim-tenreiro": "Joaquim Tenreiro", "34-jorge-zalszupin": "Jorge Zalszupin" };
const especificos = [];
pecas.forEach(p => {
  if (!p.url_antiga) return;
  const destino = `/acervo/${p.slug}/`;
  const caminhos = [`/artworks/${p.url_antiga}`, `/content/viewing-room/1/artworks-${p.url_antiga}`, `/content/feature/14/artworks-${p.url_antiga}`];
  if (p.categoria_antiga) caminhos.push(`/artworks/categories/${p.categoria_antiga}/${p.url_antiga}`);
  caminhos.forEach(c => especificos.push(`${c}/*  ${destino}  301`, `${c}  ${destino}  301`));
});
Object.entries(ARTISTAS_ANTIGOS).forEach(([old, d]) => { if (designers.includes(d)) especificos.push(`/artists/${old}/*  /designers/${slugify(d)}/  301`); });
const CATS_ANTIGAS = { "1-poltronas": "Poltronas", "4-cadeiras": "Cadeiras", "5-mesas-de-centro": "Mesas de centro", "9-sofas": "Sofás", "6-mesas-laterais": "Mesas laterais", "2-bancos": "Bancos", "15-buffet": "Buffets", "8-escrivaninhas": "Escrivaninhas", "10-mesas-de-jantar": "Mesas de jantar" };
Object.entries(CATS_ANTIGAS).forEach(([old, c]) => { if (tipos.some(t => t.nome === c)) especificos.push(`/artworks/categories/${old}/*  /acervo/tipo/${slugify(c)}/  301`); });
const gerais = [
  "/artworks/*  /acervo/  301",
  "/artists/*  /designers/  301",
  "/content/*  /acervo/  301",
  "/contact/*  /contato/  301",
  "/pol-tica-de-devolu-o-/*  /politica-de-devolucao/  301",
  "/admin/inventario/*  /admin/  301",
];
write("_redirects", [...especificos, ...gerais].join("\n") + "\n");

console.log(`OK: ${pecas.length} peças, ${designers.length} designers, ${urls.length} páginas.`);
