import { createHash } from "node:crypto";
// Gera o site estático da Voluta em /dist a partir de /content.
// Uso: node build.mjs   (sem dependências)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "dist");
// Versão dos arquivos de estilo e script: muda quando o arquivo muda, para o navegador não usar cópia antiga
const versao = f => createHash("md5").update(fs.readFileSync(path.join(ROOT, "static", f))).digest("hex").slice(0, 8);
const V_CSS = versao("css/site.css"), V_JS = versao("js/site.js");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content/site.json"), "utf8"));
const fichasDesigner = Object.fromEntries((site.designers || []).map(d => [d.nome, d])); // bio, foto e cronologia
site.designers = Object.fromEntries((site.designers || []).map(d => [d.nome, d.info]));

// ---------- utilidades ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const brl = n => "R$ " + Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
// Fotos: o Netlify redimensiona e comprime na hora (Netlify Image CDN). Fora do Netlify (prévia local), usa o original.
const NETLIFY = !!process.env.NETLIFY;
const thumb = (url, w = 900) => {
  if (!url) return "";
  if (url.includes("static-assets.artlogic.net")) return url.replace(/w_\d+,h_\d+,c_limit/, `w_${Math.min(w, 1600)},h_${Math.min(w, 1600)},c_limit`); // acima de 1600 o Artlogic não serve a imagem
  if (NETLIFY) return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80`;
  return url;
};
const wa = msg => `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`;
const paragrafos = txt => txt.split(/\n\n+/).map(b => b.startsWith("## ") ? `<h2>${esc(b.slice(3).split("\n")[0])}</h2>${b.split("\n").slice(1).join(" ").trim() ? `<p>${esc(b.split("\n").slice(1).join(" "))}</p>` : ""}` : `<p>${esc(b)}</p>`).join("\n");
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };

// ---------- dados ----------
// Foto com caminho errado (ex.: /uploads/pecas/10.png, fora da pasta da peça) quebrava a galeria.
// Se o arquivo existir na pasta da peça, usa esse; se não existir em lugar nenhum, tira da lista e avisa no log.
const existe = u => fs.existsSync(path.join(ROOT, "static", decodeURIComponent(u)));
function conferirFotos(p) {
  // Campos de texto vazios não podem derrubar a publicação (ex.: peça cadastrada sem descrição)
  for (const k of ["titulo", "descricao", "categoria", "dimensoes", "materiais"]) p[k] = String(p[k] ?? "").trim();
  p.designer = String(p.designer ?? "").trim() || "Anônimo";
  const vistas = new Set();
  p.imagens = (p.imagens || []).filter(Boolean).map(u => {
    if (!u.startsWith("/uploads/") || existe(u)) return u;
    const naPasta = `/uploads/pecas/${p.slug}/${u.split("/").pop()}`;
    if (existe(naPasta)) { console.warn(`Foto corrigida em ${p.slug}: ${u} -> ${naPasta}`); return naPasta; }
    console.warn(`Foto não encontrada em ${p.slug}: ${u} (removida da galeria)`); return null;
  }).filter(u => u && !vistas.has(u) && vistas.add(u));
  return p;
}
const pecas = fs.readdirSync(path.join(ROOT, "content/pecas"))
  .filter(f => f.endsWith(".json"))
  .map(f => ({ slug: f.replace(/\.json$/, ""), ...JSON.parse(fs.readFileSync(path.join(ROOT, "content/pecas", f), "utf8")) }))
  .map(conferirFotos)
  .filter(p => p.status !== "oculto" && (p.imagens || []).filter(Boolean).length) // peça sem foto só aparece no painel
  .sort((a, b) => (a.status === "vendido") - (b.status === "vendido") || (a.ordem ?? 999) - (b.ordem ?? 999));

const designers = [...new Set(pecas.map(p => p.designer))]
  .sort((a, b) => (a === "Anônimo") - (b === "Anônimo") || a.localeCompare(b, "pt-BR"));
site.categorias = (site.categorias || []).map(c => typeof c === "string" ? { nome: c } : c).filter(c => c && c.nome);
const fotoCategoria = Object.fromEntries(site.categorias.filter(c => c.foto).map(c => [c.nome, c.foto]));
const categorias = site.categorias.map(c => c.nome).filter(c => fotoCategoria[c] || pecas.some(p => p.categoria === c)); // tipo sem peça nenhuma só aparece se tiver foto escolhida

const precoTexto = p => {
  // Preços não aparecem no site: o cliente entra em contato pelo WhatsApp
  return p.status === "vendido" ? "Vendida" : "Valor sob consulta";
};

// ---------- conteúdo editorial (exposições e diário) ----------
const lerPasta = dir => {
  const p = path.join(ROOT, "content", dir);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p).filter(f => f.endsWith(".json"))
    .map(f => ({ slug: f.replace(/\.json$/, ""), ...JSON.parse(fs.readFileSync(path.join(p, f), "utf8")) }))
    .filter(x => !x.oculto && x.titulo);
};
const porSlug = Object.fromEntries(pecas.map(p => [p.slug, p]));
const pecasDe = lista => (lista || []).map(s => porSlug[typeof s === "string" ? s : s?.peca]).filter(Boolean);
const hoje = new Date().toISOString().slice(0, 10);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesAno = d => { if (!d) return ""; const [a, m] = String(d).split("-"); return `${MESES[+m - 1]} ${a}`; };
const dataLonga = d => { if (!d) return ""; const [a, m, dia] = String(d).split("-"); return `${+dia} de ${MESES[+m - 1]} de ${a}`; };
const periodo = e => [mesAno(e.inicio), mesAno(e.fim)].filter(Boolean).join(" — ");
const exposicoes = lerPasta("exposicoes").sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
const emCartaz = e => (!e.fim || e.fim >= hoje);
const atual = exposicoes.find(e => e.destaque) || exposicoes.find(emCartaz) || null;
const diario = lerPasta("diario").sort((a, b) => (b.data || "").localeCompare(a.data || ""));
const nomeDesigner = d => d === "Anônimo" ? "Autoria desconhecida" : d;

// ---------- layout ----------
const analytics = () => [
  site.ga4_id && `<script async src="https://www.googletagmanager.com/gtag/js?id=${site.ga4_id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${site.ga4_id}');</script>`,
  site.meta_pixel_id && `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${site.meta_pixel_id}');fbq('track','PageView');</script>`,
].filter(Boolean).join("\n");

