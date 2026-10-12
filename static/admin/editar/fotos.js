// Fotos ainda não publicadas: o editor procura a foto no endereço do site (/uploads/...),
// mas ela só existe lá depois de "Publicar site". Quando a imagem falha, buscamos o arquivo
// direto no GitHub (com o login do painel) e mostramos a versão salva.
(function () {
  var REPO = "andremenezes-volutagaleria/voluta-site", RAMO = "main";
  var cache = {};

  function token() {
    try { return (JSON.parse(localStorage.getItem("decap-cms-user") || "null") || {}).token; } catch (e) { return null; }
  }

  function caminhoNoRepo(src) {
    try {
      var u = new URL(src, location.href);
      if (u.origin !== location.origin || u.pathname.indexOf("/uploads/") !== 0) return null;
      return "static" + decodeURIComponent(u.pathname);
    } catch (e) { return null; }
  }

  function buscar(caminho) {
    if (!cache[caminho]) {
      var t = token();
      if (!t) return Promise.reject(new Error("sem login"));
      var url = "https://api.github.com/repos/" + REPO + "/contents/" + caminho.split("/").map(encodeURIComponent).join("/") + "?ref=" + RAMO;
      cache[caminho] = fetch(url, { headers: { Authorization: "token " + t, Accept: "application/vnd.github.raw" } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(function (b) { return URL.createObjectURL(b); });
    }
    return cache[caminho];
  }

  // Fotos recém-escolhidas (ainda não salvas): guardamos uma cópia local pelo nome do arquivo,
  // porque o editor tenta mostrá-las pelo endereço do site, onde ainda não existem.
  var locais = {};
  function chave(nome) {
    nome = String(nome || "").split("/").pop();
    try { nome = decodeURIComponent(nome); } catch (e) {}
    return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9.]+/g, "");
  }
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el || el.tagName !== "INPUT" || el.type !== "file" || !el.files) return;
    Array.prototype.forEach.call(el.files, function (f) { locais[chave(f.name)] = URL.createObjectURL(f); });
  }, true);
  document.addEventListener("drop", function (ev) {
    var fs = ev.dataTransfer && ev.dataTransfer.files;
    if (fs) Array.prototype.forEach.call(fs, function (f) { locais[chave(f.name)] = URL.createObjectURL(f); });
  }, true);

  function consertar(img) {
    if (!img || img.dataset.voltaFoto) return;
    var src = img.currentSrc || img.src;
    var caminho = caminhoNoRepo(src);
    if (!caminho) return;
    img.dataset.voltaFoto = "1";
    var local = locais[chave(caminho)];
    if (local) { img.src = local; return; }
    buscar(caminho).then(function (u) { img.src = u; }).catch(function () {});
  }

  // Imagens do editor (captura erros de carregamento de qualquer <img>)
  document.addEventListener("error", function (ev) { if (ev.target && ev.target.tagName === "IMG") consertar(ev.target); }, true);
  // Usado também pela pré-visualização (que roda num iframe)
  window.voltaConsertarFoto = consertar;
  // Para a pré-visualização: devolve um endereço que funciona para "/uploads/..." (busca no GitHub)
  window.voltaUrlFoto = function (src) {
    var caminho = caminhoNoRepo(src);
    if (caminho && locais[chave(caminho)]) return Promise.resolve(locais[chave(caminho)]);
    return caminho ? buscar(caminho) : Promise.resolve(src);
  };
})();
