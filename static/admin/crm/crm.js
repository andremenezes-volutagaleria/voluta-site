// CRM da Voluta: custos, vendas, despesas e clientes.
// Os dados financeiros ficam no repositório PRIVADO voluta-crm (nunca no voluta-site, que é público).
// O status das peças é ligado ao site pelo código VLT: o que muda no site aparece aqui,
// e uma venda registrada aqui marca a ficha do site como Vendido (fica esperando o botão "Publicar site").
(() => {
  const SITE = { dono: "andremenezes-volutagaleria", nome: "voluta-site", ramo: "main", pasta: "content/pecas" };
  const CRM = { dono: "andremenezes-volutagaleria", nome: "voluta-crm", ramo: "main" };
  const ARQUIVOS = ["inventario", "vendas", "despesas", "clientes"];
  const CATEGORIAS = ["Poltronas", "Cadeiras", "Sofás", "Mesas de centro", "Mesas laterais", "Mesas de jantar", "Bancos", "Aparadores/Buffet", "Escrivaninhas", "Iluminação", "Objetos"];
  const PADRAO = { custo_op: 100, nf: 0.04, leiloeiro: 0.05, taxas: { "Pix / à vista": 0, "Crédito à vista": 0.042, "2x": 0.0609, "3x": 0.0701, "4x": 0.0791, "5x": 0.088, "6x": 0.0967, "7x": 0.1259, "8x": 0.1342, "9x": 0.1425, "10x": 0.1506, "11x": 0.1587, "12x": 0.1666, "Permuta": 0 } };
  const COR = { vinho: "#9E3A4E", mostarda: "#BF9A2F", azul: "#2a78d6", verde: "#1baf7a", barro: "#BD4513", grade: "#EFEBE7", eixo: "#7A6E70" };

  const app = document.getElementById("app");
  const dlg = document.getElementById("dlg"), dlgCorpo = document.getElementById("dlg-corpo");
  const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const R = v => brl0.format(Math.round(v || 0));
  const P = v => (isFinite(v) ? (v * 100).toFixed(0) + "%" : "—");
  const dataBR = d => d ? d.slice(0, 10).split("-").reverse().join("/") : "";
  const hoje = () => new Date().toISOString().slice(0, 10);
  const dias = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 864e5) : null;
  // Aceita número, "1234.5" (campo numérico) ou "1.234,50" (digitado no formato brasileiro)
  const n = v => {
    if (typeof v === "number") return isFinite(v) ? Math.round(v * 10000) / 10000 : 0;
    let s = String(v ?? "").replace(/R\$|\s/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");          // 1.234,50
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");      // 1.500 = mil e quinhentos
    const x = parseFloat(s); return isFinite(x) ? Math.round(x * 10000) / 10000 : 0;
  };
  const numCel = v => n(v) ? n(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const rotMes = m => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
  const ROT_ST = { disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };

  // ---------- GitHub ----------
  let token = null;
  try { token = JSON.parse(localStorage.getItem("decap-cms-user") || "null")?.token; } catch {}
  const gh = (repo, caminho, opts = {}) => fetch(`https://api.github.com/repos/${repo.dono}/${repo.nome}${caminho}`, {
    cache: "no-store", ...opts, headers: { Authorization: "token " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
  });
  const b64 = s => { const b = new TextEncoder().encode(s); let t = ""; for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(t); };
  const deb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
  async function ler(repo, caminho) {
    const r = await gh(repo, `/contents/${caminho}?ref=${repo.ramo}`);
    if (r.status === 404) return null;
    if (r.status === 401) throw new Error("login");
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    const j = await r.json();
    return { sha: j.sha, json: JSON.parse(deb64(j.content)) };
  }
  async function gravar(repo, caminho, obj, sha, msg) {
    const r = await gh(repo, `/contents/${caminho}`, { method: "PUT", body: JSON.stringify({ message: msg, content: b64(JSON.stringify(obj, null, 1) + "\n"), branch: repo.ramo, ...(sha ? { sha } : {}) }) });
    if (r.status === 409 || r.status === 422) throw new Error("conflito");
    if (r.status === 401) throw new Error("login");
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    return (await r.json()).content.sha;
  }

  // ---------- Estado ----------
  const D = { inventario: { meta: {}, itens: [] }, vendas: { itens: [] }, despesas: { itens: [] }, clientes: { itens: [] } };
  const SHA = {};
  let fichas = [];                 // fichas do site: { arquivo, dados }
  let fichaDe = {};                // código VLT -> ficha
  let aba = "painel", periodo = "tudo";
  const graficos = [];
  try { aba = localStorage.getItem("crm-aba") || "painel"; periodo = localStorage.getItem("crm-periodo") || "tudo"; } catch {}

  const par = () => ({ ...PADRAO, ...(D.inventario.meta?.parametros || {}), taxas: { ...PADRAO.taxas, ...(D.inventario.meta?.parametros?.taxas || {}) } });
  const pecas = () => D.inventario.itens;
  const peca = cod => pecas().find(p => p.codigo === cod);
  const cliente = id => D.clientes.itens.find(c => c.id === id);
  const custoPeca = p => n(p.compra) + n(p.frete) + n(p.restauro) + n(p.nf) + n(p.leiloeiro);       // sem o custo operacional
  const custoTotal = p => custoPeca(p) + n(p.custo_op);
  const lucroPrev = p => n(p.preco_pix) - custoTotal(p);
  const liquido = v => n(v.valor) * (1 - n(v.taxa));
  const lucroVenda = v => liquido(v) - n(v.custo) - n(v.custo_op);
  const codigosDe = s => (String(s || "").toUpperCase().match(/VLT-\d+/g) || []);
  const fotoDe = cod => { const f = fichaDe[cod]; const u = f?.dados?.imagens?.find(Boolean); return !u ? "" : u.includes("static-assets.artlogic.net") ? u.replace(/w_\d+,h_\d+,c_limit/, "w_100,h_100,c_limit") : u; };
  // Fotos enviadas pelo CRM ficam no repositório privado (pasta fotos/); como não têm endereço público,
  // são baixadas com o login e mostradas a partir da memória do navegador.
  const fotosCRM = {};
  const urlFotoCRM = caminho => fotosCRM[caminho] ||= fetch(`https://api.github.com/repos/${CRM.dono}/${CRM.nome}/contents/${caminho}?ref=${CRM.ramo}`,
    { cache: "no-store", headers: { Authorization: "token " + token, Accept: "application/vnd.github.raw" } })
    .then(r => r.ok ? r.blob() : null).then(b => b ? URL.createObjectURL(b) : "").catch(() => "");
  const hidratarFotos = raiz => raiz?.querySelectorAll("img[data-crmfoto]").forEach(img => {
    const c = img.dataset.crmfoto; img.removeAttribute("data-crmfoto");
    urlFotoCRM(c).then(u => { if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement("div"), { className: "sf" })); });
  });
  const miniatura = p => p.foto ? `<img data-crmfoto="${e(p.foto)}" alt="" loading="lazy">` : fotoDe(p.codigo) ? `<img src="${e(fotoDe(p.codigo))}" alt="" loading="lazy">` : `<div class="sf"></div>`;
  // Reduz a foto (no máximo 1400 px, JPEG) antes de enviar, respeitando a rotação do celular
  async function reduzirFoto(arq) {
    const bmp = await createImageBitmap(arq, { imageOrientation: "from-image" });
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const cv = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    return new Promise((ok, erro) => cv.toBlob(b => b ? ok(b) : erro(new Error("Não consegui ler a imagem.")), "image/jpeg", 0.84));
  }
  async function enviarFoto(blob, codigo) {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let t = "";
    for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const caminho = `fotos/${codigo}-${Date.now().toString(36)}.jpg`;
    const r = await gh(CRM, `/contents/${caminho}`, { method: "PUT", body: JSON.stringify({ message: `CRM: foto de ${codigo}`, content: btoa(t), branch: CRM.ramo }) });
    if (r.status === 401) throw new Error("Seu login expirou. Entre de novo no painel.");
    if (!r.ok) throw new Error(`Não consegui enviar a foto (GitHub respondeu ${r.status}).`);
    fotosCRM[caminho] = Promise.resolve(URL.createObjectURL(blob));
    return caminho;
  }
  async function apagarFoto(caminho) {          // limpeza da foto antiga; se falhar, não atrapalha nada
    try {
      const r = await gh(CRM, `/contents/${caminho}?ref=${CRM.ramo}`); if (!r.ok) return;
      const { sha } = await r.json();
      await gh(CRM, `/contents/${caminho}`, { method: "DELETE", body: JSON.stringify({ message: `CRM: remove foto antiga`, sha, branch: CRM.ramo }) });
    } catch {}
  }
  // Marcadores de acompanhamento da peça (bolinhas na tabela e caixas no formulário)
  const MARCAS = [["em_restauro", "Em restauro"], ["entregue", "Entregue"], ["foto_tirada", "Foto tirada"], ["foto_postada", "Foto postada"]];
  // Data de hoje no fuso do computador (a postagem das 22h fica no dia certo, não no dia seguinte)
  const hojeLocal = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const linhaDe = el => document.getElementById("corpo")?._linhas?.[+el.closest("tr")?.dataset.l];
  const linkSeguro = u => /^https?:\/\//i.test(u || "") ? u : u ? "https://" + u : "";
  const vendaDe = cod =>D.vendas.itens.filter(v => v.codigo === cod).sort((a, b) => a.data.localeCompare(b.data))[0];
  const proxId = (lista, pre) => pre + String(Math.max(0, ...lista.map(x => parseInt(String(x.id || "").slice(1)) || 0)) + 1).padStart(3, "0");
  const proxCodigo = () => "VLT-" + String(Math.max(0, ...pecas().map(p => parseInt(p.codigo.slice(4)) || 0), ...Object.keys(fichaDe).map(c => parseInt(c.slice(4)) || 0)) + 1).padStart(3, "0");

  async function salvar(nome, msg) {
    try { SHA[nome] = await gravar(CRM, `${nome}.json`, D[nome], SHA[nome], `CRM: ${msg}`); }
    catch (err) {
      if (err.message === "conflito") throw new Error("Os dados mudaram em outro lugar (outra aba ou computador). Recarregue a página e faça a alteração de novo.");
      if (err.message === "login") throw new Error("Seu login expirou. Entre de novo no painel.");
      throw err;
    }
  }

  // O status de cada peça segue o site; quando a ficha está oculta, vale o status do CRM.
  function sincronizarDoSite() {
    const mudou = [];
    for (const p of pecas()) {
      const s = fichaDe[p.codigo]?.dados?.status;
      if ((s === "disponivel" || s === "vendido") && s !== p.status && !(s === "disponivel" && p.status === "reservado")) { mudou.push(`${p.codigo} → ${ROT_ST[s]}`); p.status = s; }
    }
    return mudou;
  }
  // Leva o status do CRM para as fichas do site (sem publicar: entra na fila do botão "Publicar site").
  async function refletirNoSite(codigos) {
    const feitas = new Set(), avisos = [];
    for (const cod of codigos) {
      const f = fichaDe[cod];
      if (!f || feitas.has(f.arquivo)) continue;
      feitas.add(f.arquivo);
      const ps = codigosDe(f.dados.codigo).map(peca).filter(Boolean);
      const novo = ps.length && ps.every(p => p.status === "vendido") ? "vendido" : ps.some(p => p.status !== "vendido") ? "disponivel" : null;
      if (!novo || f.dados.status === "oculto" || f.dados.status === novo) continue;
      try {
        const cam = `${SITE.pasta}/${f.arquivo}`, atual = await ler(SITE, cam);
        if (!atual) continue;
        atual.json.status = novo;
        await gravar(SITE, cam, atual.json, atual.sha, `Alteração: ${f.arquivo.replace(/\.json$/, "")} [skip netlify]`);
        f.dados.status = novo;
      } catch { avisos.push(f.dados.titulo || f.arquivo); }
    }
    if (feitas.size) window.dispatchEvent(new Event("focus"));     // atualiza a contagem do botão "Publicar site"
    return avisos;
  }

  // ---------- Carregar ----------
  const avisoTela = (msg, botao = "") => { app.innerHTML = `<div class="aviso"><p>${msg}</p>${botao}</div>`; };
  const pedirLogin = msg => avisoTela(e(msg), `<a class="bt bt--prim" href="/admin/editar/">Entrar com GitHub</a><p style="margin-top:14px;font-size:12px;color:var(--cinza)">Depois de entrar, volte para <a href="/admin/crm/">/admin/crm</a>.</p>`);
  if (!token) return pedirLogin("Entre com sua conta do GitHub para abrir o CRM.");

  async function carregarFichas() {
    const q = `query($dono:String!,$nome:String!,$expr:String!){repository(owner:$dono,name:$nome){object(expression:$expr){...on Tree{entries{name object{...on Blob{text}}}}}}}`;
    const r = await fetch("https://api.github.com/graphql", { method: "POST", headers: { Authorization: "bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, variables: { dono: SITE.dono, nome: SITE.nome, expr: `${SITE.ramo}:${SITE.pasta}` } }) });
    if (r.status === 401) throw new Error("login");
    const j = await r.json(), ent = j?.data?.repository?.object?.entries;
    if (!ent) throw new Error(j?.errors?.[0]?.message || "sem dados do site");
    fichas = ent.filter(x => x.name.endsWith(".json") && x.object?.text).map(x => ({ arquivo: x.name, dados: JSON.parse(x.object.text) }));
    fichaDe = {};
    for (const f of fichas) for (const c of codigosDe(f.dados.codigo)) fichaDe[c] = f;
    window.VOLUTA_INV = { repo: SITE, token, fichas };
    document.dispatchEvent(new CustomEvent("inventario-pronto"));
  }

  async function carregar() {
    try {
      const repoOk = await gh(CRM, "");
      if (repoOk.status === 401) throw new Error("login");
      if (repoOk.status === 404) return avisoTela(`Não encontrei o repositório privado <b>voluta-crm</b>.<br>Confira se ele foi criado na conta ${e(CRM.dono)}. Se já existe, saia e entre de novo no painel para renovar a permissão.`, `<a class="bt" href="/admin/editar/">Abrir o painel</a>`);
      const [, painelSalvo, contasSalvo, ...arqs] = await Promise.all([carregarFichas(), ler(CRM, "dashboard.json").catch(() => null), ler(CRM, "contas.json").catch(() => null), ...ARQUIVOS.map(a => ler(CRM, `${a}.json`))]);
      if (contasSalvo?.json?.lancamentos) { D.contas = contasSalvo.json; SHA.contas = contasSalvo.sha; } else D.contas = { saldo: { valor: 0, data: hoje() }, variavel: null, horizonte: "fim", fixos: [], lancamentos: [] };
      if (arqs.every(x => !x)) return telaImportar();
      if (painelSalvo?.json?.widgets) { D.dashboard = painelSalvo.json; SHA.dashboard = painelSalvo.sha; } else D.dashboard = painelExemplo();
      ARQUIVOS.forEach((a, i) => { if (arqs[i]) { D[a] = arqs[i].json; SHA[a] = arqs[i].sha; } D[a].itens ||= []; });
      const mud = sincronizarDoSite();
      if (mud.length) { try { await salvar("inventario", `status atualizado pelo site (${mud.length})`); } catch {} }
      montar(mud.length ? `${mud.length} ${mud.length === 1 ? "peça teve" : "peças tiveram"} o status atualizado pelo site: ${mud.slice(0, 6).join(", ")}${mud.length > 6 ? "…" : ""}` : "");
    } catch (err) {
      if (err.message === "login") return pedirLogin("Seu login expirou. Entre de novo para abrir o CRM.");
      avisoTela(`Não foi possível carregar o CRM (${e(err.message)}). Recarregue a página.`);
    }
  }

  function telaImportar() {
    avisoTela(`O repositório <b>voluta-crm</b> está vazio. Envie os arquivos de dados iniciais (inventario.json, vendas.json, despesas.json e clientes.json).`,
      `<input type="file" id="imp" accept=".json,application/json" multiple><p id="imp-msg" class="form__msg"></p>`);
    document.getElementById("imp").addEventListener("change", async ev => {
      const msg = document.getElementById("imp-msg");
      try {
        for (const f of ev.target.files) {
          const nome = f.name.replace(/\.json$/i, "").toLowerCase();
          if (!ARQUIVOS.includes(nome)) continue;
          D[nome] = JSON.parse(await f.text()); msg.textContent = `Enviando ${f.name}…`;
          await salvar(nome, `dados iniciais (${nome})`);
        }
        msg.textContent = "Pronto. Carregando…"; carregar();
      } catch (err) { msg.textContent = "Não foi possível enviar: " + err.message; }
    });
  }

  // ---------- Montagem ----------
  function montar(faixa = "") {
    app.innerHTML = `
      ${faixa ? `<div class="aviso-crm aviso-crm--ok" role="status">${e(faixa)}</div>` : ""}
      <div class="abas" role="tablist">
        ${[["painel", "Painel"], ["montar", "Montar painel"], ["inventario", "Inventário"], ["vendas", "Vendas"], ["despesas", "Despesas"], ["contas", "Contas"], ["clientes", "Clientes"]].map(([k, r]) =>
          `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${r}</button>`).join("")}
      </div>
      <div id="conteudo"></div>`;
    app.querySelectorAll("[data-aba]").forEach(b => b.addEventListener("click", () => { aba = b.dataset.aba; try { localStorage.setItem("crm-aba", aba); } catch {} montar(); }));
    // Espera as fontes para os gráficos medirem os rótulos com a letra certa
    if (aba === "painel" || aba === "montar" || aba === "contas") Promise.all([document.fonts?.load?.(`400 12px ${getComputedStyle(document.body).fontFamily}`), document.fonts?.ready].map(x => Promise.resolve(x).catch(() => {}))).then(() => { if (aba === "painel") painel(); else if (aba === "montar") montarPainel(); else if (aba === "contas") contas(); });
    else ({ inventario, vendas, despesas, clientes })[aba]?.();
  }
  const conteudo = () => document.getElementById("conteudo");

  // Tabela genérica com busca, ordenação e totais
  function tabela({ colunas, linhas, filtros = "", aplicar = () => true, totais, aoClicar, aoEditar, chaveInicial, dirInicial = 1, botoes = "", nomeCsv }) {
    conteudo().innerHTML = `
      <div class="filtros"><input type="search" id="q" placeholder="Buscar" aria-label="Buscar">${filtros}
        <div class="dir"><span class="cont" id="salvo" role="status"></span><span class="cont" id="cont"></span>${nomeCsv ? `<button class="bt bt--peq" id="csv" type="button">Baixar CSV</button>` : ""}${botoes}</div></div>
      <div class="rolagem"><table class="tabela"><thead><tr>${colunas.map((c, i) => `<th scope="col" class="${c.n ? "n" : ""}" data-i="${i}">${c.r ? `<button>${c.r}</button>` : `<span class="visually-hidden">${c.oculto || ""}</span>`}</th>`).join("")}</tr></thead>
      <tbody id="corpo"></tbody><tfoot id="pe"></tfoot></table></div>`;
    let ci = colunas.findIndex(c => c.k === chaveInicial), dir = dirInicial, atuais = [];
    const celula = (c, l, j) => `<td data-c="${j}" class="${c.n ? "n num" : ""} ${c.cls || ""} ${c.ed ? "td-ed" : ""}">${c.ed
      ? `<input class="cel" inputmode="decimal" data-j="${j}" value="${e(numCel(c.v(l)))}" aria-label="${e(c.r)} ${e(l.codigo || "")}" placeholder="0">`
      : c.h ? c.h(l) : e(c.v(l))}</td>`;
    const rodapeTab = () => { document.getElementById("pe").innerHTML = totais && atuais.length ? `<tr>${colunas.map(c => `<td class="${c.n ? "n num" : ""}">${c.t ? c.t(atuais) : ""}</td>`).join("")}</tr>` : ""; };
    const desenhar = () => {
      const q = norm(document.getElementById("q").value);
      atuais = linhas().filter(l => aplicar(l) && (!q || norm(colunas.map(c => c.busca ? c.busca(l) : (c.v ? c.v(l) : "")).join(" ")).includes(q)));
      if (ci >= 0) { const c = colunas[ci], v = c.ord || c.v; atuais.sort((a, b) => { const x = v(a), y = v(b); if (x === "" || x == null) return 1; if (y === "" || y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; }); }
      document.getElementById("corpo")._linhas = atuais;
      document.getElementById("cont").textContent = `${atuais.length} ${atuais.length === 1 ? "item" : "itens"}`;
      document.getElementById("corpo").innerHTML = atuais.map((l, i) => `<tr data-l="${i}" tabindex="0">${colunas.map((c, j) => celula(c, l, j)).join("")}</tr>`).join("")
        || `<tr><td colspan="${colunas.length}" class="cinza" style="padding:24px">Nada encontrado.</td></tr>`;
      rodapeTab(); hidratarFotos(document.getElementById("corpo"));
      document.querySelectorAll("th[data-i]").forEach(th => th.removeAttribute("aria-sort"));
      if (ci >= 0) document.querySelector(`th[data-i="${ci}"]`)?.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
    };
    document.querySelectorAll("th[data-i] button").forEach(b => b.addEventListener("click", () => { const i = +b.parentElement.dataset.i; dir = ci === i ? -dir : 1; ci = i; desenhar(); }));
    conteudo().querySelectorAll(".filtros input, .filtros select").forEach(x => x.addEventListener("input", desenhar));
    const corpo = document.getElementById("corpo");
    corpo.addEventListener("click", ev => { const tr = ev.target.closest("tr[data-l]"); if (tr && !ev.target.closest("a, input, .td-ed")) aoClicar?.(atuais[+tr.dataset.l]); });
    corpo.addEventListener("keydown", ev => {
      const inp = ev.target.closest("input.cel");
      if (inp && ev.key === "Enter") {             // Enter: grava e desce para a linha de baixo, como na planilha
        ev.preventDefault();
        const prox = inp.closest("tr").nextElementSibling?.querySelector(`input.cel[data-j="${inp.dataset.j}"]`);
        if (prox) { prox.focus(); prox.select(); } else inp.blur();
        return;
      }
      if (inp && ev.key === "Escape") { const tr = inp.closest("tr"); inp.value = numCel(colunas[+inp.dataset.j].v(atuais[+tr.dataset.l])); inp.blur(); return; }
      if (!inp && ev.key === "Enter" && !ev.target.closest("button, a")) { const tr = ev.target.closest("tr[data-l]"); if (tr) aoClicar?.(atuais[+tr.dataset.l]); }
    });
    corpo.addEventListener("focusin", ev => { if (ev.target.matches("input.cel")) ev.target.select(); });
    // Edição direto na célula: grava em fila (uma alteração de cada vez) e recalcula a linha e os totais
    let fila = Promise.resolve();
    const salvo = document.getElementById("salvo");
    corpo.addEventListener("change", ev => {
      const inp = ev.target.closest("input.cel"); if (!inp) return;
      const tr = inp.closest("tr"), l = atuais[+tr.dataset.l], c = colunas[+inp.dataset.j];
      const antes = n(c.v(l)), novo = n(inp.value);
      inp.value = numCel(novo);
      if (novo === antes) return;
      c.ed(l, novo);
      const redesenhaLinha = () => tr.querySelectorAll("td[data-c]").forEach(td => { const k = colunas[+td.dataset.c]; if (!k.ed) td.innerHTML = k.h ? k.h(l) : e(k.v(l)); }) || hidratarFotos(tr);
      redesenhaLinha(); rodapeTab();
      salvo.textContent = "Salvando…"; salvo.className = "cont";
      fila = fila.then(() => aoEditar(l, c)).then(() => { salvo.textContent = "Salvo"; setTimeout(() => { if (salvo.textContent === "Salvo") salvo.textContent = ""; }, 2500); })
        .catch(err => { c.ed(l, antes); inp.value = numCel(antes); redesenhaLinha(); rodapeTab(); salvo.textContent = "Não salvou: " + (err.message || err); salvo.className = "cont neg"; });
    });
    document.getElementById("csv")?.addEventListener("click", () => {
      const cols = colunas.filter(c => c.r && c.v);
      const esc = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const txt = [cols.map(c => esc(c.r)).join(";"), ...atuais.map(l => cols.map(c => { const v = (c.csv || c.v)(l); return typeof v === "number" ? String(v).replace(".", ",") : esc(v); }).join(";"))].join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv" })); a.download = `${nomeCsv}-${hoje()}.csv`; a.click();
    });
    desenhar();
    return desenhar;
  }
  const soma = f => l => R(l.reduce((s, x) => s + f(x), 0));
  const stHtml = p => { const s = fichaDe[p.codigo]?.dados?.status; return `<span class="st st--${e(p.status)}">${ROT_ST[p.status] || e(p.status)}</span>${s ? `<span class="site" title="Status da ficha no site">${s === "oculto" ? "oculto no site" : "no site"}</span>` : ""}`; };
  const opts = (lista, sel) => lista.map(o => `<option ${o === sel ? "selected" : ""}>${e(o)}</option>`).join("");
  const unicos = (lista, f) => [...new Set(lista.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));

  // ---------- Inventário ----------
  function inventario() {
    const cats = unicos(pecas(), p => p.categoria);
    let detalhar = false;
    const base = [
      { oculto: "Foto", h: miniatura },
      { r: "Código", k: "codigo", v: p => p.codigo, cls: "num" },
      { r: "Peça", v: p => p.peca, cls: "larga", busca: p => [p.peca, p.designer, p.fornecedor, p.codigo].join(" ") },
      { r: "Categoria", v: p => p.categoria },
      { r: "Designer", v: p => p.designer },
      { r: "Origem", v: p => p.origem, h: p => p.origem === "Leilão" && p.link_leilao ? `<a class="lk" href="${e(linkSeguro(p.link_leilao))}" target="_blank" rel="noopener" title="Abrir o leilão">Leilão ↗</a>` : e(p.origem) },
      ...MARCAS.map(([k, r]) => ({ r, v: p => p[k] ? "Sim" : "Não", cls: "td-ed td-marca", h: p => `<button type="button" class="ok ${p[k] ? "ok--feito" : ""}" data-marca="${k}" aria-pressed="${!!p[k]}" aria-label="${r}: ${p[k] ? "sim" : "não"}" title="${r}${p[k] ? "" : " (clique para marcar)"}">✓</button>` })),
      { r: "Postada em", v: p => p.data_postagem || "", h: p => dataBR(p.data_postagem) || '<span class="cinza">—</span>', cls: "num col-postagem" },
      { r: "Compra em", v: p => p.data_compra, h: p => dataBR(p.data_compra) || '<span class="cinza">—</span>', cls: "num" },
      { r: "Status", v: p => ROT_ST[p.status] || p.status, h: stHtml },
    ];
    const custos = [
      { r: "Compra", n: 1, v: p => n(p.compra), ed: (p, x) => { p.compra = x; }, t: soma(p => n(p.compra)) },
      { r: "Frete", n: 1, v: p => n(p.frete), ed: (p, x) => { p.frete = x; }, t: soma(p => n(p.frete)) },
      { r: "Restauro", n: 1, v: p => n(p.restauro), ed: (p, x) => { p.restauro = x; }, t: soma(p => n(p.restauro)) },
    ];
    const detalhe = [
      { r: "NF + leiloeiro", n: 1, v: p => n(p.nf) + n(p.leiloeiro), h: p => R(n(p.nf) + n(p.leiloeiro)), t: soma(p => n(p.nf) + n(p.leiloeiro)) },
      { r: "Custo op.", n: 1, v: p => n(p.custo_op), h: p => R(p.custo_op), t: soma(p => n(p.custo_op)) },
    ];
    const fim = [
      { r: "Custo total", n: 1, v: custoTotal, h: p => R(custoTotal(p)), t: soma(custoTotal) },
      { r: "Preço Pix", n: 1, v: p => n(p.preco_pix), ed: (p, x) => { p.preco_pix = x; }, t: soma(p => n(p.preco_pix)) },
      { r: "Lucro", n: 1, v: lucroPrev, h: p => `<span class="${lucroPrev(p) < 0 ? "neg" : ""}">${R(lucroPrev(p))}</span>`, t: soma(lucroPrev) },
      { r: "Margem real", n: 1, v: p => n(p.preco_pix) ? lucroPrev(p) / n(p.preco_pix) : "", h: p => n(p.preco_pix) ? P(lucroPrev(p) / n(p.preco_pix)) : "—",
        t: l => { const pr = l.reduce((s, p) => s + n(p.preco_pix), 0); return pr ? P(l.reduce((s, p) => s + lucroPrev(p), 0) / pr) : ""; } },
      { r: "Dias", n: 1, v: p => { const v = p.status === "vendido" ? vendaDe(p.codigo)?.data : hoje(); return dias(p.data_compra, v) ?? ""; }, h: p => { const v = p.status === "vendido" ? vendaDe(p.codigo)?.data : hoje(); const d = dias(p.data_compra, v); return d == null || d < 0 ? "—" : `${d}`; } },
    ];
    const filtros = `
      <select id="fst" aria-label="Status"><option value="">Todos os status</option><option value="disponivel">Disponível</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option></select>
      <select id="fcat" aria-label="Categoria"><option value="">Todas as categorias</option>${opts(cats)}</select>
      <select id="forig" aria-label="Origem"><option value="">Leilão e direto</option><option>Leilão</option><option>Direto</option></select>
      ${MARCAS.map(([k, r]) => `<select class="fmarca" data-k="${k}" aria-label="${r}"><option value="">${r}: todos</option><option value="1">${r}: sim</option><option value="0">${{ em_restauro: "Fora do restauro", entregue: "Não entregue", foto_tirada: "Falta tirar foto", foto_postada: "Falta postar" }[k]}</option></select>`).join("")}
      <button type="button" class="bt bt--peq" id="flimpa">Limpar filtros</button>
      <label><input type="checkbox" id="fdet"> Mostrar NF, leiloeiro e custo op.</label>`;
    const montarTabela = () => {
      const st = document.getElementById("fst")?.value || "", cat = document.getElementById("fcat")?.value || "", org = document.getElementById("forig")?.value || "", fot = [...document.querySelectorAll(".fmarca")].map(x => x.value);
      tabela({ colunas: [...base, ...custos, ...(detalhar ? detalhe : []), ...fim],
        aoEditar: (p, c) => salvar("inventario", `${c.r.toLowerCase()} de ${p.codigo}`), linhas: pecas, filtros, totais: true, chaveInicial: "codigo", nomeCsv: "voluta-inventario",
        aplicar: p => (!document.getElementById("fst").value || p.status === document.getElementById("fst").value) && (!document.getElementById("fcat").value || p.categoria === document.getElementById("fcat").value) && (!document.getElementById("forig").value || p.origem === document.getElementById("forig").value)
          && [...document.querySelectorAll(".fmarca")].every(x => !x.value || !!p[x.dataset.k] === (x.value === "1")),
        aoClicar: formPeca, botoes: `<button class="bt bt--prim bt--peq" id="nova" type="button">+ Nova peça</button>` });
      document.getElementById("fst").value = st; document.getElementById("fcat").value = cat; document.getElementById("forig").value = org; document.querySelectorAll(".fmarca").forEach((x, j) => { x.value = fot[j] || ""; x.classList.toggle("ativo", !!x.value); });
      document.getElementById("fdet").checked = detalhar;
      document.getElementById("fdet").addEventListener("change", ev => { detalhar = ev.target.checked; montarTabela(); });
      document.getElementById("nova").addEventListener("click", () => formPeca(null));
      document.querySelectorAll(".fmarca").forEach(x => x.addEventListener("change", () => x.classList.toggle("ativo", !!x.value)));
      document.getElementById("flimpa").addEventListener("click", () => {
        document.querySelectorAll(".filtros select").forEach(x => { x.value = ""; x.classList.remove("ativo"); });
        document.getElementById("q").value = ""; document.getElementById("q").dispatchEvent(new Event("input"));
      });
      // Marcadores: marca e desmarca direto na tabela
      document.getElementById("corpo").addEventListener("mousedown", ev => { if (ev.target.closest("[data-marca]")) ev.preventDefault(); });   // sem foco = a tabela não rola
      document.getElementById("corpo").addEventListener("click", async ev => {
        const b = ev.target.closest("[data-marca]"); if (!b) return;
        ev.stopPropagation();
        const p = linhaDe(b), k = b.dataset.marca, r = MARCAS.find(m => m[0] === k)[1]; if (!p) return;
        const pinta = () => { b.classList.toggle("ok--feito", !!p[k]); b.setAttribute("aria-pressed", !!p[k]); b.setAttribute("aria-label", `${r}: ${p[k] ? "sim" : "não"}`); b.title = r + (p[k] ? "" : " (clique para marcar)"); };
        const salvo = document.getElementById("salvo");
        const dataAntes = p.data_postagem;
        p[k] = !p[k];
        if (k === "foto_postada") { if (p[k]) p.data_postagem = hojeLocal(); else delete p.data_postagem; }
        const celData = b.closest("tr").querySelector("td.col-postagem");
        const pintaData = () => { if (celData) celData.innerHTML = dataBR(p.data_postagem) || '<span class="cinza">—</span>'; };
        pinta(); pintaData();
        salvo.textContent = "Salvando…"; salvo.className = "cont";
        try { await salvar("inventario", `${r.toLowerCase()}: ${p[k] ? "sim" : "não"} ${p.codigo}`); salvo.textContent = "Salvo"; setTimeout(() => { if (salvo.textContent === "Salvo") salvo.textContent = ""; }, 2500); }
        catch (err) { p[k] = !p[k]; if (dataAntes) p.data_postagem = dataAntes; else delete p.data_postagem; pinta(); pintaData(); salvo.textContent = "Não salvou: " + err.message; salvo.className = "cont neg"; }
      });
      document.getElementById("q").dispatchEvent(new Event("input"));
    };
    montarTabela();
  }

  // ---------- Formulários ----------
  function abrir(html, ligar) {
    dlgCorpo.innerHTML = html; dlg.showModal(); ligar?.(dlgCorpo);
    dlgCorpo.querySelector("[data-fechar]")?.addEventListener("click", () => dlg.close());
    dlgCorpo.querySelector("input, select, textarea")?.focus();
  }
  const campo = (id, rot, val = "", { tipo = "text", cls = "", lista, extra = "", atalho = "" } = {}) =>
    `<div class="campo ${cls}"><label for="${id}">${rot}</label>${tipo === "textarea" ? `<textarea id="${id}">${e(val)}</textarea>` : tipo === "select" ? `<select id="${id}">${extra}</select>` :
      `<input id="${id}" type="${tipo}" value="${e(val)}" ${lista ? `list="${id}-l"` : ""} ${tipo === "number" ? 'step="0.01" inputmode="decimal"' : ""}>${lista ? `<datalist id="${id}-l">${lista.map(o => `<option value="${e(o)}">`).join("")}</datalist>` : ""}`}${atalho}</div>`;
  const val = (raiz, id) => raiz.querySelector("#" + id)?.value.trim() ?? "";
  const rodape = (excluir) => `<p class="form__msg" id="msg" role="status"></p><div class="form__pe"><div>${excluir ? `<button class="bt bt--perigo" type="button" id="excluir">Excluir</button>` : ""}</div><div><button class="bt" type="button" data-fechar>Cancelar</button><button class="bt bt--prim" type="button" id="salvar">Salvar</button></div></div>`;
  const erroForm = (raiz, err) => { const m = raiz.querySelector("#msg"); m.className = "form__msg neg"; m.textContent = err.message || String(err); raiz.querySelector("#salvar").disabled = false; };
  const confirmarExclusao = (raiz, acao) => raiz.querySelector("#excluir")?.addEventListener("click", ev => {
    const b = ev.currentTarget;
    if (b.dataset.conf) return acao();
    b.dataset.conf = "1"; b.textContent = "Confirmar exclusão"; b.classList.add("bt--prim");
  });

  function formPeca(p) {
    const novo = !p, x = p || { codigo: proxCodigo(), origem: "Direto", status: "disponivel", custo_op: par().custo_op, data_compra: hoje() };
    const cats = [...new Set([...CATEGORIAS, ...pecas().map(q => q.categoria).filter(Boolean)])];
    const ficha = fichaDe[x.codigo];
    abrir(`<h2>${novo ? "Nova peça" : `${e(x.codigo)} · ${e(x.peca)}`}</h2>
      ${ficha ? `<p class="cinza" style="font-size:12px;margin:-8px 0 14px">No site: ${e(ficha.dados.titulo)} · ${e({ disponivel: "Disponível", vendido: "Vendido", oculto: "Oculto" }[ficha.dados.status] || ficha.dados.status)}. Mudar o status aqui também muda no site.</p>` : ""}
      <div class="campos">
        ${campo("f-codigo", "Código", x.codigo)}
        ${campo("f-peca", "Peça", x.peca, { cls: "campo--2" })}
        ${campo("f-categoria", "Categoria", x.categoria, { lista: cats })}
        ${campo("f-designer", "Designer ou fabricante", x.designer, { lista: unicos(pecas(), q => q.designer) })}
        ${campo("f-fornecedor", "Fornecedor", x.fornecedor, { lista: unicos(pecas(), q => q.fornecedor) })}
        ${campo("f-origem", "Origem da compra", "", { tipo: "select", extra: opts(["Direto", "Leilão"], x.origem) })}
        ${campo("f-link", "Link do leilão", x.link_leilao || "", { tipo: "url", cls: "campo--2" + (x.origem === "Leilão" ? "" : " oculto"), atalho: `<a class="atalho" id="f-link-abrir" target="_blank" rel="noopener" ${x.link_leilao ? `href="${e(linkSeguro(x.link_leilao))}"` : "hidden"}>Abrir o leilão ↗</a>` })}
        ${campo("f-data", "Data da compra", x.data_compra, { tipo: "date" })}
        ${campo("f-status", "Status", "", { tipo: "select", extra: Object.entries(ROT_ST).map(([k, r]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${r}</option>`).join("") })}
        ${campo("f-compra", "Compra (R$)", x.compra ?? "", { tipo: "number" })}
        ${campo("f-frete", "Frete (R$)", x.frete ?? "", { tipo: "number" })}
        ${campo("f-restauro", "Restauro (R$)", x.restauro ?? "", { tipo: "number" })}
        ${campo("f-nf", "NF (R$)", x.nf ?? "", { tipo: "number", atalho: `<button type="button" class="atalho" data-pct="nf">Usar ${P(par().nf)} da compra</button>` })}
        ${campo("f-leiloeiro", "Comissão do leiloeiro (R$)", x.leiloeiro ?? "", { tipo: "number", atalho: `<button type="button" class="atalho" data-pct="leiloeiro">Usar ${P(par().leiloeiro)} da compra</button>` })}
        ${campo("f-op", "Custo operacional (R$)", x.custo_op ?? par().custo_op, { tipo: "number" })}
        ${campo("f-preco", "Preço Pix (R$)", x.preco_pix ?? "", { tipo: "number" })}
        ${campo("f-mercado", "Média de mercado (R$)", x.mercado || "", { tipo: "number" })}
        ${campo("f-dim", "Dimensões", x.dimensoes)}
        ${campo("f-obs", "Observações", x.obs, { tipo: "textarea", cls: "campo--3" })}
        <div class="campo campo--3 foto-peca">
          <span class="campo__r">Foto da peça</span>
          <div class="foto-peca__linha">
            <div class="foto-peca__prev" id="f-prev">${miniatura(x)}</div>
            <div class="foto-peca__acoes">
              <label class="bt bt--peq" for="f-foto">${x.foto ? "Trocar foto" : "Enviar foto"}</label>
              <input type="file" id="f-foto" accept="image/*" class="visually-hidden">
              <button type="button" class="bt bt--peq bt--perigo" id="f-foto-tirar" ${x.foto ? "" : "hidden"}>Remover foto</button>
              <p class="cinza" id="f-foto-info" style="font-size:11.5px;margin:0">${x.foto ? "Foto enviada pelo CRM." : fotoDe(x.codigo) ? "Mostrando a foto do site. Envie uma para usar outra aqui." : "Sem foto ainda."}</p>
            </div>
          </div>
        </div>
        <div class="campo campo--3"><span class="campo__r">Acompanhamento</span>
          <div class="marcas">${MARCAS.map(([k, r]) => `<label class="foto-peca__flag"><input type="checkbox" id="f-m-${k}" ${x[k] ? "checked" : ""}> ${r}</label>`).join("")}
            <label class="foto-peca__flag" id="f-postagem-caixa" ${x.foto_postada ? "" : "hidden"}>Postada em <input type="date" id="f-postagem" value="${e(x.data_postagem || "")}"></label></div>
        </div>
      </div>
      <div class="resumo" id="resumo"></div>
      ${rodape(!novo)}`, raiz => {
      // Foto: a nova só sobe para o GitHub quando clicar em Salvar
      let fotoNova = null, tirarFoto = false;
      hidratarFotos(raiz);
      raiz.querySelector("#f-foto").addEventListener("change", async ev => {
        const arq = ev.target.files[0]; if (!arq) return;
        const info = raiz.querySelector("#f-foto-info"); info.textContent = "Preparando a foto…";
        try {
          fotoNova = await reduzirFoto(arq); tirarFoto = false;
          raiz.querySelector("#f-prev").innerHTML = `<img src="${URL.createObjectURL(fotoNova)}" alt="">`;
          raiz.querySelector("#f-foto-tirar").hidden = false;
          info.textContent = "Nova foto. Ela é enviada quando você clicar em Salvar.";
          raiz.querySelector("#f-m-foto_tirada").checked = true;
        } catch (err) { info.textContent = err.message || "Não consegui ler essa imagem."; }
      });
      raiz.querySelector("#f-foto-tirar").addEventListener("click", ev => {
        fotoNova = null; tirarFoto = !!x.foto; ev.currentTarget.hidden = true;
        raiz.querySelector("#f-prev").innerHTML = fotoDe(x.codigo) ? `<img src="${e(fotoDe(x.codigo))}" alt="">` : `<div class="sf"></div>`;
        raiz.querySelector("#f-foto-info").textContent = tirarFoto ? "A foto será removida ao salvar." : "Sem foto ainda.";
      });
      // Foto postada: ao marcar, guarda a data de hoje (dá para corrigir no campo ao lado)
      raiz.querySelector("#f-m-foto_postada").addEventListener("change", ev => {
        raiz.querySelector("#f-postagem-caixa").hidden = !ev.target.checked;
        if (ev.target.checked && !raiz.querySelector("#f-postagem").value) raiz.querySelector("#f-postagem").value = hojeLocal();
      });
      // Link do leilão: só aparece quando a origem é Leilão
      const origem = raiz.querySelector("#f-origem"), caixaLink = raiz.querySelector("#f-link").closest(".campo");
      origem.addEventListener("change", () => caixaLink.classList.toggle("oculto", origem.value !== "Leilão"));
      raiz.querySelector("#f-link").addEventListener("input", ev => { const a = raiz.querySelector("#f-link-abrir"), u = linkSeguro(ev.target.value.trim()); a.hidden = !u; if (u) a.href = u; });
      const ler = () => ({ ...x, codigo: val(raiz, "f-codigo").toUpperCase(), peca: val(raiz, "f-peca"), categoria: val(raiz, "f-categoria") || "Sem categoria", designer: val(raiz, "f-designer"),
        fornecedor: val(raiz, "f-fornecedor"), origem: val(raiz, "f-origem"), data_compra: val(raiz, "f-data"), status: val(raiz, "f-status"),
        compra: n(val(raiz, "f-compra")), frete: n(val(raiz, "f-frete")), restauro: n(val(raiz, "f-restauro")), nf: n(val(raiz, "f-nf")), leiloeiro: n(val(raiz, "f-leiloeiro")),
        custo_op: n(val(raiz, "f-op")), preco_pix: n(val(raiz, "f-preco")), mercado: n(val(raiz, "f-mercado")), dimensoes: val(raiz, "f-dim"), obs: val(raiz, "f-obs"),
        link_leilao: val(raiz, "f-origem") === "Leilão" ? val(raiz, "f-link") : "", ...Object.fromEntries(MARCAS.map(([k]) => [k, raiz.querySelector("#f-m-" + k).checked])),
        data_postagem: raiz.querySelector("#f-m-foto_postada").checked ? (val(raiz, "f-postagem") || hojeLocal()) : "" });
      const resumo = () => { const y = ler(); raiz.querySelector("#resumo").innerHTML = `<span>Custo total <b>${R(custoTotal(y))}</b></span><span>Lucro <b class="${lucroPrev(y) < 0 ? "neg" : ""}">${R(lucroPrev(y))}</b></span><span>Margem real <b>${y.preco_pix ? P(lucroPrev(y) / y.preco_pix) : "—"}</b></span><span>Markup <b>${custoTotal(y) ? P(y.preco_pix / custoTotal(y) - 1) : "—"}</b></span>`; };
      raiz.querySelectorAll("input,select,textarea").forEach(i => i.addEventListener("input", resumo));
      raiz.querySelectorAll("[data-pct]").forEach(b => b.addEventListener("click", () => { raiz.querySelector(`#f-${b.dataset.pct}`).value = (n(val(raiz, "f-compra")) * par()[b.dataset.pct]).toFixed(2); resumo(); }));
      resumo();
      raiz.querySelector("#salvar").addEventListener("click", async ev => {
        const y = ler(); ev.currentTarget.disabled = true;
        try {
          if (!/^VLT-\d+$/.test(y.codigo)) throw new Error("O código precisa ser no formato VLT-123.");
          if ((novo || y.codigo !== x.codigo) && peca(y.codigo)) throw new Error(`Já existe uma peça com o código ${y.codigo}.`);
          if (!y.peca) throw new Error("Preencha o nome da peça.");
          const fotoAntiga = x.foto || "";
          if (fotoNova) { raiz.querySelector("#f-foto-info").textContent = "Enviando a foto…"; y.foto = await enviarFoto(fotoNova, y.codigo); }
          else if (tirarFoto) delete y.foto;
          const lista = pecas(), i = lista.indexOf(p);
          if (novo) lista.push(y); else lista[i] = y;
          const mudouStatus = novo || y.status !== x.status;
          try { await salvar("inventario", `${novo ? "nova peça" : "alteração"} ${y.codigo}`); } catch (err) { if (novo) lista.pop(); else lista[i] = p; throw err; }
          if (fotoAntiga && fotoAntiga !== y.foto) apagarFoto(fotoAntiga);
          const falhas = mudouStatus ? await refletirNoSite([y.codigo]) : [];
          dlg.close(); montar(falhas.length ? "" : `${y.codigo} salvo.`);
          if (falhas.length) alertaFaixa(`Salvo no CRM, mas não consegui atualizar o status no site de: ${falhas.join(", ")}. Mude pelo painel do site.`);
        } catch (err) { erroForm(raiz, err); }
      });
      confirmarExclusao(raiz, async () => {
        const lista = pecas(), i = lista.indexOf(p);
        lista.splice(i, 1);
        try { await salvar("inventario", `exclusão ${x.codigo}`); dlg.close(); montar(`${x.codigo} excluído do CRM. A ficha do site, se existir, continua lá.`); }
        catch (err) { lista.splice(i, 0, p); erroForm(raiz, err); }
      });
    });
  }
  const alertaFaixa = txt => conteudo().insertAdjacentHTML("beforebegin", `<div class="aviso-crm aviso-crm--erro" role="alert">${e(txt)}</div>`);

  // ---------- Vendas ----------
  function vendas() {
    const anos = unicos(D.vendas.itens, v => v.data.slice(0, 4)).reverse();
    tabela({
      linhas: () => D.vendas.itens, chaveInicial: "data", dirInicial: -1, totais: true, nomeCsv: "voluta-vendas", aoClicar: formVenda,
      filtros: `<select id="fano" aria-label="Ano"><option value="">Todos os anos</option>${opts(anos)}</select><select id="fforma" aria-label="Forma de pagamento"><option value="">Todas as formas</option>${opts(unicos(D.vendas.itens, v => v.forma))}</select>`,
      aplicar: v => (!document.getElementById("fano").value || v.data.startsWith(document.getElementById("fano").value)) && (!document.getElementById("fforma").value || v.forma === document.getElementById("fforma").value),
      botoes: `<button class="bt bt--prim bt--peq" id="nova" type="button">+ Registrar venda</button>`,
      colunas: [
        { r: "Data", k: "data", v: v => v.data, h: v => dataBR(v.data), cls: "num" },
        { r: "Código", v: v => v.codigo, h: v => v.codigo ? e(v.codigo) : '<span class="cinza">—</span>', cls: "num" },
        { r: "Peça", v: v => v.descricao || peca(v.codigo)?.peca || "", cls: "larga" },
        { r: "Cliente", v: v => cliente(v.cliente_id)?.nome || "" },
        { r: "Forma", v: v => v.forma },
        { r: "Valor", n: 1, v: v => n(v.valor), h: v => R(v.valor), t: soma(v => n(v.valor)) },
        { r: "Taxa", n: 1, v: v => n(v.taxa), h: v => n(v.taxa) ? (n(v.taxa) * 100).toFixed(1).replace(".", ",") + "%" : "—" },
        { r: "Líquido", n: 1, v: liquido, h: v => R(liquido(v)), t: soma(liquido) },
        { r: "Custo", n: 1, v: v => n(v.custo) + n(v.custo_op), h: v => R(n(v.custo) + n(v.custo_op)), t: soma(v => n(v.custo) + n(v.custo_op)) },
        { r: "Lucro", n: 1, v: lucroVenda, h: v => `<span class="${lucroVenda(v) < 0 ? "neg" : ""}">${R(lucroVenda(v))}</span>`, t: soma(lucroVenda) },
        { r: "Margem real", n: 1, v: v => n(v.valor) ? lucroVenda(v) / n(v.valor) : "", h: v => n(v.valor) ? P(lucroVenda(v) / n(v.valor)) : "—",
          t: l => { const s = l.reduce((a, v) => a + n(v.valor), 0); return s ? P(l.reduce((a, v) => a + lucroVenda(v), 0) / s) : ""; } },
      ],
    });
    document.getElementById("nova").addEventListener("click", () => formVenda(null));
  }

  function formVenda(v) {
    const nova = !v, taxas = par().taxas;
    const x = v || { data: hoje(), forma: "Pix / à vista", taxa: 0, custo_op: par().custo_op };
    const disp = pecas().filter(p => p.status !== "vendido" || p.codigo === x.codigo).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const cli = cliente(x.cliente_id) || {};
    abrir(`<h2>${nova ? "Registrar venda" : "Venda · " + e(dataBR(x.data))}</h2>
      <div class="campos">
        ${campo("v-cod", "Peça", "", { tipo: "select", cls: "campo--2", extra: `<option value="">Sem código (peça fora do inventário)</option>` + disp.map(p => `<option value="${e(p.codigo)}" ${p.codigo === x.codigo ? "selected" : ""}>${e(p.codigo)} · ${e(p.peca)}</option>`).join("") })}
        ${campo("v-data", "Data da venda", x.data, { tipo: "date" })}
        ${campo("v-desc", "Descrição", x.descricao, { cls: "campo--3" })}
        ${campo("v-cli", "Cliente", cli.nome || "", { lista: D.clientes.itens.map(c => c.nome) })}
        ${campo("v-email", "E-mail", cli.email || "", { tipo: "email" })}
        ${campo("v-tel", "Telefone", cli.telefone || "")}
        ${campo("v-forma", "Forma de pagamento", "", { tipo: "select", extra: opts([...new Set([...Object.keys(taxas), x.forma])], x.forma) })}
        ${campo("v-valor", "Valor da venda (R$)", x.valor ?? "", { tipo: "number" })}
        ${campo("v-taxa", "Taxa da maquininha (%)", x.taxa ? (x.taxa * 100).toFixed(2) : "0", { tipo: "number" })}
        ${campo("v-custo", "Custo da peça (R$)", x.custo ?? "", { tipo: "number" })}
        ${campo("v-op", "Custo operacional (R$)", x.custo_op ?? par().custo_op, { tipo: "number" })}
        ${campo("v-obs", "Observações", x.obs, { tipo: "textarea", cls: "campo--3" })}
      </div>
      <div class="resumo" id="resumo"></div>
      ${nova ? `<p class="cinza" style="font-size:12px;margin:10px 0 0">Ao salvar, a peça vira Vendido aqui e no site (o site atualiza quando você clicar em "Publicar site").</p>` : ""}
      ${rodape(!nova)}`, raiz => {
      const ler = () => ({ ...x, codigo: val(raiz, "v-cod"), data: val(raiz, "v-data"), descricao: val(raiz, "v-desc"), forma: val(raiz, "v-forma"),
        valor: n(val(raiz, "v-valor")), taxa: n(val(raiz, "v-taxa")) / 100, custo: n(val(raiz, "v-custo")), custo_op: n(val(raiz, "v-op")), obs: val(raiz, "v-obs") });
      const resumo = () => { const y = ler(); raiz.querySelector("#resumo").innerHTML = `<span>Líquido <b>${R(liquido(y))}</b></span><span>Lucro <b class="${lucroVenda(y) < 0 ? "neg" : ""}">${R(lucroVenda(y))}</b></span><span>Margem real <b>${y.valor ? P(lucroVenda(y) / y.valor) : "—"}</b></span>`; };
      raiz.querySelector("#v-cod").addEventListener("change", ev => {
        const p = peca(ev.target.value); if (!p) return;
        raiz.querySelector("#v-desc").value = p.peca; raiz.querySelector("#v-custo").value = custoPeca(p); raiz.querySelector("#v-op").value = p.custo_op ?? par().custo_op;
        if (!n(val(raiz, "v-valor"))) raiz.querySelector("#v-valor").value = p.preco_pix || "";
        resumo();
      });
      raiz.querySelector("#v-forma").addEventListener("change", ev => { raiz.querySelector("#v-taxa").value = ((taxas[ev.target.value] || 0) * 100).toFixed(2); resumo(); });
      raiz.querySelector("#v-cli").addEventListener("change", ev => { const c = D.clientes.itens.find(c => norm(c.nome) === norm(ev.target.value)); if (c) { raiz.querySelector("#v-email").value = c.email || ""; raiz.querySelector("#v-tel").value = c.telefone || ""; } });
      raiz.querySelectorAll("input,select,textarea").forEach(i => i.addEventListener("input", resumo));
      if (nova && x.codigo) raiz.querySelector("#v-cod").dispatchEvent(new Event("change"));
      resumo();

      raiz.querySelector("#salvar").addEventListener("click", async ev => {
        ev.currentTarget.disabled = true;
        const y = ler(), nomeCli = val(raiz, "v-cli"), email = val(raiz, "v-email").toLowerCase(), tel = val(raiz, "v-tel");
        const antesV = structuredClone(D.vendas.itens), antesC = structuredClone(D.clientes.itens), antesI = structuredClone(D.inventario.itens);
        try {
          if (!y.valor) throw new Error("Preencha o valor da venda.");
          if (!y.data) throw new Error("Preencha a data da venda.");
          // Cliente: acha pelo e-mail ou nome; cria se for novo
          let c = (email && D.clientes.itens.find(c => c.email === email)) || (nomeCli && D.clientes.itens.find(c => norm(c.nome) === norm(nomeCli)));
          let mudouCli = false;
          if (!c && (nomeCli || email)) { c = { id: proxId(D.clientes.itens, "C"), nome: nomeCli, email, telefone: tel, cidade: "", obs: "" }; D.clientes.itens.push(c); mudouCli = true; }
          else if (c) { if (email && c.email !== email) { c.email = email; mudouCli = true; } if (tel && c.telefone !== tel) { c.telefone = tel; mudouCli = true; } }
          y.cliente_id = c?.id || "";
          if (nova) { y.id = proxId(D.vendas.itens, "V"); D.vendas.itens.push(y); } else D.vendas.itens[D.vendas.itens.indexOf(v)] = y;
          // Peça: vira vendida; se trocou a peça da venda, a anterior volta a ficar disponível
          const mexidas = [];
          if (y.codigo && peca(y.codigo) && peca(y.codigo).status !== "vendido") { peca(y.codigo).status = "vendido"; mexidas.push(y.codigo); }
          if (!nova && x.codigo && x.codigo !== y.codigo && peca(x.codigo) && !D.vendas.itens.some(o => o.codigo === x.codigo)) { peca(x.codigo).status = "disponivel"; mexidas.push(x.codigo); }
          await salvar("vendas", `${nova ? "venda" : "alteração de venda"} ${y.codigo || y.descricao}`);
          if (mudouCli) await salvar("clientes", `cliente ${c.nome || c.email}`);
          if (mexidas.length) await salvar("inventario", `${mexidas.join(", ")} vendido`);
          const falhas = mexidas.length ? await refletirNoSite(mexidas) : [];
          dlg.close(); montar(`Venda salva${mexidas.length ? `; ${mexidas.join(", ")} marcada como vendida` : ""}.${mexidas.some(c => fichaDe[c]) ? ' Clique em "Publicar site" para o selo aparecer no site.' : ""}`);
          if (falhas.length) alertaFaixa(`Não consegui marcar como vendido no site: ${falhas.join(", ")}. Mude pelo painel do site.`);
        } catch (err) { D.vendas.itens = antesV; D.clientes.itens = antesC; D.inventario.itens = antesI; erroForm(raiz, err); }
      });
      confirmarExclusao(raiz, async () => {
        const antesV = structuredClone(D.vendas.itens), antesI = structuredClone(D.inventario.itens);
        try {
          D.vendas.itens.splice(D.vendas.itens.indexOf(v), 1);
          const p = peca(x.codigo), volta = p && p.status === "vendido" && !D.vendas.itens.some(o => o.codigo === x.codigo);
          await salvar("vendas", `exclusão de venda ${x.codigo || x.descricao}`);
          if (volta) { p.status = "disponivel"; await salvar("inventario", `${x.codigo} voltou a disponível`); await refletirNoSite([x.codigo]); }
          dlg.close(); montar(`Venda excluída.${volta ? ` ${x.codigo} voltou para Disponível.` : ""}`);
        } catch (err) { D.vendas.itens = antesV; D.inventario.itens = antesI; erroForm(raiz, err); }
      });
    });
  }

  // ---------- Despesas ----------
  function despesas() {
    const cats = unicos(D.despesas.itens, d => d.categoria), anos = unicos(D.despesas.itens, d => (d.data || "").slice(0, 4)).reverse();
    tabela({
      linhas: () => D.despesas.itens, chaveInicial: "data", dirInicial: -1, totais: true, nomeCsv: "voluta-despesas", aoClicar: formDespesa,
      filtros: `<select id="fcat" aria-label="Categoria"><option value="">Todas as categorias</option>${opts(cats)}</select><select id="fano" aria-label="Ano"><option value="">Todos os anos</option>${opts(anos)}</select>`,
      aplicar: d => (!document.getElementById("fcat").value || d.categoria === document.getElementById("fcat").value) && (!document.getElementById("fano").value || (d.data || "").startsWith(document.getElementById("fano").value)),
      botoes: `<button class="bt bt--prim bt--peq" id="nova" type="button">+ Nova despesa</button>`,
      colunas: [
        { r: "Data", k: "data", v: d => d.data, h: d => dataBR(d.data) || '<span class="cinza">—</span>', cls: "num" },
        { r: "Categoria", v: d => d.categoria },
        { r: "Subcategoria", v: d => d.subcategoria },
        { r: "Descrição", v: d => d.descricao, cls: "larga" },
        { r: "Valor", n: 1, v: d => n(d.valor), h: d => R(d.valor), t: soma(d => n(d.valor)) },
      ],
    });
    document.getElementById("nova").addEventListener("click", () => formDespesa(null));
  }
  function formDespesa(d) {
    const nova = !d, x = d || { data: hoje() };
    abrir(`<h2>${nova ? "Nova despesa" : "Despesa"}</h2>
      <p class="cinza" style="font-size:12px;margin:-8px 0 14px">Gastos que não são de uma peça específica (anúncios, embalagem, equipamentos…). Compra, frete e restauro de peça vão no Inventário.</p>
      <div class="campos">
        ${campo("d-data", "Data", x.data, { tipo: "date" })}
        ${campo("d-cat", "Categoria", x.categoria, { lista: unicos(D.despesas.itens, y => y.categoria) })}
        ${campo("d-sub", "Subcategoria", x.subcategoria, { lista: unicos(D.despesas.itens, y => y.subcategoria) })}
        ${campo("d-desc", "Descrição", x.descricao, { cls: "campo--2" })}
        ${campo("d-valor", "Valor (R$)", x.valor ?? "", { tipo: "number" })}
        ${campo("d-obs", "Observações", x.obs, { tipo: "textarea", cls: "campo--3" })}
      </div>${rodape(!nova)}`, raiz => {
      raiz.querySelector("#salvar").addEventListener("click", async ev => {
        ev.currentTarget.disabled = true;
        const y = { ...x, data: val(raiz, "d-data"), categoria: val(raiz, "d-cat"), subcategoria: val(raiz, "d-sub"), descricao: val(raiz, "d-desc"), valor: n(val(raiz, "d-valor")), obs: val(raiz, "d-obs") };
        const antes = structuredClone(D.despesas.itens);
        try {
          if (!y.valor) throw new Error("Preencha o valor.");
          if (!y.categoria) throw new Error("Escolha ou escreva uma categoria.");
          if (nova) { y.id = proxId(D.despesas.itens, "D"); D.despesas.itens.push(y); } else D.despesas.itens[D.despesas.itens.indexOf(d)] = y;
          await salvar("despesas", `${nova ? "despesa" : "alteração de despesa"} ${y.descricao}`);
          dlg.close(); montar("Despesa salva.");
        } catch (err) { D.despesas.itens = antes; erroForm(raiz, err); }
      });
      confirmarExclusao(raiz, async () => {
        const antes = structuredClone(D.despesas.itens);
        try { D.despesas.itens.splice(D.despesas.itens.indexOf(d), 1); await salvar("despesas", `exclusão de despesa ${x.descricao}`); dlg.close(); montar("Despesa excluída."); }
        catch (err) { D.despesas.itens = antes; erroForm(raiz, err); }
      });
    });
  }

  // ---------- Clientes ----------
  const comprasDe = c => D.vendas.itens.filter(v => v.cliente_id === c.id);
  function clientes() {
    tabela({
      linhas: () => D.clientes.itens, chaveInicial: "total", dirInicial: -1, totais: true, nomeCsv: "voluta-clientes", aoClicar: formCliente,
      botoes: `<button class="bt bt--prim bt--peq" id="nova" type="button">+ Novo cliente</button>`,
      colunas: [
        { r: "Nome", v: c => c.nome, cls: "larga" },
        { r: "E-mail", v: c => c.email },
        { r: "Telefone", v: c => c.telefone },
        { r: "Cidade", v: c => c.cidade },
        { r: "Compras", n: 1, v: c => comprasDe(c).length, t: l => l.reduce((s, c) => s + comprasDe(c).length, 0) },
        { r: "Total comprado", k: "total", n: 1, v: c => comprasDe(c).reduce((s, v) => s + n(v.valor), 0), h: c => R(comprasDe(c).reduce((s, v) => s + n(v.valor), 0)), t: soma(c => comprasDe(c).reduce((s, v) => s + n(v.valor), 0)) },
        { r: "Última compra", n: 1, v: c => comprasDe(c).map(v => v.data).sort().pop() || "", h: c => dataBR(comprasDe(c).map(v => v.data).sort().pop()) || '<span class="cinza">—</span>' },
      ],
    });
    document.getElementById("nova").addEventListener("click", () => formCliente(null));
  }
  function formCliente(c) {
    const novo = !c, x = c || {};
    const compras = novo ? [] : comprasDe(x).sort((a, b) => b.data.localeCompare(a.data));
    abrir(`<h2>${novo ? "Novo cliente" : e(x.nome || x.email)}</h2>
      <div class="campos">
        ${campo("c-nome", "Nome", x.nome, { cls: "campo--2" })}
        ${campo("c-cidade", "Cidade", x.cidade)}
        ${campo("c-email", "E-mail", x.email, { tipo: "email", cls: "campo--2" })}
        ${campo("c-tel", "Telefone", x.telefone)}
        ${campo("c-obs", "Observações (gosto, peças que procura…)", x.obs, { tipo: "textarea", cls: "campo--3" })}
      </div>
      ${compras.length ? `<ul class="lista-compras">${compras.map(v => `<li>${dataBR(v.data)} · ${e(v.descricao || peca(v.codigo)?.peca || v.codigo)} · ${R(v.valor)}</li>`).join("")}</ul>` : ""}
      ${rodape(!novo && !compras.length)}`, raiz => {
      raiz.querySelector("#salvar").addEventListener("click", async ev => {
        ev.currentTarget.disabled = true;
        const y = { ...x, nome: val(raiz, "c-nome"), cidade: val(raiz, "c-cidade"), email: val(raiz, "c-email").toLowerCase(), telefone: val(raiz, "c-tel"), obs: val(raiz, "c-obs") };
        const antes = structuredClone(D.clientes.itens);
        try {
          if (!y.nome && !y.email) throw new Error("Preencha o nome ou o e-mail.");
          if (novo) { y.id = proxId(D.clientes.itens, "C"); D.clientes.itens.push(y); } else D.clientes.itens[D.clientes.itens.indexOf(c)] = y;
          await salvar("clientes", `${novo ? "cliente" : "alteração de cliente"} ${y.nome || y.email}`);
          dlg.close(); montar("Cliente salvo.");
        } catch (err) { D.clientes.itens = antes; erroForm(raiz, err); }
      });
      confirmarExclusao(raiz, async () => {
        const antes = structuredClone(D.clientes.itens);
        try { D.clientes.itens.splice(D.clientes.itens.indexOf(c), 1); await salvar("clientes", `exclusão de cliente ${x.nome}`); dlg.close(); montar("Cliente excluído."); }
        catch (err) { D.clientes.itens = antes; erroForm(raiz, err); }
      });
    });
  }

  // ---------- Painel ----------
  function noPeriodo(d) {
    if (!d) return periodo === "tudo";
    if (periodo === "tudo") return true;
    if (/^\d{4}$/.test(periodo)) return d.startsWith(periodo);
    const meses = { "3m": 3, "6m": 6, "12m": 12 }[periodo];
    const ini = new Date(); ini.setDate(1); ini.setMonth(ini.getMonth() - meses + 1);
    return d >= ini.toISOString().slice(0, 10);
  }
  function mesesDe(datas) {
    const ms = datas.filter(Boolean).map(d => d.slice(0, 7)).sort();
    if (!ms.length) return [];
    const out = []; let [y, m] = ms[0].split("-").map(Number); const [yf, mf] = ms[ms.length - 1].split("-").map(Number);
    while (y < yf || (y === yf && m <= mf)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  function painel() {
    graficos.splice(0).forEach(g => g.destroy());
    const anos = [...new Set([...D.vendas.itens.map(v => v.data), ...pecas().map(p => p.data_compra), ...D.despesas.itens.map(d => d.data)].filter(Boolean).map(d => d.slice(0, 4)))].sort().reverse();
    const vs = D.vendas.itens.filter(v => noPeriodo(v.data));
    const compras = pecas().filter(p => noPeriodo(p.data_compra));
    const ds = D.despesas.itens.filter(d => noPeriodo(d.data));
    const fat = vs.reduce((s, v) => s + n(v.valor), 0), luc = vs.reduce((s, v) => s + lucroVenda(v), 0);
    const bruto = vs.reduce((s, v) => s + liquido(v) - n(v.custo), 0);
    const desp = ds.reduce((s, d) => s + n(d.valor), 0);
    const invest = compras.reduce((s, p) => s + custoPeca(p), 0);
    const disp = pecas().filter(p => p.status !== "vendido");
    const tempos = pecas().filter(p => p.status === "vendido").map(p => dias(p.data_compra, vendaDe(p.codigo)?.data)).filter(x => x != null && x >= 0);
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
    const kpi = (r, v, s = "") => `<div class="kpi"><p class="kpi__r">${r}</p><p class="kpi__v">${v}</p>${s ? `<p class="kpi__s">${s}</p>` : ""}</div>`;

    conteudo().innerHTML = `
      <div class="filtros"><label>Período <select id="per">
        <option value="tudo">Tudo</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="12m">Últimos 12 meses</option>${anos.map(a => `<option value="${a}">${a}</option>`).join("")}
      </select></label></div>
      <div class="kpis">
        ${kpi("Faturamento", R(fat), `${vs.length} ${vs.length === 1 ? "venda" : "vendas"} · ticket médio ${R(vs.length ? fat / vs.length : 0)}`)}
        ${kpi("Lucro das vendas", R(luc), `margem real ${fat ? P(luc / fat) : "—"} · já com R$ ${par().custo_op}/peça de custo operacional`)}
        ${kpi("Despesas", R(desp), `anúncios, embalagem, equipamentos…`)}
        ${kpi("Resultado", `<span class="${bruto - desp < 0 ? "neg" : ""}">${R(bruto - desp)}</span>`, "vendas menos custo das peças e despesas reais")}
        ${kpi("Investido em peças", R(invest), `${compras.length} ${compras.length === 1 ? "peça comprada" : "peças compradas"} no período`)}
      </div>
      <div class="graf graf--largo" id="caixa-tipos">
        <h3>Quanto gastei por tipo</h3>
        <p class="sub">Marque os tipos que quer somar. Vale o período escolhido acima. Compra de peças começa desmarcada para não esconder o resto.</p>
        <div class="chips" id="chips"></div>
        <div class="tipos">
          <div><p class="total-tipos" id="total-tipos"></p><div class="area area--pizza" id="a-pizza"><canvas id="g-pizza"></canvas></div></div>
          <div id="t-tipos"></div>
        </div>
        <h3 style="margin-top:18px">Por mês</h3><p class="sub" id="sub-tipos-mes"></p>
        <div class="area" id="a-tipos-mes"><canvas id="g-tipos-mes"></canvas></div>
      </div>
      <h2 class="sec">Estoque hoje</h2>
      <div class="kpis">
        ${kpi("Peças à venda", String(disp.length), `${disp.filter(p => p.status === "reservado").length} reservadas`)}
        ${kpi("Custo do estoque", R(disp.reduce((s, p) => s + custoTotal(p), 0)))}
        ${kpi("Valor de venda", R(disp.reduce((s, p) => s + n(p.preco_pix), 0)), `lucro previsto ${R(disp.reduce((s, p) => s + lucroPrev(p), 0))}`)}
        ${kpi("Tempo até vender", tempoMedio == null ? "—" : `${tempoMedio} dias`, "média entre compra e venda")}
      </div>
      <h2 class="sec">Gráficos</h2>
      <div class="graficos">
        <div class="graf graf--largo"><h3>Vendas e lucro por mês</h3><p class="sub">Valor vendido e lucro das vendas</p><div class="area"><canvas id="g-vendas"></canvas></div><details><summary>Ver números</summary><div id="t-vendas"></div></details></div>
        <div class="graf graf--largo"><h3>Para onde foi o dinheiro</h3><p class="sub">Gastos por mês: compra de peças pela data da compra, despesas pela data do pagamento</p><div class="area"><canvas id="g-gastos"></canvas></div><details><summary>Ver números</summary><div id="t-gastos"></div></details></div>
        <div class="graf"><h3>Lucro por categoria</h3><p class="sub">Vendas do período</p><div class="area"><canvas id="g-cat"></canvas></div><details><summary>Ver números</summary><div id="t-cat"></div></details></div>
        <div class="graf"><h3>Designers que mais deram lucro</h3><p class="sub">Os 8 primeiros, vendas do período</p><div class="area"><canvas id="g-des"></canvas></div><details><summary>Ver números</summary><div id="t-des"></div></details></div>
        <div class="graf"><h3>Despesas por categoria</h3><p class="sub">Período selecionado</p><div class="area"><canvas id="g-desp"></canvas></div><details><summary>Ver números</summary><div id="t-desp"></div></details></div>
        <div class="graf"><h3>Estoque parado</h3><p class="sub">Custo das peças à venda, por tempo desde a compra</p><div class="area"><canvas id="g-idade"></canvas></div><details><summary>Ver números</summary><div id="t-idade"></div></details></div>
        <div class="graf graf--largo"><h3>Leilão x compra direta</h3><p class="sub">Vendas do período, pela origem da peça</p><div id="t-origem"></div></div>
      </div>`;
    const sel = document.getElementById("per"); sel.value = periodo;
    sel.addEventListener("change", () => { periodo = sel.value; try { localStorage.setItem("crm-periodo", periodo); } catch {} painel(); });
    if (!sel.value) { periodo = "tudo"; sel.value = "tudo"; }

    const tabelaNum = (id, cab, linhas) => { document.getElementById(id).innerHTML = `<div class="rolagem"><table class="tabela"><thead><tr>${cab.map((c, i) => `<th class="${i ? "n" : ""}">${c}</th>`).join("")}</tr></thead><tbody>${linhas.map(l => `<tr style="cursor:default">${l.map((c, i) => `<td class="${i ? "n num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; };
    const semDados = id => { document.getElementById(id).parentElement.innerHTML = `<div class="vazio">Sem dados no período</div>`; };

    if (!window.Chart) { document.querySelectorAll(".graf .area").forEach(a => a.innerHTML = `<div class="vazio">Não foi possível carregar os gráficos. Recarregue a página.</div>`); }
    const Ch = window.Chart;
    if (Ch) { Ch.defaults.font.family = getComputedStyle(document.body).fontFamily; Ch.defaults.font.size = 11.5; Ch.defaults.color = COR.eixo; }
    const eixoR = { ticks: { callback: v => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR")} mil` : `R$ ${v}` }, grid: { color: COR.grade }, border: { display: false } };
    const tip = { callbacks: { label: c => `${c.dataset.label ? c.dataset.label + ": " : ""}${R(c.parsed.y ?? c.parsed.x)}` } };
    const barra = cor => ({ backgroundColor: cor, borderRadius: 4, borderSkipped: "start", borderWidth: 0, maxBarThickness: 34 });
    const novo = (id, cfg) => { if (!Ch) return; graficos.push(new Ch(document.getElementById(id), { ...cfg, options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { left: 6, right: 4 } }, interaction: { mode: "index", intersect: false }, ...cfg.options } })); };

    // Vendas e lucro por mês
    const mv = mesesDe(vs.map(v => v.data));
    if (!mv.length) semDados("g-vendas"); else {
      const f = mv.map(m => vs.filter(v => v.data.startsWith(m)).reduce((s, v) => s + n(v.valor), 0)), l = mv.map(m => vs.filter(v => v.data.startsWith(m)).reduce((s, v) => s + lucroVenda(v), 0));
      novo("g-vendas", { type: "bar", data: { labels: mv.map(rotMes), datasets: [{ label: "Vendido", data: f, ...barra(COR.vinho) }, { label: "Lucro", data: l, ...barra(COR.azul) }] },
        options: { plugins: { tooltip: tip, legend: { position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } } }, scales: { x: { grid: { display: false } }, y: eixoR } } });
      tabelaNum("t-vendas", ["Mês", "Vendido", "Lucro", "Vendas"], mv.map((m, i) => [rotMes(m), R(f[i]), R(l[i]), vs.filter(v => v.data.startsWith(m)).length]));
    }

    // Gastos por mês (empilhado)
    const mg = mesesDe([...compras.map(p => p.data_compra), ...ds.map(d => d.data)]);
    const series = [["Compra de peças", COR.vinho, p => n(p.compra)], ["Frete", COR.mostarda, p => n(p.frete)], ["Restauro", COR.azul, p => n(p.restauro)], ["NF e leiloeiro", COR.verde, p => n(p.nf) + n(p.leiloeiro)]];
    if (!mg.length) semDados("g-gastos"); else {
      const dados = series.map(([, , f]) => mg.map(m => compras.filter(p => (p.data_compra || "").startsWith(m)).reduce((s, p) => s + f(p), 0)));
      dados.push(mg.map(m => ds.filter(d => (d.data || "").startsWith(m)).reduce((s, d) => s + n(d.valor), 0)));
      const nomes = [...series.map(s => s[0]), "Despesas"], cores = [...series.map(s => s[1]), COR.barro];
      novo("g-gastos", { type: "bar", data: { labels: mg.map(rotMes), datasets: dados.map((d, i) => ({ label: nomes[i], data: d, backgroundColor: cores[i], borderColor: "#fff", borderWidth: { top: 2 }, borderRadius: i === dados.length - 1 ? 4 : 0, borderSkipped: "start", stack: "g", maxBarThickness: 34 })) },
        options: { plugins: { tooltip: { ...tip, callbacks: { ...tip.callbacks, footer: it => "Total: " + R(it.reduce((s, c) => s + c.parsed.y, 0)) } }, legend: { position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10 } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { ...eixoR, stacked: true } } } });
      tabelaNum("t-gastos", ["Mês", ...nomes, "Total"], mg.map((m, i) => [rotMes(m), ...dados.map(d => R(d[i])), R(dados.reduce((s, d) => s + d[i], 0))]));
    }

    // Barras horizontais
    const horiz = (id, tid, pares, rot, cab) => {
      if (!pares.length) return semDados(id);
      novo(id, { type: "bar", data: { labels: pares.map(p => p[0]), datasets: [{ label: rot, data: pares.map(p => p[1]), ...barra(COR.vinho), maxBarThickness: 22 }] },
        options: { indexAxis: "y", interaction: { mode: "nearest", axis: "y", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => R(c.parsed.x) } } }, scales: { x: eixoR, y: { grid: { display: false } } } } });
      tabelaNum(tid, cab, pares.map(p => [e(p[0]), R(p[1]), ...(p[2] ?? [])]));
    };
    const agrupar = (lista, chave, valor) => { const m = new Map(); for (const x of lista) { const k = chave(x) || "Sem informação"; m.set(k, (m.get(k) || 0) + valor(x)); } return [...m].sort((a, b) => b[1] - a[1]); };
    horiz("g-cat", "t-cat", agrupar(vs, v => peca(v.codigo)?.categoria || "Fora do inventário", lucroVenda), "Lucro", ["Categoria", "Lucro"]);
    horiz("g-des", "t-des", agrupar(vs, v => peca(v.codigo)?.designer || "Fora do inventário", lucroVenda).slice(0, 8), "Lucro", ["Designer", "Lucro"]);
    horiz("g-desp", "t-desp", agrupar(ds, d => d.categoria, d => n(d.valor)), "Despesas", ["Categoria", "Valor"]);

    // Estoque parado por idade
    const faixas = [["Até 30 dias", 0, 30], ["31 a 90 dias", 31, 90], ["91 a 180 dias", 91, 180], ["181 a 365 dias", 181, 365], ["Mais de 1 ano", 366, 1e9], ["Sem data", -1, -1]];
    const idade = faixas.map(([r, a, b]) => { const l = disp.filter(p => { const d = dias(p.data_compra, hoje()); return a < 0 ? d == null : d != null && d >= a && d <= b; }); return [r, l.reduce((s, p) => s + custoTotal(p), 0), [l.length]]; }).filter(x => x[2][0]);
    horiz("g-idade", "t-idade", idade, "Custo", ["Tempo", "Custo", "Peças"]);

    // Leilão x direto
    const org = ["Leilão", "Direto"].map(o => { const l = vs.filter(v => peca(v.codigo)?.origem === o), f = l.reduce((s, v) => s + n(v.valor), 0), lu = l.reduce((s, v) => s + lucroVenda(v), 0); return [o, l.length, R(f), R(lu), f ? P(lu / f) : "—"]; });
    tabelaNum("t-origem", ["Origem", "Vendas", "Vendido", "Lucro", "Margem real"], org);
    gastosPorTipo(compras, ds, novo, eixoR, tabelaNum);
  }

  // ---------- Quanto gastei por tipo (filtro + pizza + por mês) ----------
  let graficosTipo = [];
  function gastosPorTipo(compras, ds, novo, eixoR, tabelaNum) {
    graficosTipo = [];   // os gráficos antigos já foram destruídos pelo painel
    // Cor fixa por tipo (a cor segue o tipo, não a posição). Paleta validada para daltonismo nos vizinhos.
    const fixos = [["Compra de peças", p => n(p.compra)], ["Frete", p => n(p.frete)], ["Restauro", p => n(p.restauro)], ["NF e leiloeiro", p => n(p.nf) + n(p.leiloeiro)]];
    const totalCat = new Map(); D.despesas.itens.forEach(d => totalCat.set(d.categoria || "Sem categoria", (totalCat.get(d.categoria || "Sem categoria") || 0) + n(d.valor)));
    const catsDesp = [...totalCat].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const PALETA = [COR.vinho, COR.mostarda, COR.azul, COR.verde, COR.barro, "#6250d6", "#e87ba4", "#008300"], OUTROS = "#A39C94";
    const tipos = [...fixos.map(f => f[0]), ...catsDesp];
    const cor = t => PALETA[tipos.indexOf(t)] || OUTROS;
    const valorDe = (t, filtroMes = "") => {
      const f = fixos.find(x => x[0] === t);
      if (f) return compras.filter(p => (p.data_compra || "").startsWith(filtroMes)).reduce((s, p) => s + f[1](p), 0);
      return ds.filter(d => (d.categoria || "Sem categoria") === t && (d.data || "").startsWith(filtroMes)).reduce((s, d) => s + n(d.valor), 0);
    };
    let marcados;
    try { marcados = JSON.parse(localStorage.getItem("crm-tipos") || "null"); } catch {}
    if (!Array.isArray(marcados)) marcados = tipos.filter(t => t !== "Compra de peças");
    const chips = document.getElementById("chips");
    chips.innerHTML = tipos.map(t => `<label class="chip" style="--c:${cor(t)}"><input type="checkbox" value="${e(t)}" ${marcados.includes(t) ? "checked" : ""}><i></i>${e(t)}</label>`).join("")
      + `<button class="lnk" type="button" data-sel="todos">Marcar todos</button><button class="lnk" type="button" data-sel="desp">Tudo menos compra de peças</button><button class="lnk" type="button" data-sel="nada">Limpar</button>`;
    const desenhar = () => {
      graficosTipo.splice(0).forEach(g => { g.destroy(); const i = graficos.indexOf(g); if (i >= 0) graficos.splice(i, 1); });
      marcados = [...chips.querySelectorAll("input:checked")].map(i => i.value);
      try { localStorage.setItem("crm-tipos", JSON.stringify(marcados)); } catch {}
      const linhas = tipos.filter(t => marcados.includes(t)).map(t => [t, valorDe(t)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
      const total = linhas.reduce((s, x) => s + x[1], 0);
      document.getElementById("total-tipos").textContent = R(total);
      const area = document.getElementById("a-pizza"), areaMes = document.getElementById("a-tipos-mes");
      if (!linhas.length) {
        area.innerHTML = `<div class="vazio">Nada marcado ou sem gastos no período</div>`; areaMes.innerHTML = `<div class="vazio">—</div>`;
        document.getElementById("t-tipos").innerHTML = ""; return;
      }
      if (!area.querySelector("canvas")) area.innerHTML = `<canvas id="g-pizza"></canvas>`;
      if (!areaMes.querySelector("canvas")) areaMes.innerHTML = `<canvas id="g-tipos-mes"></canvas>`;
      // Pizza: no máximo 8 fatias com cor própria; o que passar disso vira "Outros"
      const comCor = linhas.filter(x => PALETA[tipos.indexOf(x[0])]), resto = linhas.filter(x => !PALETA[tipos.indexOf(x[0])]);
      const fatias = [...comCor, ...(resto.length ? [["Outros", resto.reduce((s, x) => s + x[1], 0)]] : [])];
      const antes = graficos.length;
      novo("g-pizza", { type: "doughnut", data: { labels: fatias.map(x => x[0]), datasets: [{ data: fatias.map(x => x[1]), backgroundColor: fatias.map(x => x[0] === "Outros" ? OUTROS : cor(x[0])), borderColor: "#fff", borderWidth: 2, hoverOffset: 6 }] },
        options: { cutout: "58%", interaction: { mode: "nearest", intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${R(c.parsed)} (${P(c.parsed / total)})` } } } } });
      // Por mês: soma dos tipos marcados
      const ms = mesesDe([...compras.map(p => p.data_compra), ...ds.map(d => d.data)]);
      const vals = ms.map(m => linhas.reduce((s, [t]) => s + valorDe(t, m), 0));
      document.getElementById("sub-tipos-mes").textContent = linhas.length === 1 ? linhas[0][0] : `Soma de ${linhas.length} tipos marcados`;
      novo("g-tipos-mes", { type: "bar", data: { labels: ms.map(rotMes), datasets: [{ label: "Gasto", data: vals, backgroundColor: linhas.length === 1 ? cor(linhas[0][0]) : COR.vinho, borderRadius: 4, borderSkipped: "start", maxBarThickness: 34 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => R(c.parsed.y) } } }, scales: { x: { grid: { display: false } }, y: eixoR } } });
      graficosTipo = graficos.slice(antes);
      tabelaNum("t-tipos", ["Tipo", "Valor", "% do marcado"], [...linhas.map(([t, v]) => [`<span class="sw" style="background:${cor(t)}"></span>${e(t)}`, R(v), P(v / total)]), ["<b>Total</b>", `<b>${R(total)}</b>`, "100%"]]);
    };
    chips.addEventListener("change", desenhar);
    chips.addEventListener("click", ev => {
      const b = ev.target.closest("[data-sel]"); if (!b) return;
      chips.querySelectorAll("input").forEach(i => { i.checked = b.dataset.sel === "todos" || (b.dataset.sel === "desp" && i.value !== "Compra de peças"); });
      desenhar();
    });
    desenhar();
  }

  // ---------- Contas (fluxo de caixa) ----------
  // Saldo de hoje + o que falta receber − o que falta pagar − custos fixos de cada mês = saldo previsto no fim de cada mês.
  // Contas atrasadas (data já passou e ainda pendentes) entram no mês atual.
  const addMes = (m, k) => { let [y, mm] = m.split("-").map(Number); mm += k; while (mm > 12) { mm -= 12; y++; } while (mm < 1) { mm += 12; y--; } return `${y}-${String(mm).padStart(2, "0")}`; };
  const difMeses = (a, b) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
  let graficoContas = null, filaContas = Promise.resolve(), timerContas = null, verPagos = false, mesContas = "todos";
  try { mesContas = localStorage.getItem("crm-mes-contas") || "todos"; } catch {}
  function guardarContas(msg = "contas") {
    const st = document.getElementById("salvo-contas"); if (st) { st.textContent = "Salvando…"; st.className = "cont"; }
    clearTimeout(timerContas);
    return new Promise(res => { timerContas = setTimeout(() => {
      filaContas = filaContas.then(() => salvar("contas", msg)).then(() => { const s2 = document.getElementById("salvo-contas"); if (s2) { s2.textContent = "Salvo"; setTimeout(() => { if (s2.textContent === "Salvo") s2.textContent = ""; }, 2500); } res(true); })
        .catch(err => { const s2 = document.getElementById("salvo-contas"); if (s2) { s2.textContent = "Não salvou: " + err.message; s2.className = "cont neg"; } res(false); });
    }, 500); });
  }
  const mediaVariavel = () => {   // média mensal das despesas dos 3 últimos meses completos
    const m0 = hoje().slice(0, 7), ms = [1, 2, 3].map(k => addMes(m0, -k));
    return ms.reduce((s, m) => s + D.despesas.itens.filter(d => (d.data || "").startsWith(m)).reduce((a, d) => a + n(d.valor), 0), 0) / 3;
  };
  function projecao() {
    const c = D.contas, hj = hoje(), m0 = hj.slice(0, 7), diaHoje = +hj.slice(8, 10);
    const pend = c.lancamentos.filter(l => l.status === "pendente");
    const ultimo = pend.map(l => l.data.slice(0, 7)).sort().pop() || m0;
    const nMeses = c.horizonte === "fim" ? Math.max(3, difMeses(m0, ultimo) + 1) : +c.horizonte;
    const meses = Array.from({ length: nMeses }, (_, i) => addMes(m0, i));
    let saldo = n(c.saldo.valor);
    return meses.map(m => {
      const ls = pend.filter(l => (l.data < hj ? m0 : l.data.slice(0, 7)) === m);
      const ent = ls.filter(l => l.tipo === "entrada").reduce((s, l) => s + n(l.valor), 0);
      const sai = ls.filter(l => l.tipo === "saida").reduce((s, l) => s + n(l.valor), 0);
      // Custo fixo entra sozinho, a não ser que já exista uma conta ligada a ele nesse mês; no mês atual, só o que ainda vai vencer
      const fixos = c.fixos.filter(f => f.ativo !== false && !c.lancamentos.some(l => l.fixo_id === f.id && l.data.slice(0, 7) === m) && (m !== m0 || n(f.dia || 1) > diaHoje));
      const fx = fixos.reduce((s, f) => s + n(f.valor), 0), vari = m === m0 ? 0 : n(c.variavel || 0);
      const res = ent - sai - fx - vari; saldo += res;
      return { m, ent, sai, fx, vari, res, saldo, fixos };
    });
  }

  function contas() {
    graficoContas?.destroy(); graficoContas = null;
    const c = D.contas, pr = projecao(), hj = hoje(), m0 = hj.slice(0, 7);
    if (mesContas !== "todos" && !pr.some(x => x.m === mesContas)) mesContas = "todos";
    const linhaMes = pr.find(x => x.m === mesContas), todos = mesContas === "todos";
    // Mês de cada conta: pendente atrasada conta no mês atual; paga ou recebida fica no mês da data
    const mesDe = l => l.status === "pendente" && l.data < hj ? m0 : l.data.slice(0, 7);
    const noMes = l => todos || mesDe(l) === mesContas;
    const pend = c.lancamentos.filter(l => l.status === "pendente" && noMes(l) && (todos ? mesDe(l) <= pr[pr.length - 1].m : true));
    const aRec = pend.filter(l => l.tipo === "entrada").reduce((s, l) => s + n(l.valor), 0);
    const aPag = pend.filter(l => l.tipo === "saida").reduce((s, l) => s + n(l.valor), 0);
    const fxPer = todos ? pr.reduce((s, x) => s + x.fx + x.vari, 0) : linhaMes.fx + linhaMes.vari;
    const fxMes = c.fixos.filter(f => f.ativo !== false).reduce((s, f) => s + n(f.valor), 0);
    const saldoHoje = n(c.saldo.valor), disponivel = saldoHoje + aRec, pagar = aPag + fxPer, sobra = disponivel - pagar;
    const nomeMes = todos ? "" : ` em ${rotMes(mesContas)}`;
    const menor = pr.reduce((a, b) => b.saldo < a.saldo ? b : a, pr[0]);
    const primeiroNeg = pr.find(x => x.saldo < 0), fim = pr[pr.length - 1];
    const kpi = (r, v, s2 = "") => `<div class="kpi"><p class="kpi__r">${r}</p><p class="kpi__v">${v}</p>${s2 ? `<p class="kpi__s">${s2}</p>` : ""}</div>`;
    const media = mediaVariavel();
    conteudo().innerHTML = `
      <div class="filtros">
        <label>Mês <select id="mes-contas"><option value="todos">Todos os meses</option>${pr.map(x => `<option value="${x.m}" ${x.m === mesContas ? "selected" : ""}>${rotMes(x.m)}${x.m === m0 ? " (este mês)" : ""}</option>`).join("")}</select></label>
        <label>Prever <select id="hz"><option value="fim">até a última conta lançada</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option></select></label>
        <label><input type="checkbox" id="verpagos" ${verPagos ? "checked" : ""}> Mostrar pagas e recebidas</label>
        <div class="dir"><span class="cont" id="salvo-contas" role="status"></span>
          <button class="bt bt--peq" type="button" data-nova="entrada">+ A receber</button><button class="bt bt--prim bt--peq" type="button" data-nova="saida">+ A pagar</button></div>
      </div>
      <div class="kpis">
        <div class="kpi"><p class="kpi__r">Saldo em conta</p><p class="kpi__v"><input class="cel cel--saldo" id="saldo" inputmode="decimal" value="${e(numCel(c.saldo.valor))}" aria-label="Saldo em conta hoje"></p><p class="kpi__s">atualizado em ${dataBR(c.saldo.data)}</p></div>
        ${kpi(`A receber${nomeMes} + saldo`, R(disponivel), `${R(saldoHoje)} na conta + ${R(aRec)} a receber (${pend.filter(l => l.tipo === "entrada").length})`)}
        ${kpi(`A pagar${nomeMes}`, R(pagar), `${R(aPag)} em contas (${pend.filter(l => l.tipo === "saida").length}) + ${R(fxPer)} de custos fixos${todos ? "" : ` do mês`}`)}
        ${kpi(todos ? "Sobra no fim de tudo" : `Sobra${nomeMes}`, `<span class="${sobra < 0 ? "neg" : ""}">${R(sobra)}</span>`, "saldo + a receber − a pagar")}
        ${todos ? kpi(`Saldo previsto em ${rotMes(fim.m)}`, `<span class="${fim.saldo < 0 ? "neg" : ""}">${R(fim.saldo)}</span>`, `menor saldo: <span class="${menor.saldo < 0 ? "neg" : ""}">${R(menor.saldo)}</span> em ${rotMes(menor.m)}`)
          : kpi(`Caixa previsto${nomeMes}`, `<span class="${linhaMes.saldo < 0 ? "neg" : ""}">${R(linhaMes.saldo)}</span>`, `começa o mês com ${R(linhaMes.saldo - linhaMes.res)}, contando os meses anteriores`)}
      </div>
      ${primeiroNeg ? `<div class="aviso-crm aviso-crm--erro" role="alert">Pelo que está lançado, o caixa fica negativo em <b>${rotMes(primeiroNeg.m)}</b> (${R(primeiroNeg.saldo)}). A previsão não conta vendas que ainda vão acontecer: só o que está lançado como a receber.</div>` : ""}
      <div class="graf graf--largo"><h3>Caixa mês a mês</h3><p class="sub">Entradas e saídas previstas e o saldo no fim de cada mês</p>
        <div class="area"><canvas id="g-caixa"></canvas></div>
        <div class="rolagem" style="max-height:none;margin-top:12px"><table class="tabela"><thead><tr><th>Mês</th><th class="n">A receber</th><th class="n">A pagar</th><th class="n">Custos fixos</th>${pr.some(x => x.vari) ? `<th class="n">Variáveis (estim.)</th>` : ""}<th class="n">Resultado</th><th class="n">Saldo no fim do mês</th></tr></thead>
        <tbody>${pr.map(x => `<tr data-mes="${x.m}" class="${x.m === mesContas ? "lin-sel" : ""}" title="Ver só ${rotMes(x.m)}"><td>${rotMes(x.m)}${x.m === hj.slice(0, 7) ? ' <span class="cinza" style="font-size:11px">(inclui atrasadas)</span>' : ""}</td><td class="n num">${R(x.ent)}</td><td class="n num">${R(x.sai)}</td><td class="n num" title="${e(x.fixos.map(f => `${f.nome}: ${R(f.valor)}`).join("\n"))}">${R(x.fx)}</td>${pr.some(y => y.vari) ? `<td class="n num">${R(x.vari)}</td>` : ""}<td class="n num ${x.res < 0 ? "neg" : ""}">${R(x.res)}</td><td class="n num ${x.saldo < 0 ? "neg" : ""}"><b>${R(x.saldo)}</b></td></tr>`).join("")}</tbody></table></div>
      </div>
      <div class="graficos" style="margin-top:14px">
        <div class="graf"><h3>A pagar${nomeMes}</h3><p class="sub">Clique numa conta para editar · ✓ marca como paga e desconta do saldo${todos ? "" : " · os custos fixos do mês aparecem aqui também"}</p><div id="l-saida"></div></div>
        <div class="graf"><h3>A receber${nomeMes}</h3><p class="sub">✓ marca como recebida e soma no saldo</p><div id="l-entrada"></div></div>
        <div class="graf"><h3>Custos fixos do mês</h3><p class="sub">Entram sozinhos em todo mês da previsão. Se você lançar a conta do mês (como o aluguel), ligue ela ao custo fixo para não contar duas vezes.</p><div id="l-fixos"></div></div>
        <div class="graf"><h3>Custos variáveis</h3><p class="sub">Anúncios, embalagem e outros gastos que mudam todo mês. Se quiser, coloque uma estimativa mensal para entrar na previsão.</p>
          <div class="campos" style="grid-template-columns:1fr"><div class="campo"><label for="vari">Estimativa por mês (R$)</label><input id="vari" class="cel" style="width:160px;text-align:left" inputmode="decimal" value="${e(numCel(c.variavel))}" placeholder="0">
          <button type="button" class="atalho" id="usar-media">Usar a média das despesas dos últimos 3 meses (${R(media)})</button></div></div></div>
      </div>`;
    const hz = document.getElementById("hz"); hz.value = c.horizonte || "fim";
    hz.addEventListener("change", () => { c.horizonte = hz.value; guardarContas("previsão"); contas(); });
    document.getElementById("verpagos").addEventListener("change", ev => { verPagos = ev.target.checked; contas(); });
    const escolherMes = m => { mesContas = m; try { localStorage.setItem("crm-mes-contas", m); } catch {} contas(); };
    document.getElementById("mes-contas").addEventListener("change", ev => escolherMes(ev.target.value));
    conteudo().querySelectorAll("tr[data-mes]").forEach(tr => tr.addEventListener("click", () => escolherMes(tr.dataset.mes === mesContas ? "todos" : tr.dataset.mes)));
    conteudo().querySelectorAll("[data-nova]").forEach(b => b.addEventListener("click", () => formConta(null, b.dataset.nova)));
    const saldo = document.getElementById("saldo");
    saldo.addEventListener("focus", () => saldo.select());
    saldo.addEventListener("keydown", ev => { if (ev.key === "Enter") saldo.blur(); });
    saldo.addEventListener("change", () => { c.saldo = { valor: n(saldo.value), data: hoje() }; guardarContas("saldo atualizado"); contas(); });
    const vari = document.getElementById("vari");
    vari.addEventListener("change", () => { c.variavel = n(vari.value) || null; guardarContas("custo variável estimado"); contas(); });
    document.getElementById("usar-media").addEventListener("click", () => { c.variavel = Math.round(media); guardarContas("custo variável estimado"); contas(); });

    // Listas a pagar / a receber
    for (const tipo of ["saida", "entrada"]) {
      const ls = c.lancamentos.filter(l => l.tipo === tipo && (verPagos || l.status === "pendente") && noMes(l)).sort((a, b) => a.data.localeCompare(b.data));
      const feito = tipo === "saida" ? "pago" : "recebido";
      const fixosMes = tipo === "saida" && !todos ? linhaMes.fixos : [];
      const diaFixo = f => `${mesContas}-${String(Math.min(28, n(f.dia) || 1)).padStart(2, "0")}`;
      const linhasFixos = fixosMes.map(f => `<tr class="lin-fixo" style="cursor:default"><td class="num">${dataBR(diaFixo(f))}</td><td class="larga">${e(f.nome)}<br><span class="cinza" style="font-size:11px">Custo fixo</span></td><td class="n num">${R(f.valor)}</td>
        <td><button type="button" class="ok" data-ok-fixo="${e(f.id)}" title="Marcar como pago" aria-label="Marcar ${e(f.nome)} como pago">✓</button></td></tr>`).join("");
      const totPend = ls.filter(l => l.status === "pendente").reduce((s, l) => s + n(l.valor), 0) + fixosMes.reduce((s, f) => s + n(f.valor), 0);
      document.getElementById("l-" + tipo).innerHTML = ls.length || fixosMes.length ? `<div class="rolagem" style="max-height:420px"><table class="tabela"><thead><tr><th>Data</th><th>O quê</th><th class="n">Valor</th><th><span class="visually-hidden">Situação</span></th></tr></thead><tbody>
        ${ls.map(l => { const atras = l.status === "pendente" && l.data < hj; return `<tr data-l="${e(l.id)}" class="${l.status !== "pendente" ? "lin-paga" : ""}">
          <td class="num">${dataBR(l.data)}${atras ? ' <span class="st st--atraso">atrasada</span>' : ""}</td><td class="larga">${e(l.descricao)}${l.categoria || l.quem ? `<br><span class="cinza" style="font-size:11px">${e([l.categoria, l.quem].filter(Boolean).join(" · "))}</span>` : ""}</td>
          <td class="n num">${R(l.valor)}</td><td><button type="button" class="ok ${l.status !== "pendente" ? "ok--feito" : ""}" data-ok="${e(l.id)}" title="${l.status === "pendente" ? `Marcar como ${feito}` : "Voltar para pendente"}" aria-label="${l.status === "pendente" ? `Marcar como ${feito}` : "Voltar para pendente"}">✓</button></td></tr>`; }).join("")}${linhasFixos}
        </tbody><tfoot><tr><td>Total pendente</td><td></td><td class="n num">${R(totPend)}</td><td></td></tr></tfoot></table></div>`
        : `<div class="vazio" style="height:80px">Nada pendente</div>`;
    }
    conteudo().querySelectorAll("#l-saida, #l-entrada").forEach(box => box.addEventListener("click", ev => {
      const okF = ev.target.closest("[data-ok-fixo]");
      if (okF) {   // paga um custo fixo do mês: vira uma conta paga ligada a ele (e sai da previsão daquele mês)
        const f = c.fixos.find(x => x.id === okF.dataset.okFixo); if (!f) return;
        const id = "L" + String(Math.max(0, ...c.lancamentos.map(y => parseInt(String(y.id).slice(1)) || 0)) + 1).padStart(3, "0");
        c.lancamentos.push({ id, tipo: "saida", data: `${mesContas}-${String(Math.min(28, n(f.dia) || 1)).padStart(2, "0")}`, categoria: "Custo fixo", descricao: f.nome, quem: "", valor: n(f.valor), status: "pago", pago_em: hoje(), fixo_id: f.id, obs: "" });
        c.saldo = { valor: n(c.saldo.valor) - n(f.valor), data: hoje() };
        guardarContas(`${f.nome} pago`); contas(); return;
      }
      const ok = ev.target.closest("[data-ok]");
      const l = c.lancamentos.find(x => x.id === (ok?.dataset.ok || ev.target.closest("tr[data-l]")?.dataset.l)); if (!l) return;
      if (!ok) return formConta(l);
      const sinal = l.tipo === "entrada" ? 1 : -1;
      if (l.status === "pendente") { l.status = l.tipo === "entrada" ? "recebido" : "pago"; l.pago_em = hoje(); c.saldo = { valor: n(c.saldo.valor) + sinal * n(l.valor), data: hoje() }; }
      else { l.status = "pendente"; delete l.pago_em; c.saldo = { valor: n(c.saldo.valor) - sinal * n(l.valor), data: hoje() }; }
      guardarContas(`${l.descricao} ${l.status}`); contas();
    }));

    // Custos fixos (edição direto na tabela)
    const fx = document.getElementById("l-fixos");
    fx.innerHTML = `<div class="rolagem" style="max-height:none"><table class="tabela"><thead><tr><th>Custo</th><th class="n">Valor</th><th class="n">Dia</th><th><span class="visually-hidden">Remover</span></th></tr></thead><tbody>
      ${c.fixos.map(f => `<tr data-f="${e(f.id)}" style="cursor:default"><td class="td-ed"><input class="cel cel--txt" data-c="nome" value="${e(f.nome)}" aria-label="Nome do custo"></td><td class="td-ed n"><input class="cel" data-c="valor" inputmode="decimal" value="${e(numCel(f.valor))}" aria-label="Valor de ${e(f.nome)}"></td>
        <td class="td-ed n"><input class="cel" style="width:52px" data-c="dia" inputmode="numeric" value="${e(f.dia || "")}" aria-label="Dia do vencimento de ${e(f.nome)}"></td><td><button type="button" class="wg__btn" data-tira-f="${e(f.id)}" aria-label="Remover ${e(f.nome)}">✕</button></td></tr>`).join("")}
      </tbody><tfoot><tr><td>Total por mês</td><td class="n num">${R(fxMes)}</td><td></td><td></td></tr></tfoot></table></div>
      <button type="button" class="bt bt--peq" id="novo-fixo" style="margin-top:10px">+ Custo fixo</button>`;
    fx.addEventListener("change", ev => {
      const i = ev.target.closest("input[data-c]"); if (!i) return;
      const f = c.fixos.find(x => x.id === i.closest("tr").dataset.f), k = i.dataset.c;
      f[k] = k === "nome" ? i.value.trim() : k === "dia" ? Math.min(31, Math.max(1, parseInt(i.value) || 1)) : n(i.value);
      guardarContas(`custo fixo ${f.nome}`); contas();
    });
    fx.addEventListener("click", ev => {
      const t = ev.target.closest("[data-tira-f]");
      if (t) {
        if (!t.dataset.conf) { t.dataset.conf = 1; t.textContent = "Remover?"; t.classList.add("wg__btn--perigo"); return; }
        c.fixos = c.fixos.filter(f => f.id !== t.dataset.tiraF); guardarContas("custo fixo removido"); contas(); return;
      }
      if (ev.target.closest("#novo-fixo")) { c.fixos.push({ id: "F" + Date.now().toString(36), nome: "Novo custo", valor: 0, dia: 10, ativo: true }); guardarContas("custo fixo"); contas();
        setTimeout(() => { const ins = document.querySelectorAll('#l-fixos input[data-c="nome"]'); ins[ins.length - 1]?.select(); }, 0); }
    });

    // Gráfico: entradas e saídas (barras) e saldo no fim do mês (linha), tudo em reais, num eixo só
    const Ch = window.Chart; if (!Ch) return;
    graficoContas = new Ch(document.getElementById("g-caixa"), {
      data: { labels: pr.map(x => rotMes(x.m)), datasets: [
        { type: "bar", label: "Entradas", data: pr.map(x => x.ent), backgroundColor: COR.azul, borderRadius: 4, borderSkipped: "start", maxBarThickness: 30, order: 2 },
        { type: "bar", label: "Saídas (com fixos)", data: pr.map(x => x.sai + x.fx + x.vari), backgroundColor: COR.vinho, borderRadius: 4, borderSkipped: "start", maxBarThickness: 30, order: 2 },
        { type: "line", label: "Saldo no fim do mês", data: pr.map(x => x.saldo), borderColor: "#300A15", backgroundColor: "#300A15", borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0, order: 1,
          segment: { borderDash: () => [] } } ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { left: 6, right: 4 } }, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: x => `${x.dataset.label}: ${R(x.parsed.y)}` } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR")} mil` : `R$ ${v}` }, grid: { color: ctx => ctx.tick.value === 0 ? "#B9AEA5" : COR.grade, lineWidth: ctx => ctx.tick.value === 0 ? 1.5 : 1 }, border: { display: false } } } },
    });
  }

  function formConta(l, tipoNovo) {
    const c = D.contas, novo = !l, x = l || { tipo: tipoNovo, data: hoje(), status: "pendente", categoria: "", descricao: "", quem: "", valor: "", fixo_id: "" };
    const ent = x.tipo === "entrada";
    const cats = unicos(c.lancamentos.filter(y => y.tipo === x.tipo), y => y.categoria);
    abrir(`<h2>${novo ? (ent ? "Novo valor a receber" : "Nova conta a pagar") : (ent ? "A receber" : "A pagar")}</h2>
      <div class="campos">
        ${campo("k-data", novo ? "Data (da 1ª parcela)" : "Data", x.data, { tipo: "date" })}
        ${campo("k-desc", "O quê", x.descricao, { cls: "campo--2" })}
        ${campo("k-cat", "Tipo", x.categoria, { lista: cats })}
        ${campo("k-quem", ent ? "De quem" : "Para quem", x.quem, { lista: unicos(c.lancamentos, y => y.quem) })}
        ${campo("k-valor", novo ? "Valor de cada parcela (R$)" : "Valor (R$)", x.valor, { tipo: "number" })}
        ${campo("k-status", "Situação", "", { tipo: "select", extra: [["pendente", "Pendente"], [ent ? "recebido" : "pago", ent ? "Recebido" : "Pago"]].map(([k, r]) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${r}</option>`).join("") })}
        ${novo ? campo("k-parc", "Repetir por quantos meses", "1", { tipo: "number" }) : ""}
        ${!ent ? campo("k-fixo", "É a conta de um custo fixo?", "", { tipo: "select", extra: `<option value="">Não</option>${c.fixos.map(f => `<option value="${e(f.id)}" ${x.fixo_id === f.id ? "selected" : ""}>${e(f.nome)}</option>`).join("")}` }) : ""}
        ${campo("k-obs", "Observações", x.obs, { tipo: "textarea", cls: "campo--3" })}
      </div>
      ${novo ? `<p class="cinza" style="font-size:12px;margin:10px 0 0">Para parcelado, coloque o número de meses: cria uma conta por mês com "1/N", "2/N"… no nome.</p>` : ""}
      ${rodape(!novo)}`, raiz => {
      raiz.querySelector("#salvar").addEventListener("click", async ev => {
        ev.currentTarget.disabled = true;
        const base = { ...x, data: val(raiz, "k-data"), descricao: val(raiz, "k-desc"), categoria: val(raiz, "k-cat"), quem: val(raiz, "k-quem"), valor: n(val(raiz, "k-valor")),
          status: val(raiz, "k-status"), fixo_id: val(raiz, "k-fixo"), obs: val(raiz, "k-obs") };
        const antes = structuredClone(c);
        try {
          if (!base.valor) throw new Error("Preencha o valor.");
          if (!base.data) throw new Error("Preencha a data.");
          if (!base.descricao) throw new Error("Escreva o que é.");
          const sinal = base.tipo === "entrada" ? 1 : -1, feito = s2 => s2 !== "pendente";
          if (novo) {
            const nP = Math.max(1, Math.min(60, parseInt(val(raiz, "k-parc")) || 1));
            const prox = () => "L" + String(Math.max(0, ...c.lancamentos.map(y => parseInt(String(y.id).slice(1)) || 0)) + 1).padStart(3, "0");
            for (let i = 0; i < nP; i++) {
              const d = new Date(base.data + "T12:00:00"); d.setMonth(d.getMonth() + i);
              const y = { ...base, id: prox(), data: d.toISOString().slice(0, 10), descricao: nP > 1 ? `${base.descricao} ${i + 1}/${nP}` : base.descricao, status: i === 0 ? base.status : "pendente" };
              if (feito(y.status)) { y.pago_em = hoje(); c.saldo = { valor: n(c.saldo.valor) + sinal * y.valor, data: hoje() }; }
              c.lancamentos.push(y);
            }
          } else {
            // Ajusta o saldo se mudou a situação ou o valor de algo já pago
            const delta = (feito(base.status) ? base.valor : 0) - (feito(x.status) ? n(x.valor) : 0);
            if (delta) c.saldo = { valor: n(c.saldo.valor) + sinal * delta, data: hoje() };
            if (feito(base.status) && !feito(x.status)) base.pago_em = hoje();
            c.lancamentos[c.lancamentos.indexOf(l)] = base;
          }
          if (!(await guardarContas(`${novo ? "nova conta" : "alteração"}: ${base.descricao}`))) throw new Error("Não foi possível salvar. Recarregue a página.");
          dlg.close(); contas();
        } catch (err) { D.contas = antes; erroForm(raiz, err); }
      });
      confirmarExclusao(raiz, async () => {
        const antes = structuredClone(c);
        if (l.status !== "pendente") c.saldo = { valor: n(c.saldo.valor) - (l.tipo === "entrada" ? 1 : -1) * n(l.valor), data: hoje() };
        c.lancamentos.splice(c.lancamentos.indexOf(l), 1);
        if (await guardarContas(`exclusão: ${l.descricao}`)) { dlg.close(); contas(); } else { D.contas = antes; erroForm(raiz, new Error("Não foi possível excluir.")); }
      });
    });
  }

  // ---------- Montar painel (arrastar e soltar) ----------
  // Valores (o que somar) e agrupamentos (como separar). Cada valor vem de uma fonte; nem todo agrupamento serve para toda fonte.
  const DIMS = { mes: "Mês", ano: "Ano", peca: "Peça", categoria: "Categoria", designer: "Designer", fornecedor: "Fornecedor", origem: "Origem", status: "Status",
    forma: "Forma de pagamento", cliente: "Cliente", tipo: "Tipo de despesa", subtipo: "Subcategoria da despesa", idade: "Tempo parado" };
  const ORDEM_IDADE = ["Até 30 dias", "31 a 90 dias", "91 a 180 dias", "181 a 365 dias", "Mais de 1 ano", "Sem data"];
  const faixaIdade = p => { const d = dias(p.data_compra, hoje()); return d == null || d < 0 ? "Sem data" : d <= 30 ? ORDEM_IDADE[0] : d <= 90 ? ORDEM_IDADE[1] : d <= 180 ? ORDEM_IDADE[2] : d <= 365 ? ORDEM_IDADE[3] : ORDEM_IDADE[4]; };
  const dimPeca = { peca: p => `${p.codigo} · ${p.peca || "Sem nome"}`, categoria: p => p.categoria || "Sem categoria", designer: p => p.designer || "Sem designer", fornecedor: p => p.fornecedor || "Sem fornecedor", origem: p => p.origem || "—", status: p => ROT_ST[p.status] || p.status || "—" };
  const viaPeca = k => v => { const p = peca(v.codigo); return p ? dimPeca[k](p) : "Fora do inventário"; };
  const porData = campo => ({ mes: x => (x[campo] || "").slice(0, 7) || "Sem data", ano: x => (x[campo] || "").slice(0, 4) || "Sem data" });
  const FONTES = {
    vendas: { itens: () => D.vendas.itens.filter(v => noPeriodo(v.data)), dims: { ...porData("data"), categoria: viaPeca("categoria"), designer: viaPeca("designer"), fornecedor: viaPeca("fornecedor"), origem: viaPeca("origem"), forma: v => v.forma || "—", cliente: v => cliente(v.cliente_id)?.nome || "Sem cliente",
      peca: v => `${v.codigo ? v.codigo + " · " : ""}${v.descricao || peca(v.codigo)?.peca || "Sem nome"}` } },
    compras: { itens: () => pecas().filter(p => noPeriodo(p.data_compra)), dims: { ...porData("data_compra"), ...dimPeca } },
    estoque: { itens: () => pecas().filter(p => p.status !== "vendido"), dims: { ...porData("data_compra"), ...dimPeca, idade: faixaIdade } },
    despesas: { itens: () => D.despesas.itens.filter(d => noPeriodo(d.data)), dims: { ...porData("data"), tipo: d => d.categoria || "Sem categoria", subtipo: d => d.subcategoria || "Sem subcategoria" } },
  };
  const soVal = l => l.reduce((s, v) => s + n(v.valor), 0);
  const MEDIDAS = {
    faturamento: { r: "Faturamento", g: "Vendas", f: "vendas", u: "R", s: v => n(v.valor) },
    lucro: { r: "Lucro das vendas", g: "Vendas", f: "vendas", u: "R", s: lucroVenda },
    nvendas: { r: "Nº de vendas", g: "Vendas", f: "vendas", u: "N", s: () => 1 },
    ticket: { r: "Ticket médio", g: "Vendas", f: "vendas", u: "R", a: l => l.length ? soVal(l) / l.length : 0 },
    margem: { r: "Margem real", g: "Vendas", f: "vendas", u: "P", a: l => soVal(l) ? l.reduce((s, v) => s + lucroVenda(v), 0) / soVal(l) : 0 },
    investido: { r: "Investido em peças", g: "Compras de peças", f: "compras", u: "R", s: custoPeca },
    compra: { r: "Compra", g: "Compras de peças", f: "compras", u: "R", s: p => n(p.compra) },
    frete: { r: "Frete", g: "Compras de peças", f: "compras", u: "R", s: p => n(p.frete) },
    restauro: { r: "Restauro", g: "Compras de peças", f: "compras", u: "R", s: p => n(p.restauro) },
    taxas: { r: "NF e leiloeiro", g: "Compras de peças", f: "compras", u: "R", s: p => n(p.nf) + n(p.leiloeiro) },
    npecas: { r: "Nº de peças compradas", g: "Compras de peças", f: "compras", u: "N", s: () => 1 },
    est_n: { r: "Peças à venda", g: "Estoque hoje", f: "estoque", u: "N", s: () => 1 },
    est_custo: { r: "Custo do estoque", g: "Estoque hoje", f: "estoque", u: "R", s: custoTotal },
    est_valor: { r: "Valor de venda do estoque", g: "Estoque hoje", f: "estoque", u: "R", s: p => n(p.preco_pix) },
    est_lucro: { r: "Lucro previsto", g: "Estoque hoje", f: "estoque", u: "R", s: lucroPrev },
    despesas: { r: "Despesas", g: "Despesas", f: "despesas", u: "R", s: d => n(d.valor) },
  };
  const DIMS_DE = { vendas: "das vendas", compras: "das compras", estoque: "do estoque", despesas: "das despesas" };
  const agregar = (m, l) => m.a ? m.a(l) : l.reduce((s, x) => s + m.s(x), 0);
  const fmtU = (u, v) => u === "P" ? P(v) : u === "N" ? Math.round(v).toLocaleString("pt-BR") : R(v);
  const eixoU = u => ({ ticks: { callback: v => u === "P" ? `${Math.round(v * 100)}%` : u === "N" ? v.toLocaleString("pt-BR") : Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR")} mil` : `R$ ${v}` }, grid: { color: COR.grade }, border: { display: false } });
  const SERIES = [COR.vinho, COR.azul, COR.mostarda];
  const PALETA8 = [COR.vinho, COR.mostarda, COR.azul, COR.verde, COR.barro, "#6250d6", "#e87ba4", "#008300"];
  const TIPOS = [["numero", "Número"], ["barras", "Barras"], ["linhas", "Linhas"], ["pizza", "Pizza"], ["tabela", "Tabela"]];
  const novoIdW = () => "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function painelExemplo() {
    return { widgets: [
      { id: novoIdW(), medidas: ["faturamento", "lucro"], dim: "", tipo: "numero", largura: 1 },
      { id: novoIdW(), medidas: ["despesas"], dim: "tipo", tipo: "pizza", largura: 1 },
      { id: novoIdW(), medidas: ["faturamento", "lucro"], dim: "mes", tipo: "barras", largura: 2 },
    ] };
  }
  const tituloAuto = w => (w.medidas.length ? `${w.medidas.map(k => MEDIDAS[k]?.r).filter(Boolean).join(" e ")}${w.dim ? ` por ${DIMS[w.dim].toLowerCase()}` : ""}` : (w.dim ? `Por ${DIMS[w.dim].toLowerCase()}` : "Novo gráfico"))
    + (w.dim && w.sub ? `, com ${DIMS[w.sub].toLowerCase()}` : "");
  const temDim = w => !!w.dim;
  const tipoValido = (w, t) => t === "numero" || (["barras", "linhas", "pizza", "tabela"].includes(t) && temDim(w) && (t !== "pizza" || (w.medidas.length === 1 && MEDIDAS[w.medidas[0]]?.u !== "P")));
  const tipoDe = w => tipoValido(w, w.tipo) ? w.tipo : (temDim(w) ? "barras" : "numero");

  function calcular(w) {
    const ms = w.medidas.map(k => MEDIDAS[k]).filter(Boolean);
    if (!w.dim) return { ms, fora: [], totais: ms.map(m => agregar(m, FONTES[m.f].itens())) };
    const ok = ms.filter(m => FONTES[m.f].dims[w.dim]), fora = ms.filter(m => !FONTES[m.f].dims[w.dim]);
    const mapas = ok.map(m => { const mp = new Map(); for (const x of FONTES[m.f].itens()) { const k = FONTES[m.f].dims[w.dim](x); if (!mp.has(k)) mp.set(k, []); mp.get(k).push(x); } return mp; });
    let chaves = [...new Set(mapas.flatMap(mp => [...mp.keys()]))];
    const ehMes = k => /^\d{4}-\d{2}$/.test(k);
    if (w.dim === "mes") chaves = [...mesesDe(chaves.filter(ehMes).map(k => k + "-01")), ...chaves.filter(k => !ehMes(k))];
    else if (w.dim === "ano") chaves.sort();
    else if (w.dim === "idade") chaves.sort((a, b) => ORDEM_IDADE.indexOf(a) - ORDEM_IDADE.indexOf(b));
    else if (ok.length) {
      // Ordena pelo primeiro valor; o que passar do limite vira "Outros"
      const v0 = k => agregar(ok[0], mapas[0].get(k) || []);
      chaves.sort((a, b) => v0(b) - v0(a));
      const lim = tipoDe(w) === "pizza" ? 8 : tipoDe(w) === "tabela" ? 1e9 : 12;
      if (chaves.length > lim) {
        const resto = chaves.slice(lim - 1); chaves = [...chaves.slice(0, lim - 1), "Outros"];
        mapas.forEach(mp => mp.set("Outros", resto.flatMap(k => mp.get(k) || [])));
      }
    }
    const valores = ok.map((m, i) => chaves.map(k => agregar(m, mapas[i].get(k) || [])));
    // Detalhar por: dentro de cada grupo (ex.: cada mês), lista as linhas do segundo agrupamento (ex.: cada peça)
    let subs = null, subFora = [];
    if (w.sub && w.sub !== w.dim) {
      subFora = ok.filter(m => !FONTES[m.f].dims[w.sub]);
      subs = chaves.map(k => {
        const sm = new Map();
        ok.forEach((m, i) => { const f = FONTES[m.f].dims[w.sub]; if (!f) return; for (const x of (mapas[i].get(k) || [])) { const sk = f(x); if (!sm.has(sk)) sm.set(sk, ok.map(() => [])); sm.get(sk)[i].push(x); } });
        const l = [...sm].map(([sk, ls]) => ({ chave: sk, rot: w.sub === "mes" && ehMes(sk) ? rotMes(sk) : sk, valores: ok.map((m, i) => agregar(m, ls[i])) }));
        return ["mes", "ano"].includes(w.sub) ? l.sort((a, b) => a.chave.localeCompare(b.chave)) : l.sort((a, b) => b.valores[0] - a.valores[0]);
      });
    }
    return { ms: ok, fora, chaves, valores, subs, subFora, rotulos: chaves.map(k => w.dim === "mes" && ehMes(k) ? rotMes(k) : k), totais: ok.map(m => agregar(m, FONTES[m.f].itens())) };
  }

  let graficosMontar = {}, arrastando = null, salvarTimer = null, filaPainel = Promise.resolve();
  function guardarPainel() {
    const st = document.getElementById("salvo-painel"); if (st) { st.textContent = "Salvando…"; st.className = "cont"; }
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => {
      filaPainel = filaPainel.then(() => salvar("dashboard", "painel montado"))
        .then(() => { const s2 = document.getElementById("salvo-painel"); if (s2) { s2.textContent = "Salvo"; setTimeout(() => { if (s2.textContent === "Salvo") s2.textContent = ""; }, 2500); } })
        .catch(err => { const s2 = document.getElementById("salvo-painel"); if (s2) { s2.textContent = "Não salvou: " + err.message; s2.className = "cont neg"; } });
    }, 900);
  }
  const opcoesMedidas = () => [...new Set(Object.values(MEDIDAS).map(m => m.g))].map(g => `<optgroup label="${e(g)}">${Object.entries(MEDIDAS).filter(([, m]) => m.g === g).map(([k, m]) => `<option value="${k}">${e(m.r)}</option>`).join("")}</optgroup>`).join("");

  function montarPainel() {
    Object.values(graficosMontar).forEach(g => g.destroy()); graficosMontar = {};
    const anos = [...new Set([...D.vendas.itens.map(v => v.data), ...pecas().map(p => p.data_compra), ...D.despesas.itens.map(d => d.data)].filter(Boolean).map(d => d.slice(0, 4)))].sort().reverse();
    const grupos = [...new Set(Object.values(MEDIDAS).map(m => m.g))];
    conteudo().innerHTML = `
      <div class="filtros"><label>Período <select id="per"><option value="tudo">Tudo</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="12m">Últimos 12 meses</option>${anos.map(a => `<option value="${a}">${a}</option>`).join("")}</select></label>
        <div class="dir"><span class="cont" id="salvo-painel" role="status"></span><button class="bt bt--peq" type="button" id="exemplo">Voltar ao exemplo</button><button class="bt bt--prim bt--peq" type="button" id="novo-w">+ Novo gráfico</button></div></div>
      <div class="montar">
        <aside class="dados" aria-label="Dados para arrastar">
          <p class="dados__ajuda">Arraste um <b>valor</b> para o espaço vazio para criar um gráfico. Arraste outro valor ou um <b>agrupamento</b> para dentro de um gráfico para completar.</p>
          ${grupos.map(g => `<h4>${e(g)}</h4><div class="dados__lista">${Object.entries(MEDIDAS).filter(([, m]) => m.g === g).map(([k, m]) => `<span class="dado dado--valor" draggable="true" data-t="medida" data-id="${k}">${e(m.r)}</span>`).join("")}</div>`).join("")}
          <h4>Agrupar por</h4><div class="dados__lista">${Object.entries(DIMS).map(([k, r]) => `<span class="dado dado--grupo" draggable="true" data-t="dim" data-id="${k}">${e(r)}</span>`).join("")}</div>
        </aside>
        <div class="quadro" id="quadro"></div>
      </div>`;
    const sel = document.getElementById("per"); sel.value = periodo; if (!sel.value) { periodo = "tudo"; sel.value = "tudo"; }
    sel.addEventListener("change", () => { periodo = sel.value; try { localStorage.setItem("crm-periodo", periodo); } catch {} desenharQuadro(); });
    document.getElementById("novo-w").addEventListener("click", () => { D.dashboard.widgets.push({ id: novoIdW(), medidas: [], dim: "", tipo: "", largura: 1 }); desenharQuadro(); guardarPainel(); });
    document.getElementById("exemplo").addEventListener("click", ev => {
      const b = ev.currentTarget; if (!b.dataset.conf) { b.dataset.conf = 1; b.textContent = "Apagar meus gráficos?"; return; }
      D.dashboard = { ...painelExemplo(), }; desenharQuadro(); guardarPainel(); b.textContent = "Voltar ao exemplo"; delete b.dataset.conf;
    });
    const aside = conteudo().querySelector(".dados");
    aside.addEventListener("dragstart", ev => { const d = ev.target.closest(".dado"); if (!d) return; arrastando = { t: d.dataset.t, id: d.dataset.id }; ev.dataTransfer.setData("text/plain", d.textContent); ev.dataTransfer.effectAllowed = "copy"; document.body.classList.add("arrastando"); });
    aside.addEventListener("dragend", fimArraste);
    ligarQuadro();
    desenharQuadro();
  }
  function fimArraste() { arrastando = null; document.body.classList.remove("arrastando"); document.querySelectorAll(".alvo, .slot--alvo").forEach(x => x.classList.remove("alvo", "slot--alvo")); }

  function desenharQuadro() {
    Object.values(graficosMontar).forEach(g => g.destroy()); graficosMontar = {};
    const q = document.getElementById("quadro");
    q.innerHTML = D.dashboard.widgets.map(w => `<article class="wg ${w.largura === 2 ? "wg--2" : ""}" data-w="${w.id}"></article>`).join("")
      + `<div class="nova" data-nova>Solte um valor aqui para criar um gráfico novo</div>`;
    D.dashboard.widgets.forEach(desenharWidget);
  }

  function desenharWidget(w) {
    const el = document.querySelector(`[data-w="${w.id}"]`); if (!el) return;
    graficosMontar[w.id]?.destroy(); delete graficosMontar[w.id];
    const t = tipoDe(w), c = calcular(w);
    const titulo = w.titulo || tituloAuto(w);
    el.innerHTML = `
      <header class="wg__topo">
        <span class="wg__alca" draggable="true" title="Arraste para mudar de lugar" aria-hidden="true">⠿</span>
        <input class="wg__tit" value="${e(titulo)}" aria-label="Título do gráfico">
        <button class="wg__btn" type="button" data-acao="largura" title="${w.largura === 2 ? "Deixar estreito" : "Deixar largo"}">${w.largura === 2 ? "↔ Estreito" : "↔ Largo"}</button>
        <button class="wg__btn" type="button" data-acao="excluir" title="Remover gráfico" aria-label="Remover gráfico">✕</button>
      </header>
      <div class="wg__tipos" role="group" aria-label="Tipo de gráfico">${TIPOS.map(([k, r]) => `<button type="button" data-tipo="${k}" aria-pressed="${t === k}" ${tipoValido(w, k) ? "" : "disabled"}>${r}</button>`).join("")}</div>
      <div class="wg__slots">
        <div class="slot" data-slot="medidas"><span class="slot__r">Valores</span>${w.medidas.map(k => `<span class="pilula pilula--valor">${e(MEDIDAS[k]?.r || k)}<button type="button" data-tira-medida="${k}" aria-label="Tirar ${e(MEDIDAS[k]?.r || k)}">✕</button></span>`).join("")}
          <select class="mais" data-mais="medida" aria-label="Adicionar valor"><option value="">+ valor</option>${opcoesMedidas()}</select></div>
        <div class="slot" data-slot="dim"><span class="slot__r">Agrupar por</span>${w.dim ? `<span class="pilula pilula--grupo">${e(DIMS[w.dim])}<button type="button" data-tira-dim aria-label="Tirar agrupamento">✕</button></span>` : ""}
          <select class="mais" data-mais="dim" aria-label="Agrupar por"><option value="">${w.dim ? "trocar" : "+ agrupar"}</option>${Object.entries(DIMS).map(([k, r]) => `<option value="${k}">${e(r)}</option>`).join("")}</select></div>
        ${w.dim ? `<div class="slot" data-slot="sub"><span class="slot__r">Detalhar por</span>${w.sub ? `<span class="pilula pilula--grupo">${e(DIMS[w.sub])}<button type="button" data-tira-sub aria-label="Tirar detalhamento">✕</button></span>` : ""}
          <select class="mais" data-mais="sub" aria-label="Detalhar por"><option value="">${w.sub ? "trocar" : "+ detalhar"}</option>${Object.entries(DIMS).filter(([k]) => k !== w.dim).map(([k, r]) => `<option value="${k}">${e(r)}</option>`).join("")}</select></div>` : ""}
      </div>
      <p class="wg__aviso" role="status">${c.fora.length ? `${c.fora.map(m => e(m.r)).join(", ")} não ${c.fora.length > 1 ? "podem" : "pode"} ser agrupado por ${e(DIMS[w.dim].toLowerCase())}.` : ""}${c.subFora?.length ? ` ${c.subFora.map(m => e(m.r)).join(", ")} não ${c.subFora.length > 1 ? "podem" : "pode"} ser detalhado por ${e(DIMS[w.sub].toLowerCase())}.` : ""}</p>
      <div class="wg__corpo"></div>`;
    const corpo = el.querySelector(".wg__corpo");
    if (!w.medidas.length) { corpo.innerHTML = `<div class="vazio vazio--alvo">Arraste um valor para cá</div>`; return; }
    if (!c.ms.length) { corpo.innerHTML = `<div class="vazio">Escolha outro agrupamento</div>`; return; }
    if (t === "numero") {
      corpo.innerHTML = `<div class="wg__nums">${c.ms.map((m, i) => `<div><p class="kpi__r">${e(m.r)}</p><p class="kpi__v">${fmtU(m.u, c.totais[i])}</p></div>`).join("")}</div>`; return;
    }
    if (!c.chaves.length) { corpo.innerHTML = `<div class="vazio">Sem dados no período</div>`; return; }
    const tabelaW = (alt, comRodape) => `<div class="rolagem" style="max-height:${alt}px"><table class="tabela"><thead><tr><th>${e(DIMS[w.dim])}${c.subs ? ` / ${e(DIMS[w.sub])}` : ""}</th>${c.ms.map(m => `<th class="n">${e(m.r)}</th>`).join("")}</tr></thead><tbody>${c.rotulos.map((r, i) =>
        `<tr class="${c.subs ? "lin-grupo" : ""}" style="cursor:default"><td>${e(r)}</td>${c.ms.map((m, j) => `<td class="n num">${fmtU(m.u, c.valores[j][i])}</td>`).join("")}</tr>`
        + (c.subs ? c.subs[i].map(sb => `<tr class="lin-sub" style="cursor:default"><td>${e(sb.rot)}</td>${c.ms.map((m, j) => `<td class="n num">${fmtU(m.u, sb.valores[j])}</td>`).join("")}</tr>`).join("") : "")).join("")}</tbody>
        ${comRodape ? `<tfoot><tr><td>Total</td>${c.ms.map((m, j) => `<td class="n num">${fmtU(m.u, c.totais[j])}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`;
    if (t === "tabela") { corpo.innerHTML = tabelaW(c.subs ? 520 : 340, true); return; }
    const Ch = window.Chart; if (!Ch) { corpo.innerHTML = `<div class="vazio">Não foi possível carregar os gráficos.</div>`; return; }
    const u = c.ms[0].u, horizontal = t === "barras" && !["mes", "ano", "idade"].includes(w.dim);
    const altura = horizontal ? Math.max(220, c.chaves.length * 28 + 50) : 260;
    corpo.innerHTML = `<div class="area" style="height:${altura}px"><canvas></canvas></div><details ${c.subs ? "open" : ""}><summary>${c.subs ? `Ver números com ${e(DIMS[w.sub].toLowerCase())}` : "Ver números"}</summary>${tabelaW(c.subs ? 360 : 260, false)}</details>`;
    const cv = corpo.querySelector("canvas");
    const rodapeTip = items => {
      if (!c.subs || !items.length) return "";
      const l = c.subs[items[0].dataIndex] || [], m0 = c.ms[0];
      return [`${DIMS[w.sub]}:`, ...l.slice(0, 8).map(sb => `• ${sb.rot.length > 46 ? sb.rot.slice(0, 45) + "…" : sb.rot}  ${fmtU(m0.u, sb.valores[0])}`), ...(l.length > 8 ? [`… e mais ${l.length - 8}`] : [])];
    };
    const tip = { footerFont: { weight: "normal" }, callbacks: { footer: rodapeTip, label: x => `${c.ms.length > 1 || t === "pizza" ? (t === "pizza" ? x.label : x.dataset.label) + ": " : ""}${fmtU(u, t === "pizza" ? x.parsed : horizontal ? x.parsed.x : x.parsed.y)}${t === "pizza" && c.totais[0] ? ` (${P(x.parsed / c.totais[0])})` : ""}` } };
    const legenda = { display: c.ms.length > 1 || t === "pizza", position: t === "pizza" ? "right" : "top", align: "start", labels: { boxWidth: 10, boxHeight: 10 } };
    const base = { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { left: 6, right: 4 } }, plugins: { legend: legenda, tooltip: tip } };
    let cfg;
    if (t === "pizza") cfg = { type: "doughnut", data: { labels: c.rotulos, datasets: [{ data: c.valores[0], backgroundColor: c.rotulos.map((r, i) => r === "Outros" ? "#A39C94" : PALETA8[i % 8]), borderColor: "#fff", borderWidth: 2 }] }, options: { ...base, cutout: "55%" } };
    else if (t === "linhas") cfg = { type: "line", data: { labels: c.rotulos, datasets: c.ms.map((m, j) => ({ label: m.r, data: c.valores[j], borderColor: SERIES[j], backgroundColor: SERIES[j], borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0 })) },
      options: { ...base, interaction: { mode: "index", intersect: false }, scales: { x: { grid: { display: false } }, y: eixoU(u) } } };
    else cfg = { type: "bar", data: { labels: c.rotulos, datasets: c.ms.map((m, j) => ({ label: m.r, data: c.valores[j], backgroundColor: SERIES[j], borderRadius: 4, borderSkipped: "start", maxBarThickness: horizontal ? 22 : 34 })) },
      options: { ...base, indexAxis: horizontal ? "y" : "x", interaction: { mode: "index", axis: horizontal ? "y" : "x", intersect: false }, scales: horizontal ? { x: eixoU(u), y: { grid: { display: false } } } : { x: { grid: { display: false } }, y: eixoU(u) } } };
    graficosMontar[w.id] = new Ch(cv, cfg);
  }

  const wDe = el => D.dashboard.widgets.find(w => w.id === el?.closest("[data-w]")?.dataset.w);
  function avisoW(w, txt) { const p = document.querySelector(`[data-w="${w.id}"] .wg__aviso`); if (p) { p.textContent = txt; p.classList.add("wg__aviso--forte"); } }
  function addMedida(w, k) {
    if (w.medidas.includes(k)) return false;
    if (w.medidas.length >= 3) { avisoW(w, "Cabem até 3 valores por gráfico. Crie outro gráfico para este."); return false; }
    const u = MEDIDAS[w.medidas[0]]?.u;
    if (u && MEDIDAS[k].u !== u) { avisoW(w, `${MEDIDAS[k].r} é ${MEDIDAS[k].u === "P" ? "uma porcentagem" : MEDIDAS[k].u === "N" ? "uma quantidade" : "em reais"} e não mistura com os outros valores. Crie outro gráfico para ele.`); return false; }
    w.medidas.push(k); return true;
  }
  function soltar(destino, alvoEl, slotNome) {
    if (!arrastando) return;
    const a = arrastando, ws = D.dashboard.widgets;
    if (a.t === "widget") {
      const de = ws.findIndex(w => w.id === a.id); if (de < 0) return;
      const [mov] = ws.splice(de, 1);
      const para = destino ? ws.indexOf(destino) : ws.length;
      ws.splice(para < 0 ? ws.length : para, 0, mov);
      desenharQuadro(); guardarPainel(); return;
    }
    if (!destino) {   // espaço vazio: cria um gráfico novo
      const w = { id: novoIdW(), medidas: a.t === "medida" ? [a.id] : [], dim: a.t === "dim" ? a.id : "", tipo: "", largura: 1 };
      ws.push(w); desenharQuadro(); guardarPainel(); return;
    }
    let mudou = false;
    if (a.t === "medida") mudou = addMedida(destino, a.id);
    else if (a.t === "dim" && slotNome === "sub" && destino.dim && destino.dim !== a.id) { destino.sub = a.id; mudou = true; }
    else if (a.t === "dim" && destino.dim !== a.id) { if (destino.sub === a.id) destino.sub = ""; destino.dim = a.id; if (destino.tipo === "numero") destino.tipo = ""; mudou = true; }
    if (mudou) { desenharWidget(destino); guardarPainel(); }
  }
  function ligarQuadro() {
    const q = document.getElementById("quadro");
    q.addEventListener("dragstart", ev => {
      const h = ev.target.closest(".wg__alca"); if (!h) return;
      const w = wDe(h); arrastando = { t: "widget", id: w.id }; ev.dataTransfer.setData("text/plain", "grafico"); ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setDragImage(h.closest(".wg"), 20, 20); document.body.classList.add("arrastando");
    });
    q.addEventListener("dragend", fimArraste);
    q.addEventListener("dragover", ev => {
      if (!arrastando) return;
      const alvo = ev.target.closest("[data-nova], .wg"); if (!alvo) return;
      ev.preventDefault(); ev.dataTransfer.dropEffect = arrastando.t === "widget" ? "move" : "copy";
      document.querySelectorAll(".alvo, .slot--alvo").forEach(x => x !== alvo && x.classList.remove("alvo", "slot--alvo")); alvo.classList.add("alvo");
      const sl = ev.target.closest('.slot[data-slot="sub"]'); if (sl && arrastando.t === "dim") sl.classList.add("slot--alvo");
    });
    q.addEventListener("dragleave", ev => { const alvo = ev.target.closest("[data-nova], .wg"); if (alvo && !alvo.contains(ev.relatedTarget)) alvo.classList.remove("alvo"); });
    q.addEventListener("drop", ev => {
      const alvo = ev.target.closest("[data-nova], .wg"); if (!alvo || !arrastando) return;
      ev.preventDefault(); soltar(alvo.matches("[data-nova]") ? null : wDe(alvo), alvo, ev.target.closest(".slot")?.dataset.slot); fimArraste();
    });
    q.addEventListener("click", ev => {
      const w = wDe(ev.target); if (!w) return;
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.tipo) { w.tipo = b.dataset.tipo; desenharWidget(w); guardarPainel(); }
      else if (b.dataset.acao === "largura") { w.largura = w.largura === 2 ? 1 : 2; desenharQuadro(); guardarPainel(); }
      else if (b.dataset.acao === "excluir") {
        if (!b.dataset.conf) { b.dataset.conf = 1; b.textContent = "Remover?"; b.classList.add("wg__btn--perigo"); return; }
        graficosMontar[w.id]?.destroy(); delete graficosMontar[w.id];
        D.dashboard.widgets.splice(D.dashboard.widgets.indexOf(w), 1); desenharQuadro(); guardarPainel();
      }
      else if (b.dataset.tiraMedida) { w.medidas = w.medidas.filter(k => k !== b.dataset.tiraMedida); desenharWidget(w); guardarPainel(); }
      else if ("tiraDim" in b.dataset) { w.dim = ""; w.sub = ""; desenharWidget(w); guardarPainel(); }
      else if ("tiraSub" in b.dataset) { w.sub = ""; desenharWidget(w); guardarPainel(); }
    });
    q.addEventListener("change", ev => {
      const w = wDe(ev.target); if (!w) return;
      const s = ev.target.closest("select.mais");
      if (s && s.value) {
        const ok = s.dataset.mais === "medida" ? addMedida(w, s.value)
          : s.dataset.mais === "sub" ? (w.sub = s.value, true)
          : (w.sub === s.value && (w.sub = ""), w.dim = s.value, w.tipo === "numero" && (w.tipo = ""), true);
        s.value = ""; if (ok) { desenharWidget(w); guardarPainel(); }
      }
    });
    q.addEventListener("input", ev => { const i = ev.target.closest(".wg__tit"); if (!i) return; const w = wDe(i); w.titulo = i.value.trim() && i.value.trim() !== tituloAuto(w) ? i.value.trim() : ""; guardarPainel(); });
  }

  carregar();
})();