// Ícones (WhatsApp, e-mail, Instagram, local)
const ICONE = {
  wa: `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.8c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.2-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4Z"/></svg>`,
  email: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 6l8.5 7 8.5-7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  ig: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor"/></svg>`,
  compartilhar: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11H5.5v9.5h13V11H16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  local: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
};
const VENDA = "https://venda.volutagaleria.com.br/";
const NAV = [["/acervo/", "Acervo"], ["/designers/", "Designers"], ...(exposicoes.length ? [["/exposicoes/", "Exposições"]] : []), ...(diario.length ? [["/diario/", "Diário"]] : []), ["/restauro/", "Restauro"], ["/sobre/", "Sobre"]];

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
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32"><link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/poppins-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jost-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${V_CSS}">
${jsonld}
${analytics()}
</head>
<body>
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <div class="topo__in">
    <a class="marca" href="/" aria-label="Voluta, página inicial">Voluta</a>
    <nav id="nav" class="nav" aria-label="Principal">
      ${NAV.map(([h, t]) => `<a href="${h}"${current === h ? ' aria-current="page"' : ""}>${t}</a>`).join("")}
      <a class="nav__contato" href="/contato/"${current === "/contato/" ? ' aria-current="page"' : ""}>Contato</a>
    </nav>
    <div class="topo__acoes">
      <a class="topo__contato" href="/contato/"${current === "/contato/" ? ' aria-current="page"' : ""}>Contato</a>
      <button class="busca-btn" aria-label="Buscar no acervo" aria-expanded="false" aria-controls="busca">
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
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
      <a href="/acervo/">Acervo</a><a href="/designers/">Designers</a>${exposicoes.length ? `<a href="/exposicoes/">Exposições</a>` : ""}${diario.length ? `<a href="/diario/">Diário</a>` : ""}
    </div>
    <div class="rodape__links">
      <a href="/restauro/">Restauro</a><a href="/sobre/">Sobre a Voluta</a><a href="${VENDA}">Venda sua peça à Voluta</a><a href="/politica-de-devolucao/">Política de devolução</a>
    </div>
    <div class="rodape__links">
      <a href="mailto:${site.email}">${site.email}</a>
      <a href="${wa("Olá! Vim pelo site da Voluta")}">${esc(site.whatsapp_exibicao)}</a>
      <a href="https://www.instagram.com/${site.instagram}/">@${site.instagram}</a>
    </div>
  </div>
  <p class="rodape__copy">© ${new Date().getFullYear()} Voluta</p>
</footer>
<script src="/js/site.js?v=${V_JS}" defer></script>
</body>
</html>`;

// ---------- componentes ----------
const card = (p, foto) => `<li class="card${p.status === "vendido" ? " card--vendido" : ""}" data-data="${esc(p.data || "")}">
  <a href="/acervo/${p.slug}/">
    <div class="card__img${!foto && p.imagens[1] ? " card__img--troca" : ""}"><img src="${esc(thumb(foto || p.imagens[0], 900))}" alt="${esc(`${p.titulo}, ${nomeDesigner(p.designer)}`)}" loading="lazy">${!foto && p.imagens[1] ? `<img class="card__img2" src="${esc(thumb(p.imagens[1], 900))}" alt="" loading="lazy" aria-hidden="true">` : ""}${p.status === "vendido" ? `<span class="selo">Vendida</span>` : ""}</div>
    <p class="card__designer">${esc(nomeDesigner(p.designer))}</p>
    <h3 class="card__titulo">${esc(p.titulo)}${p.ano ? `, <span class="card__ano">${esc(p.ano)}</span>` : ""}</h3>
  </a>
