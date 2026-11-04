// Campo "Fotos" da ficha da peça: envia várias fotos de uma vez (escolhendo ou arrastando),
// mostra as miniaturas em ordem (a primeira é a capa) e permite reordenar e remover.
// O valor salvo é o mesmo de antes: uma lista de endereços ("/uploads/pecas/<peça>/<foto>").
// As fotos entram na ficha como as do campo antigo: vão para o GitHub quando se clica em Publicar.
(function () {
  if (!window.CMS) return;
  var h = window.h;
  var VINHO = "#300A15";
  var locais = {};   // fotos enviadas nesta sessão (endereço → cópia local), para a miniatura aparecer antes de publicar

  // Ordem natural pelo nome do arquivo: 1, 2, ..., 10 (e não 1, 10, 2)
  var ordenar = function (arqs) {
    return arqs.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });
    });
  };
  var lista = function (v) {
    if (!v) return [];
    if (v.toJS) v = v.toJS();
    return Array.isArray(v) ? v.filter(Boolean) : [];
  };
  // Caminho no repositório ("static/uploads/...") → endereço público ("/uploads/...")
  var publico = function (caminho) {
    return ("/" + String(caminho || "").replace(/^\/+/, "").replace(/^static\//, "")).replace(/\/{2,}/g, "/");
  };

  var estilos = {
    zona: function (ativa) {
      return { border: "2px dashed " + (ativa ? VINHO : "#C9C2BA"), background: ativa ? "#F7EEF0" : "#FAF8F5", borderRadius: "8px",
        padding: "22px 16px", textAlign: "center", cursor: "pointer", color: "#4A4540", font: "400 14px/1.5 system-ui, sans-serif" };
    },
    grade: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px", marginTop: "14px" },
    item: function (arrastando) {
      return { position: "relative", background: "#fff", border: "1px solid #E4DFD8", borderRadius: "6px", overflow: "hidden",
        opacity: arrastando ? 0.4 : 1, cursor: "grab" };
    },
    foto: { display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", background: "#F1EEEA" },
    barra: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px", font: "500 12px/1 system-ui, sans-serif", color: "#4A4540" },
    botao: { border: "none", background: "transparent", cursor: "pointer", font: "500 15px/1 system-ui, sans-serif", padding: "4px 6px", color: "#4A4540" },
    capa: { position: "absolute", top: "6px", left: "6px", background: VINHO, color: "#fff", font: "600 10px/1 system-ui, sans-serif",
      letterSpacing: ".06em", padding: "5px 7px", borderRadius: "999px", textTransform: "uppercase" },
    aviso: { marginTop: "10px", font: "400 13px/1.4 system-ui, sans-serif", color: "#4A4540" },
  };

  var Miniatura = createClass({
    getInitialState: function () { return { url: "" }; },
    resolver: function () {
      var src = this.props.src, eu = this, url = "";
      if (locais[src]) { this.setState({ url: locais[src] }); return; }
      try { url = this.props.getAsset ? String(this.props.getAsset(src)) : src; } catch (e) { url = src; }
      this.setState({ url: url || src });
      // Foto salva mas ainda não publicada: busca no GitHub (mesma ajuda do fotos.js)
      if (window.voltaUrlFoto && /^\/uploads\//.test(url || src)) {
        window.voltaUrlFoto(url || src).then(function (u) { if (eu.props.src === src && u) eu.setState({ url: u }); }).catch(function () {});
      }
    },
    componentDidMount: function () { this.resolver(); },
    componentDidUpdate: function (antes) { if (antes.src !== this.props.src) this.resolver(); },
    render: function () {
      return h("img", { src: this.state.url, alt: "", style: estilos.foto, draggable: false,
        onError: function (ev) { if (window.voltaConsertarFoto) window.voltaConsertarFoto(ev.target); } });
    },
  });

  var Controle = createClass({
    getInitialState: function () { return { enviando: 0, total: 0, sobre: false, arrastando: -1, erro: "" }; },

    fotos: function () { return lista(this.props.value); },
    salvar: function (novas) { this.props.onChange(novas.length ? novas : []); },

    enviar: function (arquivos) {
      var eu = this;
      var imgs = ordenar(Array.prototype.filter.call(arquivos || [], function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name); }));
      if (!imgs.length) return;
      if (!this.props.onPersistMedia) { this.setState({ erro: "O painel não deixou enviar fotos por aqui. Recarregue a página e tente de novo." }); return; }
      // Nome igual ao de uma foto que já está na peça (ex.: "1.jpg" de outra sessão de fotos):
      // renomeia ("1-2.jpg") para não substituir a foto antiga.
      var limpo = function (n) { return String(n).split("/").pop().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9.]+/g, "-"); };
      var usados = {};
      this.fotos().forEach(function (u) { usados[limpo(u)] = 1; });
      imgs = imgs.map(function (f) {
        var nome = limpo(f.name), ponto = nome.lastIndexOf("."), base = ponto > 0 ? nome.slice(0, ponto) : nome, ext = ponto > 0 ? nome.slice(ponto) : "", n = 2;
        while (usados[nome]) { nome = base + "-" + n + ext; n++; }
        usados[nome] = 1;
        return nome === limpo(f.name) ? f : new File([f], nome, { type: f.type, lastModified: f.lastModified });
      });
      this.setState({ enviando: 1, total: imgs.length, erro: "" });
      var novas = [], falhas = 0;
      var passo = function (i) {
        if (i >= imgs.length) {
          eu.salvar(eu.fotos().concat(novas.filter(function (u) { return eu.fotos().indexOf(u) < 0; })));
          eu.setState({ enviando: 0, total: 0, erro: falhas ? falhas + (falhas > 1 ? " fotos não foram enviadas." : " foto não foi enviada.") + " Tente de novo." : "" });
          return;
        }
        eu.setState({ enviando: i + 1 });
        Promise.resolve(eu.props.onPersistMedia(imgs[i], { field: eu.props.field }))
          .then(function (acao) {
            var arq = acao && acao.payload && (acao.payload.mediaFile || acao.payload);
            if (arq && arq.path) {
              var u = publico(arq.path);
              locais[u] = window.voltaGuardarFotoLocal ? window.voltaGuardarFotoLocal(u, imgs[i]) : URL.createObjectURL(imgs[i]);
              novas.push(u);
            } else falhas++;
          })
          .catch(function () { falhas++; })
          .then(function () { passo(i + 1); });
      };
      passo(0);
    },

    escolher: function () {
      var eu = this, input = document.createElement("input");
      input.type = "file"; input.accept = "image/*"; input.multiple = true;
      input.onchange = function () {
        // (o fotos.js já guarda uma cópia local de cada foto, para a miniatura aparecer antes de publicar)
        eu.enviar(input.files);
      };
      input.style.display = "none";
      document.body.appendChild(input);
      input.click();
      setTimeout(function () { input.remove(); }, 60000);
    },

    mover: function (de, para) {
      var f = this.fotos();
      if (para < 0 || para >= f.length || de === para) return;
      var item = f.splice(de, 1)[0];
      f.splice(para, 0, item);
      this.salvar(f);
    },
    remover: function (i) {
      var f = this.fotos();
      f.splice(i, 1);
      this.salvar(f);
    },

    render: function () {
      var eu = this, fotos = this.fotos(), s = this.state;
      var parar = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
      var arrastandoArquivos = function (ev) { return ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [], "Files") >= 0; };

      var zona = h("div", {
        style: estilos.zona(s.sobre),
        onClick: function () { if (!s.enviando) eu.escolher(); },
        onDragOver: function (ev) { if (!arrastandoArquivos(ev)) return; parar(ev); if (!s.sobre) eu.setState({ sobre: true }); },
        onDragLeave: function () { eu.setState({ sobre: false }); },
        onDrop: function (ev) { if (!arrastandoArquivos(ev)) return; parar(ev); eu.setState({ sobre: false }); if (!s.enviando) eu.enviar(ev.dataTransfer.files); },
      }, s.enviando
        ? "Adicionando foto " + s.enviando + " de " + s.total + "…"
        : [h("b", { key: "a" }, "Adicionar fotos"), h("br", { key: "b" }), "Clique para escolher ou arraste aqui. Dá para selecionar várias de uma vez; elas entram na ordem do nome do arquivo (1, 2, 3…)."]);

      var grade = fotos.length ? h("div", { style: estilos.grade }, fotos.map(function (src, i) {
        return h("div", {
          key: src + "|" + i,
          style: estilos.item(s.arrastando === i),
          draggable: true,
          title: "Arraste para mudar a ordem",
          onDragStart: function (ev) { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(i)); eu.setState({ arrastando: i }); },
          onDragEnd: function () { eu.setState({ arrastando: -1 }); },
          onDragOver: function (ev) { if (s.arrastando >= 0) { ev.preventDefault(); } },
          onDrop: function (ev) { if (s.arrastando < 0) return; parar(ev); eu.mover(s.arrastando, i); eu.setState({ arrastando: -1 }); },
        },
          i === 0 ? h("span", { style: estilos.capa }, "Capa") : null,
          h(Miniatura, { src: src, getAsset: eu.props.getAsset }),
          h("div", { style: estilos.barra },
            h("button", { type: "button", style: estilos.botao, title: "Mover para a esquerda", disabled: i === 0, onClick: function () { eu.mover(i, i - 1); } }, "←"),
            h("span", null, String(i + 1)),
            h("button", { type: "button", style: estilos.botao, title: "Mover para a direita", disabled: i === fotos.length - 1, onClick: function () { eu.mover(i, i + 1); } }, "→"),
            h("button", { type: "button", style: Object.assign({}, estilos.botao, { color: "#9B1C1C" }), title: "Remover foto da peça",
              onClick: function () { if (confirm("Remover esta foto da peça?")) eu.remover(i); } }, "×")
          )
        );
      })) : null;

      return h("div", { className: this.props.classNameWrapper, style: { padding: "16px" } },
        zona,
        grade,
        s.erro ? h("div", { style: Object.assign({}, estilos.aviso, { color: "#9B1C1C" }) }, s.erro) : null,
        fotos.length ? h("div", { style: estilos.aviso }, fotos.length + (fotos.length > 1 ? " fotos" : " foto") + ". Arraste as miniaturas (ou use ← →) para mudar a ordem.") : null
      );
    },
  });

  var Previa = function (props) {
    return h("div", null, lista(props.value).map(function (src, i) {
      return h("img", { key: i, src: props.getAsset ? String(props.getAsset(src)) : src, style: { maxWidth: "100%" } });
    }));
  };

  CMS.registerWidget("fotos", Controle, Previa);
})();
