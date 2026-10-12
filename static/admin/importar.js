// Importador em lote: lê uma planilha (.xlsx, .csv ou .tsv), mostra uma prévia
// e cria/atualiza as fichas das peças no GitHub num único envio (um só deploy).
(() => {
  const btn = document.getElementById("importar-btn");
  if (!btn) return;

  const TIPOS = ["Poltronas", "Cadeiras", "Sofás", "Mesas de centro", "Mesas laterais", "Mesas de jantar", "Bancos", "Aparadores/Buffet", "Escrivaninhas", "Iluminação", "Objetos"];
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const slugify = s => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hoje = () => new Date().toISOString().slice(0, 10);

  // Cabeçalhos aceitos (modelo da Voluta e a planilha de inventário)
  const COLUNAS = {
    codigo: ["codigo", "cod", "vlt", "codigo vlt", "codigo interno"],
    titulo: ["peca", "nome da peca", "titulo", "nome"],
    designer: ["designer", "designer ou fabricante", "fabricante"],
    ano: ["ano", "ano ou decada", "decada"],
    categoria: ["categoria", "tipo", "tipo de peca"],
    status: ["status", "situacao"],
    preco: ["preco a vista", "preco pix", "preco", "preco a vista (r$)"],
    preco_obs: ["observacao do preco", "obs preco"],
    dimensoes: ["dimensoes"],
    materiais: ["materiais", "material"],
    descricao: ["descricao"],
    data_compra: ["data da compra", "compra em"],
    data: ["data de entrada", "entrada no site", "data de entrada no acervo"],
    destaque: ["destaque", "mostrar em destaques"],
  };
  const TIPO_ALIAS = {
    "cadeira & banquetas": "Cadeiras", "cadeiras & banquetas": "Cadeiras", "cadeira": "Cadeiras", "banquetas": "Bancos",
    "mesas de centro": "Mesas de centro", "mesa de centro": "Mesas de centro", "meas laterais": "Mesas laterais", "mesa lateral": "Mesas laterais",
    "mesas de jantar": "Mesas de jantar", "mesa de jantar": "Mesas de jantar", "aparadores, estantes & buffet": "Aparadores/Buffet", "buffet": "Aparadores/Buffet", "aparadores": "Aparadores/Buffet",
    "iluminacao": "Iluminação", "luminaria": "Iluminação", "tapecarias & objetos": "Objetos", "objeto": "Objetos", "sofa": "Sofás", "poltrona": "Poltronas", "banco": "Bancos", "escrivaninha": "Escrivaninhas",
  };
  const DESIGNER_ALIAS = { "anonimo": "Anônimo", "scapinelli": "Giuseppe Scapinelli", "liceu de artes": "Liceu de Artes e Ofícios", "de sede switzerlan": "De Sede", "de sede switzerland": "De Sede", "michel ducaroy / ligne roset": "Michel Ducaroy", "finland": "Casa Finland" };

  // ---------- leitura da planilha ----------
  const carregarXLSX = () => window.XLSX ? Promise.resolve() : new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = ok; s.onerror = () => falha(new Error("não foi possível carregar o leitor de planilhas"));
    document.head.appendChild(s);
  });

  const dataISO = v => {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const t = String(v).trim();
    let m;
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; // dd/mm/aaaa
    const meses = { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12 };
    if ((m = t.match(/^(\d{1,2})[-\s]([a-z]{3})[a-z]*[-\s](\d{4})$/i)) && meses[m[2].toLowerCase()]) return `${m[3]}-${String(meses[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  };
  const numero = v => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Math.round(v);
    let t = String(v).replace(/[^\d.,]/g, "");
    if (!t) return null;
    if (/,\d{2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");      // 1.234,56
    else if (/\.\d{2}$/.test(t)) t = t.replace(/,/g, "");                    // 1,234.56
    else t = t.replace(/[.,]/g, "");                                          // 1.234 ou 1,234
    const n = Math.round(Number(t));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const statusDe = v => { const t = norm(v); return t.startsWith("vend") ? "vendido" : t.startsWith("ocult") ? "oculto" : t.startsWith("dispon") ? "disponivel" : ""; };
  const tipoDe = v => { const t = norm(v); if (!t) return ""; const direto = TIPOS.find(x => norm(x) === t); return direto || TIPO_ALIAS[t] || ""; };

  async function lerArquivo(arquivo) {
    await carregarXLSX();
    const buf = await arquivo.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const aba = wb.SheetNames.find(n => /pe[cç]as|importar|invent/i.test(n)) || wb.SheetNames[0];
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: "" });
    // Acha a linha de cabeçalho (a primeira que tem "peça"/"título")
    const iCab = linhas.findIndex(l => l.some(c => COLUNAS.titulo.includes(norm(c))));
    if (iCab < 0) throw new Error('não achei a coluna "Peça" no arquivo');
    const cab = linhas[iCab].map(norm);
    const idx = {};
    for (const [campo, nomes] of Object.entries(COLUNAS)) idx[campo] = cab.findIndex(c => nomes.includes(c));
    // Planilha de inventário: o código fica na primeira coluna sem título
    if (idx.codigo < 0) idx.codigo = linhas.slice(iCab + 1, iCab + 6).some(l => /^VLT-/i.test(String(l[0]))) ? 0 : -1;
    const v = (l, campo) => idx[campo] >= 0 ? l[idx[campo]] : "";
    return linhas.slice(iCab + 1).map((l, n) => ({ linha: iCab + n + 2,
      codigo: String(v(l, "codigo") || "").trim(), titulo: String(v(l, "titulo") || "").trim(), designer: String(v(l, "designer") || "").trim(),
      ano: String(v(l, "ano") || "").trim(), categoriaOrig: String(v(l, "categoria") || "").trim(), statusOrig: String(v(l, "status") || "").trim(),
      preco: numero(v(l, "preco")), preco_obs: String(v(l, "preco_obs") || "").trim(), dimensoes: String(v(l, "dimensoes") || "").trim(),
      materiais: String(v(l, "materiais") || "").trim(), descricao: String(v(l, "descricao") || "").trim(),
      data_compra: dataISO(v(l, "data_compra")), data: dataISO(v(l, "data")), destaque: /^(sim|s|x|true|1)$/i.test(String(v(l, "destaque")).trim()),
    })).filter(r => r.titulo);
  }

  // ---------- montar fichas ----------
  function preparar(linhas, inv) {
    const designersConhecidos = [...new Set(inv.fichas.map(f => f.dados.designer).filter(Boolean))];
    const designerDe = d => { const t = norm(d); if (!t) return "Anônimo"; return DESIGNER_ALIAS[t] || designersConhecidos.find(x => norm(x) === t) || d; };
    const porCodigo = new Map();
    inv.fichas.forEach(f => String(f.dados.codigo || "").split(",").map(c => c.trim().toUpperCase()).filter(Boolean).forEach(c => porCodigo.set(c, f)));
    const nomesUsados = new Set(inv.fichas.map(f => f.arquivo));

    return linhas.map(r => {
      const avisos = [];
      const categoria = tipoDe(r.categoriaOrig);
      if (!categoria) avisos.push(r.categoriaOrig ? `tipo "${r.categoriaOrig}" não reconhecido: escolha depois no painel` : "sem tipo de peça");
      const status = statusDe(r.statusOrig) || "disponivel";
      const existente = r.codigo ? porCodigo.get(r.codigo.toUpperCase()) : null;
      const ficha = {
        titulo: r.titulo, designer: designerDe(r.designer), ano: r.ano, categoria: categoria || "Objetos", status,
        preco: r.preco, preco_obs: r.preco_obs, parcelamento: r.preco ? "em até 12x" : "", dimensoes: r.dimensoes, materiais: r.materiais,
        descricao: r.descricao, imagens: [], destaque: r.destaque, ordem: 100, codigo: r.codigo, data_compra: r.data_compra, data: r.data || hoje(),
      };
      let arquivo;
      if (existente) arquivo = existente.arquivo;
      else {
        let base = slugify(ficha.designer === "Anônimo" ? ficha.titulo : `${ficha.designer} ${ficha.titulo}`) || slugify(r.codigo) || "peca";
        arquivo = `${base}.json`;
        if (nomesUsados.has(arquivo)) arquivo = `${base}-${slugify(r.codigo || String(r.linha))}.json`;
        let n = 2; while (nomesUsados.has(arquivo)) arquivo = `${base}-${n++}.json`;
        nomesUsados.add(arquivo);
      }
      if (!r.descricao) avisos.push("sem descrição");
      return { r, ficha, arquivo, existente, avisos };
    });
  }

  // ---------- envio ao GitHub (um commit só) ----------
  async function enviar(itens, atualizar, inv) {
    const api = (caminho, opts = {}) => fetch(`https://api.github.com/repos/${inv.repo.dono}/${inv.repo.nome}${caminho}`, {
      ...opts, headers: { Authorization: "token " + inv.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    }).then(async r => { if (!r.ok) throw new Error(`GitHub respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`); return r.json(); });

    const arquivos = [];
    for (const it of itens) {
      if (it.existente && !atualizar) continue;
      let dados = it.ficha;
      if (it.existente) {
        // Atualiza só o que veio preenchido na planilha; fotos, destaque e textos já existentes são mantidos
        const atual = it.existente.dados;
        dados = { ...atual };
        for (const [k, v] of Object.entries(it.ficha)) {
          if (["imagens", "destaque", "ordem", "data"].includes(k)) continue;
          if (v !== "" && v != null) dados[k] = v;
        }
      }
      arquivos.push({ path: `${inv.repo.pasta}/${it.arquivo}`, mode: "100644", type: "blob", content: JSON.stringify(dados, null, 2) });
    }
    if (!arquivos.length) throw new Error("nada para enviar");
    const ref = await api(`/git/ref/heads/${inv.repo.ramo}`);
    const commit = await api(`/git/commits/${ref.object.sha}`);
    const arvore = await api(`/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree: arquivos }) });
    const novo = await api(`/git/commits`, { method: "POST", body: JSON.stringify({ message: `Importação em lote: ${arquivos.length} peças [skip netlify]`, tree: arvore.sha, parents: [ref.object.sha] }) });
    await api(`/git/refs/heads/${inv.repo.ramo}`, { method: "PATCH", body: JSON.stringify({ sha: novo.sha }) });
    return arquivos.length;
  }

  // ---------- interface ----------
  const css = document.createElement("style");
  css.textContent = `
    .imp { position: fixed; inset: 0; z-index: 50; background: rgba(48,10,21,.35); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; }
    .imp[hidden] { display: none; }
    .imp__caixa { background: #fff; width: min(1100px, 100%); padding: 28px; }
    .imp h2 { font-family: var(--titulo); text-transform: uppercase; letter-spacing: .06em; font-size: 14px; font-weight: 500; color: var(--vinho); margin: 0 0 6px; }
    .imp p { font-size: 13px; margin: 0 0 14px; }
    .imp ol { font-size: 13px; padding-left: 18px; margin: 0 0 18px; }
    .imp__rodape { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 18px; }
    .imp__rodape label { margin-right: auto; font-size: 13px; display: flex; gap: 8px; align-items: center; }
    .imp table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .imp th { text-align: left; font-family: var(--titulo); text-transform: uppercase; letter-spacing: .06em; font-size: 10px; font-weight: 500; color: var(--vinho); padding: 8px; border-bottom: 1px solid var(--mostarda); }
    .imp td { padding: 6px 8px; border-bottom: 1px solid #F0ECE8; vertical-align: top; }
    .imp .av { color: #9A6B00; font-size: 11.5px; }
    .imp td:nth-child(2), .imp td:nth-child(7) { white-space: nowrap; }
    .imp .ja { color: var(--cinza); }
    .imp__lista { max-height: 50vh; overflow: auto; border: 1px solid #ECE8E4; }
    .imp__msg { font-size: 13px; padding: 10px 12px; background: #F6F5F3; margin-bottom: 14px; }
    .imp__msg--ok { background: #E6F2EA; color: #1F6A43; }
    .imp__msg--erro { background: #F3E6E9; color: var(--vinho); }`;
  document.head.appendChild(css);

  const modal = document.createElement("div");
  modal.className = "imp"; modal.hidden = true;
  modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "imp-titulo");
  document.body.appendChild(modal);
  const fechar = () => { modal.hidden = true; btn.focus(); };
  modal.addEventListener("click", ev => { if (ev.target === modal) fechar(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !modal.hidden) fechar(); });

  function telaInicial(msg = "") {
    modal.innerHTML = `<div class="imp__caixa">
      <h2 id="imp-titulo">Importar peças por planilha</h2>
      ${msg}
      <ol>
        <li><a href="/admin/modelo-importacao-voluta.xlsx" download>Baixe o modelo</a> e preencha uma peça por linha. Também aceita a sua planilha de inventário exportada (.xlsx ou .csv).</li>
        <li>Escolha o arquivo abaixo e confira a prévia antes de importar.</li>
        <li>Depois, suba as fotos de cada peça pelo botão Editar. <strong>Peça sem foto não aparece no site</strong>, mesmo marcada como Disponível.</li>
      </ol>
      <input type="file" id="imp-arquivo" accept=".xlsx,.xls,.csv,.tsv,.txt">
      <div class="imp__rodape"><button class="bt" type="button" data-fechar>Cancelar</button></div>
    </div>`;
    modal.querySelector("[data-fechar]").onclick = fechar;
    modal.querySelector("#imp-arquivo").onchange = async ev => {
      const arq = ev.target.files[0]; if (!arq) return;
      modal.querySelector("ol").insertAdjacentHTML("afterend", `<p class="imp__msg">Lendo ${esc(arq.name)}…</p>`);
      try { mostrarPrevia(preparar(await lerArquivo(arq), window.VOLUTA_INV), arq.name); }
      catch (err) { telaInicial(`<p class="imp__msg imp__msg--erro">Não consegui ler o arquivo: ${esc(err.message)}.</p>`); }
    };
    modal.hidden = false;
    modal.querySelector("#imp-arquivo").focus();
  }

  function mostrarPrevia(itens, nome) {
    const novas = itens.filter(i => !i.existente).length, ja = itens.length - novas;
    const rot = { disponivel: "Disponível", vendido: "Vendido", oculto: "Oculto" };
    modal.innerHTML = `<div class="imp__caixa">
      <h2 id="imp-titulo">Prévia: ${esc(nome)}</h2>
      <p><strong>${novas}</strong> peças novas${ja ? ` e <strong>${ja}</strong> que já existem no site (pelo código)` : ""}. Nada foi enviado ainda.</p>
      <div class="imp__lista"><table><thead><tr><th>Linha</th><th>Código</th><th>Peça</th><th>Tipo</th><th>Designer</th><th>Status</th><th>Compra</th><th>Observações</th></tr></thead><tbody>
      ${itens.map(i => `<tr class="${i.existente ? "ja" : ""}"><td>${i.r.linha}</td><td>${esc(i.r.codigo)}</td><td>${esc(i.ficha.titulo)}</td><td>${esc(i.ficha.categoria)}</td><td>${esc(i.ficha.designer)}</td><td>${rot[i.ficha.status]}</td><td>${esc(i.ficha.data_compra.split("-").reverse().join("/"))}</td>
        <td class="av">${i.existente ? "já existe: " + esc(i.existente.dados.titulo) + "<br>" : ""}${i.avisos.map(esc).join("<br>")}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="imp__rodape">
        ${ja ? `<label><input type="checkbox" id="imp-atualizar"> Atualizar também as ${ja} que já existem (mantém fotos e destaque)</label>` : ""}
        <button class="bt" type="button" data-voltar>Escolher outro arquivo</button>
        <button class="bt bt--prim" type="button" data-enviar>Importar ${novas} peças</button>
      </div></div>`;
    const botaoEnviar = modal.querySelector("[data-enviar]");
    const chk = modal.querySelector("#imp-atualizar");
    const rotuloBotao = () => { const n = novas + (chk?.checked ? ja : 0); botaoEnviar.textContent = `Importar ${n} ${n === 1 ? "peça" : "peças"}`; botaoEnviar.disabled = !n; };
    chk && (chk.onchange = rotuloBotao); rotuloBotao();
    modal.querySelector("[data-voltar]").onclick = () => telaInicial();
    botaoEnviar.onclick = async () => {
      botaoEnviar.disabled = true; botaoEnviar.textContent = "Enviando…";
      try {
        const n = await enviar(itens, !!chk?.checked, window.VOLUTA_INV);
        modal.innerHTML = `<div class="imp__caixa"><h2 id="imp-titulo">Importação concluída</h2>
          <p class="imp__msg imp__msg--ok">${n} ${n === 1 ? "peça enviada" : "peças enviadas"} num único envio. Elas já aparecem na tabela. Quando quiser levar para o site, clique em Publicar site.</p>
          <p>Próximo passo: abra cada peça pelo botão Editar e suba as fotos. Sem foto, ela fica só no painel.</p>
          <div class="imp__rodape"><button class="bt bt--prim" type="button" onclick="location.reload()">Ver a tabela</button></div></div>`;
      } catch (err) {
        botaoEnviar.disabled = false; rotuloBotao();
        modal.querySelector(".imp__lista").insertAdjacentHTML("beforebegin", `<p class="imp__msg imp__msg--erro">Não foi possível enviar: ${esc(err.message)}. Nada foi alterado; tente de novo.</p>`);
      }
    };
  }

  btn.addEventListener("click", () => {
    if (!window.VOLUTA_INV) { alert("Espere a tabela carregar (ou entre com o GitHub) antes de importar."); return; }
    telaInicial();
  });
})();