</li>`;
const cab = (titulo, link, texto, tag = "h2") => `<div class="secao__cab"><${tag}>${esc(titulo)}</${tag}>${link ? `<a href="${link}">${esc(texto)}</a>` : ""}</div>`;
const linkTexto = (href, t, cls = "") => `<a class="link-linha${cls ? " " + cls : ""}" href="${href}">${esc(t)}</a>`;
const cartaoDiario = d => `<li class="ensaio"><a href="/diario/${d.slug}/">
  ${d.capa ? `<div class="ensaio__img"><img src="${esc(thumb(d.capa, 900))}" alt="" loading="lazy"></div>` : ""}
  ${d.categoria ? `<p class="sobretitulo">${esc(d.categoria)}</p>` : ""}
  <h3 class="ensaio__titulo">${esc(d.titulo)}</h3>
  ${d.resumo ? `<p class="ensaio__resumo">${esc(d.resumo)}</p>` : ""}
</a></li>`;
const cartaoExpo = e => `<li class="expo-card"><a href="/exposicoes/${e.slug}/">
  ${e.capa ? `<div class="expo-card__img"><img src="${esc(thumb(e.capa, 1200))}" alt="" loading="lazy"></div>` : ""}
  <p class="sobretitulo">${emCartaz(e) ? "Em cartaz" : "Encerrada"}</p>
  <h3 class="ensaio__titulo">${esc(e.titulo)}</h3>
  <p class="ensaio__resumo">${esc([e.subtitulo, periodo(e)].filter(Boolean).join(" · "))}</p>
</a></li>`;
// Fotos editoriais: grandes, em sequência; duas seguidas sem legenda ficam lado a lado
const sequenciaFotos = (fotos, w = 1800) => {
  const lista = (fotos || []).map(f => typeof f === "string" ? { foto: f } : f).filter(f => f && f.foto);
  const html = []; let i = 0;
  while (i < lista.length) {
    const a = lista[i], b = lista[i + 1];
    const fig = (f, cls = "") => `<figure class="foto${cls}"><img src="${esc(thumb(f.foto, w))}" alt="${esc(f.legenda || f.descricao_foto || "")}" loading="lazy">${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ""}</figure>`;
    if (i > 0 && b && !a.legenda && !b.legenda) { html.push(`<div class="fotos-par">${fig(a)}${fig(b)}</div>`); i += 2; }
    else { html.push(fig(a, " foto--larga")); i += 1; }
  }
  return html.join("\n");
};

// ---------- páginas ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "static"), OUT, { recursive: true });

const disponiveis = pecas.filter(p => p.status !== "vendido");
const vendidos = pecas.filter(p => p.status === "vendido");
const porData = [...disponiveis].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
const tipos = categorias.map(c => ({ nome: c, slug: slugify(c), lista: disponiveis.filter(p => p.categoria === c) }));

// Home: seleção escolhida no painel (peças vendidas saem sozinhas); sem seleção, usa as marcadas e as mais recentes
const selecaoPainel = (site.selecao || []).map(s => ({ p: porSlug[s?.peca], foto: s?.foto || null, n: s?.foto_n })).filter(s => s.p && s.p.status !== "vendido")
  .map(s => ({ p: s.p, foto: s.foto || (s.n > 1 ? s.p.imagens[s.n - 1] : null) }));
const marcadas = disponiveis.filter(p => p.destaque).sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || (b.data || "").localeCompare(a.data || ""));
const selecao = (selecaoPainel.length ? selecaoPainel : [...marcadas, ...porData.filter(p => !marcadas.includes(p))].map(p => ({ p }))).slice(0, 5);
const capa = site.capa?.foto ? site.capa : (site.fotos_capa || []).find(f => f.foto);
const manifesto = site.manifesto || {};
const peca = (s, cls) => `<a class="selecao__item ${cls}" href="/acervo/${s.p.slug}/">
    <div class="selecao__img"><img src="${esc(thumb(s.foto || s.p.imagens[0], 1400))}" alt="${esc(`${s.p.titulo}, ${nomeDesigner(s.p.designer)}`)}" loading="lazy"></div>
    <p class="card__designer">${esc(nomeDesigner(s.p.designer))}</p>
    <p class="card__titulo">${esc(s.p.titulo)}${s.p.ano ? `, <span class="card__ano">${esc(s.p.ano)}</span>` : ""}</p>
  </a>`;
const restauroFotos = (site.restauro_fotos || []).filter(f => f.foto).slice(0, 3);

write("index.html", page({
  url: "/", img: capa?.foto || disponiveis[0]?.imagens[0],
  body: `
<h1 class="visually-hidden">Voluta — mobiliário modernista brasileiro, pesquisado e restaurado em Belo Horizonte</h1>
${capa ? `<section class="capa">
  <img src="${esc(thumb(capa.foto, 2560))}" alt="${esc(capa.descricao_foto || "Voluta")}" fetchpriority="high">
  ${capa.credito ? `<p class="capa__credito">${esc(capa.credito)}</p>` : ""}
</section>` : ""}
<section class="manifesto">
  ${manifesto.sobretitulo ? `<p class="sobretitulo">${esc(manifesto.sobretitulo)}</p>` : ""}
  <p class="manifesto__titulo">${esc(manifesto.titulo || "O Brasil está fadado ao modernismo.")}</p>
  ${manifesto.texto ? `<p class="manifesto__texto">${esc(manifesto.texto)}</p>` : ""}
  ${linkTexto("/sobre/", "Sobre a Voluta")}
</section>
${atual ? `<section class="destaque-expo">
  <a class="destaque-expo__img" href="/exposicoes/${atual.slug}/" tabindex="-1" aria-hidden="true"><img src="${esc(thumb(atual.capa, 1600))}" alt="" loading="lazy"></a>
  <div class="destaque-expo__texto">
    <p class="sobretitulo sobretitulo--vinho">Exposição online</p>
    <h2 class="titulo-grande">${esc(atual.titulo)}</h2>
    <p class="destaque-expo__periodo">${esc([atual.subtitulo, periodo(atual)].filter(Boolean).join(" · "))}</p>
    ${paragrafos(atual.resumo || (atual.texto || "").split(/\n\n+/)[0] || "")}
    ${linkTexto(`/exposicoes/${atual.slug}/`, "Visitar a exposição")}
  </div>
</section>` : ""}
${selecao.length ? `<section class="secao" id="acervo-home">
  ${cab("Seleção do acervo", "/acervo/", "Ver acervo completo")}
  <div class="selecao">
    ${selecao.slice(0, 2).map((s, n) => peca(s, n === 0 ? "selecao__item--grande" : "selecao__item--medio")).join("")}
  </div>
  ${selecao.length > 2 ? `<div class="selecao selecao--linha">${selecao.slice(2).map(s => peca(s, "")).join("")}</div>` : ""}
</section>` : ""}
<section class="faixa-restauro">
  <div class="faixa-restauro__in">
    <div class="faixa-restauro__texto">
      <p class="sobretitulo">Restauro</p>
      <h2 class="titulo-grande">Restaurar não é apagar o tempo.</h2>
      <p>${esc(site.restauro_resumo || "")}</p>
      ${linkTexto("/restauro/", "Conheça o processo", "link-linha--claro")}
    </div>
    ${restauroFotos.length ? `<div class="faixa-restauro__fotos">${restauroFotos.map(f => `<img src="${esc(thumb(f.foto, 1200))}" alt="${esc(f.descricao_foto || "")}" loading="lazy">`).join("")}</div>` : ""}
  </div>
</section>
${diario.length ? `<section class="secao">
  ${cab("Diário", "/diario/", "Todos os ensaios")}
  <ul class="ensaios">${diario.slice(0, 3).map(cartaoDiario).join("")}</ul>
</section>` : ""}
<section class="faixa">
  <p>Novas peças e bastidores, primeiro no Instagram.</p>
  ${linkTexto(`https://www.instagram.com/${site.instagram}/`, `Seguir @${site.instagram}`)}
</section>`,
  jsonld: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FurnitureStore", name: "Voluta", url: site.url, email: site.email, telephone: "+" + site.whatsapp, address: { "@type": "PostalAddress", addressLocality: "Belo Horizonte", addressRegion: "MG", addressCountry: "BR" }, sameAs: [`https://www.instagram.com/${site.instagram}/`] })}</script>`,
}));

// Índice de busca (lido pela lupa do topo)
write("busca.json", JSON.stringify(pecas.map(p => ({
  u: `/acervo/${p.slug}/`, t: p.titulo, d: nomeDesigner(p.designer), c: p.categoria, m: p.materiais || "", a: p.ano || "",
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
    <ul>${designers.map(d => item(`/designers/${slugify(d)}/`, nomeDesigner(d), pecas.filter(p => p.designer === d && p.status !== "vendido").length, "designer:" + slugify(d))).join("")}</ul>
  </div>
  ${vendidos.length ? `<div class="lateral__grupo"><h2>Disponibilidade</h2><ul>${item("/acervo/", "Disponíveis", disponiveis.length, "disp")}${item("/acervo/vendidas/", "Vendidas", vendidos.length, "vendidas")}</ul></div>` : ""}
</aside>`;
};

const listagem = ({ rel, url, titulo, sub = "", lista, ativo, desc, current = "/acervo/", vendidas = [], antes = "" }) => write(rel, page({
  title: titulo === "Acervo" ? "Acervo" : `${titulo} | Acervo`, url, current, desc, img: lista[0]?.imagens[0],
  body: `${antes}
<div class="acervo">
  ${lado(ativo)}
  <section class="acervo__conteudo">
    <div class="acervo__cab">
      <div>
        ${antes ? `<h2 class="titulo-pagina">No acervo</h2>` : `<h1 class="titulo-pagina">${esc(titulo)}</h1>`}
        ${sub && !antes ? `<p class="subtitulo">${esc(sub)}</p>` : ""}
      </div>
      <div class="acervo__ferramentas">
        <button class="filtrar-btn" aria-expanded="false" aria-controls="lateral">Filtrar</button>
      </div>
    </div>
    <p class="contagem">${lista.length} ${lista.length === 1 ? "peça disponível" : "peças disponíveis"}</p>
    ${lista.length ? `<ul class="grade grade--acervo" id="grade-acervo">${lista.map(p => card(p)).join("")}</ul>` : `<p class="vazio">Nenhuma peça disponível aqui no momento. <a href="${wa(`Olá! Procuro peças de ${titulo}. Vocês têm algo chegando?`)}">Registre seu interesse</a> e avisamos quando chegar.</p>`}
    ${vendidas.length ? `<div class="ja-vendidas">${cab("Já passaram pela Voluta")}<ul class="grade grade--acervo">${vendidas.map(p => card(p)).join("")}</ul></div>` : ""}
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

// Designers: com bio cadastrada no painel, a página ganha abertura editorial; sem bio, fica só a listagem
designers.forEach(d => {
  const f = fichasDesigner[d] || {};
  const lista = ordenarData(disponiveis.filter(p => p.designer === d));
  const nome = nomeDesigner(d);
  const crono = (f.cronologia || []).filter(c => c && (c.ano || c.fato));
  const antes = f.bio || f.resumo ? `
<section class="designer">
  <div class="designer__cab">
    <div>
      <p class="sobretitulo"><a href="/designers/">Designers</a>${f.info ? ` · ${esc(f.info)}` : ""}</p>
      <h1 class="designer__nome">${esc(nome)}</h1>
    </div>
    ${f.resumo ? `<p class="designer__resumo">${esc(f.resumo)}</p>` : ""}
  </div>
</section>
${f.foto ? `<img class="designer__foto" src="${esc(thumb(f.foto, 2400))}" alt="" loading="lazy">` : ""}
${f.bio || crono.length ? `<section class="designer__corpo">
  ${f.bio ? `<div class="designer__bio texto-longo">${paragrafos(f.bio)}</div>` : ""}
  ${crono.length ? `<aside class="cronologia"><h2>Cronologia</h2><dl>${crono.map(c => `<dt>${esc(c.ano || "")}</dt><dd>${esc(c.fato || "")}</dd>`).join("")}</dl></aside>` : ""}
</section>` : ""}` : "";
  listagem({ rel: `designers/${slugify(d)}/index.html`, url: `/designers/${slugify(d)}/`, titulo: nome, sub: site.designers[d] || "", lista, vendidas: ordenarData(vendidos.filter(p => p.designer === d)), ativo: "designer:" + slugify(d),
    desc: f.resumo || `Peças de ${nome} no acervo da Voluta.`, current: "/designers/", antes });
});

// Peças
const linha = (rot, val) => val ? `<dt>${rot}</dt><dd>${esc(val)}</dd>` : "";
pecas.forEach((p, i) => {
  const url = `/acervo/${p.slug}/`;
  const nome = nomeDesigner(p.designer);
  const msg = `Olá! Gostaria de mais informações sobre a peça "${p.titulo}" (${nome})${p.codigo ? `, código ${p.codigo}` : ""}. ${site.url}${url}`;
  const mesmos = pecas.filter(o => o !== p && o.designer === p.designer && o.status !== "vendido").slice(0, 3);
  const outros = mesmos.length ? mesmos : pecas.filter(o => o !== p && o.categoria === p.categoria && o.status !== "vendido").slice(0, 3);
  const ant = pecas[(i - 1 + pecas.length) % pecas.length], prox = pecas[(i + 1) % pecas.length];
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.titulo, description: p.descricao, image: p.imagens.map(u => thumb(u, 1600)), brand: { "@type": "Brand", name: p.designer } };
  const alt = `${p.titulo}, ${nome}`;
  const fotos = p.imagens.map((u, n) => `<figure class="foto${n === 0 || (n === p.imagens.length - 1 && n % 2 === 1) ? " foto--larga" : ""}"><img src="${esc(thumb(u, 1800))}" alt="${esc(n === 0 ? alt : `${alt}, foto ${n + 1}`)}"${n ? ' loading="lazy"' : ' fetchpriority="high"'}></figure>`);
  const restauro = p.restauro_mantido || p.restauro_refeito || p.restauro_oficina;
  const expo = exposicoes.find(e => (e.pecas || []).includes(p.slug));
  write(`acervo/${p.slug}/index.html`, page({
    title: `${p.titulo}, ${nome}`, url, current: "/acervo/", img: p.imagens[0],
    desc: p.descricao.slice(0, 155),
    jsonld: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    body: `
<nav class="migalha" aria-label="Você está em"><a href="/acervo/">Acervo</a> · <a href="/acervo/tipo/${slugify(p.categoria)}/">${esc(p.categoria)}</a> · <a href="/designers/${slugify(p.designer)}/">${esc(nome)}</a></nav>
<article class="peca">
  <div class="galeria" aria-label="Fotos da peça">${fotos.join("")}</div>
  <div class="ficha">
    <p class="ficha__designer"><a href="/designers/${slugify(p.designer)}/">${esc(nome)}</a></p>
    ${site.designers[p.designer] && p.designer !== "Anônimo" ? `<p class="ficha__info">${esc(site.designers[p.designer])}</p>` : ""}
    <h1 class="ficha__titulo">${esc(p.titulo)}</h1>
    ${p.ano || p.fabricante ? `<p class="ficha__ano">${esc([p.fabricante, p.ano].filter(Boolean).join(", "))}</p>` : ""}
    <dl class="ficha__dados">
      ${linha("Fabricante", p.fabricante)}
      ${linha("Materiais", p.materiais)}
      ${linha("Dimensões", p.dimensoes)}
      ${linha("Estado", p.estado)}
      ${linha("Procedência", p.procedencia)}
      ${linha("Referência", p.codigo)}
    </dl>
    ${p.status === "vendido"
      ? `<p class="ficha__preco">Vendida</p><a class="botao botao--linha" href="${wa(`Olá! Vi a peça vendida "${p.titulo}" no site. Vocês têm algo parecido?`)}">Procurar peça semelhante</a>`
      : `<a class="botao" href="${wa(msg)}" data-evento="interesse">Solicitar informações</a>
         <p class="ficha__obs">Valor sob consulta. Atendimento reservado por mensagem ou e-mail.</p>
         <div class="cta-fixo"><a class="botao" href="${wa(msg)}" data-evento="interesse">Solicitar informações</a></div>`}
    ${p.descricao ? `<div class="ficha__texto">${paragrafos(p.descricao)}</div>` : ""}
    ${fichasDesigner[p.designer]?.bio ? `<p>${linkTexto(`/designers/${slugify(p.designer)}/`, "Ler sobre o designer")}</p>` : ""}
    ${expo ? `<p class="ficha__expo">Esta peça integra a exposição <a href="/exposicoes/${expo.slug}/">${esc(expo.titulo)}</a>.</p>` : ""}
    ${(() => { return `<div class="compartilhar" data-url="${site.url}${url}" data-titulo="${esc(alt)}">
      <button type="button" class="compartilhar__btn" aria-expanded="false" aria-controls="compartilhar-${p.slug}">${ICONE.compartilhar}<span>Compartilhar</span></button>
      <ul class="compartilhar__opcoes" id="compartilhar-${p.slug}" hidden>
        <li><a href="https://wa.me/?text=${encodeURIComponent(`Olha essa peça da Voluta: ${alt}\n${site.url}${url}`)}" target="_blank" rel="noopener" data-rede="whatsapp">WhatsApp</a></li>
        <li><button type="button" data-rede="copiar">Copiar link</button></li>
        <li><a href="mailto:?subject=${encodeURIComponent(`${alt} · Voluta`)}&body=${encodeURIComponent(`Olha essa peça da Voluta:\n${site.url}${url}`)}" data-rede="email">E-mail</a></li>
      </ul>
      <span class="compartilhar__aviso" role="status" aria-live="polite"></span>
    </div>`; })()}
  </div>
</article>
${restauro ? `<section class="registro">
  <div class="registro__in">
    ${p.imagens[1] ? `<img src="${esc(thumb(p.imagens[1], 1200))}" alt="" loading="lazy">` : ""}
    <div>
      <p class="sobretitulo sobretitulo--vinho">Registro de restauro</p>
      <h2 class="titulo-medio">O que foi feito, o que foi mantido</h2>
      <dl class="ficha__dados ficha__dados--simples">${linha("Mantido", p.restauro_mantido)}${linha("Refeito", p.restauro_refeito)}${linha("Oficina", p.restauro_oficina)}</dl>
    </div>
  </div>
</section>` : ""}
<nav class="vizinhas" aria-label="Outras peças"><a href="/acervo/${ant.slug}/">Peça anterior</a><a href="/acervo/${prox.slug}/">Próxima peça</a></nav>
${outros.length ? `<section class="secao">${cab(mesmos.length ? `Mais de ${nome}` : `Outras ${p.categoria.toLowerCase()}`)}<ul class="grade grade--3">${outros.map(o => card(o)).join("")}</ul></section>` : ""}`,
  }));
});

// Designers (índice)
write("designers/index.html", page({
  title: "Designers", url: "/designers/", current: "/designers/",
  desc: "Designers e fabricantes do modernismo brasileiro e internacional presentes no acervo da Voluta.",
  body: `<section class="secao indice indice--pagina"><h1 class="titulo-pagina">Designers e fabricantes</h1><ul class="indice__lista">${designers.map(d => `<li><a href="/designers/${slugify(d)}/"><span class="indice__nome">${esc(nomeDesigner(d))}</span><span class="indice__info">${esc(d === "Anônimo" ? "" : site.designers[d] || "")}</span></a></li>`).join("")}</ul></section>`,
}));

// Exposições
if (exposicoes.length) {
  const correntes = exposicoes.filter(emCartaz), anteriores = exposicoes.filter(e => !emCartaz(e));
  write("exposicoes/index.html", page({
    title: "Exposições", url: "/exposicoes/", current: "/exposicoes/",
    desc: "Exposições online da Voluta: recortes curatoriais de mobiliário modernista brasileiro.",
    body: `<section class="secao">
  <h1 class="titulo-pagina">Exposições</h1>
  ${correntes.map(e => `<a class="expo-abertura" href="/exposicoes/${e.slug}/">
    ${e.capa ? `<img src="${esc(thumb(e.capa, 2400))}" alt="" loading="lazy">` : ""}
    <div><p class="sobretitulo sobretitulo--vinho">Em cartaz</p><h2 class="titulo-grande">${esc(e.titulo)}</h2><p class="destaque-expo__periodo">${esc([e.subtitulo, periodo(e)].filter(Boolean).join(" · "))}</p>${e.resumo ? `<p>${esc(e.resumo)}</p>` : ""}</div>
  </a>`).join("")}
</section>
${anteriores.length ? `<section class="secao">${cab("Exposições anteriores")}<ul class="ensaios">${anteriores.map(cartaoExpo).join("")}</ul></section>` : ""}`,
  }));
  exposicoes.forEach(e => {
    const lista = pecasDe(e.pecas);
    write(`exposicoes/${e.slug}/index.html`, page({
      title: e.titulo, url: `/exposicoes/${e.slug}/`, current: "/exposicoes/", img: e.capa, desc: e.resumo || "",
      body: `
<section class="editorial__cab">
  <p class="sobretitulo"><a href="/exposicoes/">Exposições</a> · ${emCartaz(e) ? "Em cartaz" : "Encerrada"}</p>
  <h1 class="editorial__titulo">${esc(e.titulo)}</h1>
  <p class="editorial__sub">${esc([e.subtitulo, periodo(e)].filter(Boolean).join(" · "))}</p>
</section>
${e.capa ? `<img class="editorial__capa" src="${esc(thumb(e.capa, 2560))}" alt="" fetchpriority="high">` : ""}
<section class="editorial__corpo texto-longo">${paragrafos(e.texto || "")}</section>
${(e.fotos || []).length ? `<section class="editorial__fotos">${sequenciaFotos(e.fotos)}</section>` : ""}
${lista.length ? `<section class="secao">${cab("Peças da exposição", "/acervo/", "Ver acervo completo")}<ul class="grade grade--3">${lista.map(p => card(p)).join("")}</ul></section>` : ""}`,
    }));
  });
}

// Diário
if (diario.length) {
  write("diario/index.html", page({
    title: "Diário", url: "/diario/", current: "/diario/",
    desc: "Ensaios da Voluta sobre designers, fabricantes, materiais e restauro do mobiliário modernista brasileiro.",
    body: `<section class="secao"><h1 class="titulo-pagina">Diário</h1><p class="subtitulo">Designers, fabricantes, materiais e bastidores do acervo.</p><ul class="ensaios">${diario.map(cartaoDiario).join("")}</ul></section>`,
  }));
  diario.forEach(d => {
    const lista = pecasDe(d.pecas);
    write(`diario/${d.slug}/index.html`, page({
      title: d.titulo, url: `/diario/${d.slug}/`, current: "/diario/", img: d.capa, desc: d.resumo || "",
      jsonld: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: d.titulo, datePublished: d.data, image: d.capa ? [site.url + d.capa] : undefined, publisher: { "@type": "Organization", name: "Voluta" } })}</script>`,
      body: `
<section class="editorial__cab">
  <p class="sobretitulo"><a href="/diario/">Diário</a>${d.categoria ? ` · ${esc(d.categoria)}` : ""}</p>
  <h1 class="editorial__titulo editorial__titulo--medio">${esc(d.titulo)}</h1>
  ${d.data ? `<p class="editorial__sub">${esc(dataLonga(d.data))}</p>` : ""}
</section>
${d.capa ? `<img class="editorial__capa" src="${esc(thumb(d.capa, 2560))}" alt="" fetchpriority="high">` : ""}
<section class="editorial__corpo texto-longo">${paragrafos(d.texto || "")}</section>
${(d.fotos || []).length ? `<section class="editorial__fotos">${sequenciaFotos(d.fotos)}</section>` : ""}
${lista.length ? `<section class="secao">${cab("Peças citadas")}<ul class="grade grade--3">${lista.map(p => card(p)).join("")}</ul></section>` : ""}
${diario.length > 1 ? `<section class="secao">${cab("Outros ensaios", "/diario/", "Todos os ensaios")}<ul class="ensaios">${diario.filter(x => x !== d).slice(0, 3).map(cartaoDiario).join("")}</ul></section>` : ""}`,
    }));
  });
}

// Páginas de texto
const textoPagina = (rel, titulo, texto, current, img) => write(rel, page({
  title: titulo, url: "/" + rel.replace("index.html", ""), current,
  body: `<section class="secao texto">${img ? `<img class="texto__img" src="${esc(thumb(img, 1600))}" alt="">` : ""}<div class="texto__corpo"><h1 class="titulo-pagina">${esc(titulo)}</h1>${paragrafos(texto)}</div></section>`,
}));
textoPagina("sobre/index.html", "Sobre a Voluta", site.sobre, "/sobre/", site.imagem_sobre);
const restauroCasos = (site.restauro_casos || []).filter(c => c && (c.titulo || c.texto));
const casosHtml = restauroCasos.length ? `<section class="casos" aria-labelledby="casos-titulo">
  <div class="casos__cab"><h2 id="casos-titulo">Exemplos de restauro</h2></div>
  ${restauroCasos.map((c, i) => {
    const fotos = (c.fotos || []).map(f => typeof f === "string" ? f : f?.foto).filter(Boolean).slice(0, 8);
    return `<article class="caso${fotos.length ? "" : " caso--sem-foto"}">
    ${fotos.length ? `<div class="caso__fotos caso__fotos--${fotos.length}${fotos.length > 1 && fotos.length % 2 === 0 ? " caso__fotos--fecha" : ""}">${fotos.map((f, j) => `<img src="${esc(thumb(f, j === 0 ? 1600 : 1000))}" alt="${esc(c.titulo || "")}${fotos.length > 1 ? ` — foto ${j + 1}` : ""}" loading="lazy">`).join("")}</div>` : ""}
    <div class="caso__texto">
      <p class="caso__num">${String(i + 1).padStart(2, "0")}</p>
      <h3>${esc(c.titulo || "")}</h3>
      ${paragrafos(c.texto || "")}
    </div>
  </article>`;
  }).join("\n  ")}
</section>` : "";
write("restauro/index.html", page({
  title: "Restauro", url: "/restauro/", current: "/restauro/",
  body: `<section class="secao texto">${restauroFotos[0]?.foto ? `<img class="texto__img" src="${esc(thumb(restauroFotos[0].foto, 1600))}" alt="">` : ""}<div class="texto__corpo"><h1 class="titulo-pagina">Restauro</h1>${paragrafos(site.restauro)}</div></section>${casosHtml}`,
}));
textoPagina("politica-de-devolucao/index.html", "Política de devolução", site.devolucao, "");

write("contato/index.html", page({
  title: "Contato", url: "/contato/", current: "/contato/",
  body: `<section class="secao texto"><div class="texto__corpo">
  <h1 class="titulo-pagina">Contato</h1>
  <p>O atendimento é reservado e feito direto com a gente, por mensagem ou e-mail.</p>
  <ul class="contatos">
    <li><a class="botao com-ico" href="${wa("Olá! Vim pelo site da Voluta")}">${ICONE.wa}<span>Enviar mensagem</span></a></li>
    <li><a class="com-ico" href="${wa("Olá! Vim pelo site da Voluta")}">${ICONE.wa}<span>${esc(site.whatsapp_exibicao)}</span></a></li>
    <li><a class="com-ico" href="mailto:${site.email}">${ICONE.email}<span>${site.email}</span></a></li>
    <li><a class="com-ico" href="https://www.instagram.com/${site.instagram}/">${ICONE.ig}<span>@${site.instagram}</span></a></li>
    <li><span class="com-ico">${ICONE.local}<span>${esc(site.cidade)}</span></span></li>
  </ul>
  <h2>Quer vender uma peça?</h2>
  <p>Compramos mobiliário modernista dos anos 1950 a 1980. <a href="${VENDA}">Envie as fotos da sua peça</a>.</p>
</div></section>`,
}));

write("404.html", page({ title: "Página não encontrada", body: `<section class="secao texto"><div class="texto__corpo"><h1 class="titulo-pagina">Esta página não existe mais</h1><p>A peça pode ter sido vendida ou mudado de endereço.</p><p><a class="botao" href="/acervo/">Ver o acervo</a></p></div></section>` }));

// SEO: sitemap, robots
const urls = ["/", "/acervo/", "/designers/", "/sobre/", "/restauro/", "/contato/", "/politica-de-devolucao/",
  ...(exposicoes.length ? ["/exposicoes/", ...exposicoes.map(e => `/exposicoes/${e.slug}/`)] : []),
  ...(diario.length ? ["/diario/", ...diario.map(d => `/diario/${d.slug}/`)] : []),
  ...pecas.map(p => `/acervo/${p.slug}/`), ...designers.map(d => `/designers/${slugify(d)}/`), ...tipos.map(t => `/acervo/tipo/${t.slug}/`)];
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
const CATS_ANTIGAS = { "1-poltronas": "Poltronas", "4-cadeiras": "Cadeiras", "5-mesas-de-centro": "Mesas de centro", "9-sofas": "Sofás", "6-mesas-laterais": "Mesas laterais", "2-bancos": "Bancos", "15-buffet": "Aparadores/Buffet", "8-escrivaninhas": "Escrivaninhas", "10-mesas-de-jantar": "Mesas de jantar" };
especificos.push("/acervo/tipo/buffets/*  /acervo/tipo/aparadores-buffet/  301");
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
