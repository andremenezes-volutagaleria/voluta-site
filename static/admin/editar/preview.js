// Pré-visualização no painel: mostra a peça como ela vai aparecer no site.
(function () {
  if (!window.CMS) return;
  const h = window.h;
  CMS.registerPreviewStyle("/css/site.css");

  const brl = n => "R$ " + Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const precoTexto = d => d.status === "vendido" ? "Vendida" : "Valor sob consulta";

  // Fotos salvas no painel ("/uploads/...") ainda podem não estar no site: busca a versão salva no GitHub
  const Foto = createClass({
    getInitialState() { return { url: "" }; },
    resolver(src) {
      if (!src || /^(blob:|data:|https?:)/.test(src) && !src.includes(location.host)) { this.setState({ url: src }); return; }
      const atual = src;
      (window.voltaUrlFoto ? window.voltaUrlFoto(src) : Promise.resolve(src))
        .then(u => { if (this.props.src === atual) this.setState({ url: u }); })
        .catch(() => this.setState({ url: src }));
    },
    componentDidMount() { this.resolver(this.props.src); },
    componentDidUpdate(prev) { if (prev.src !== this.props.src) this.resolver(this.props.src); },
    render() { return this.state.url ? h("img", { src: this.state.url, alt: "" }) : h("div", { style: { width: "100%", height: "100%", background: "#F4F4F4" } }); },
  });

  CMS.registerPreviewTemplate("pecas", ({ entry, getAsset }) => {
    const d = entry.get("data").toJS();
    const fotos = (d.imagens || []).filter(Boolean).map(f => getAsset(f).toString());
    const capa = fotos[0];
    const erro = ev => window.voltaConsertarFoto && window.voltaConsertarFoto(ev.target);
    const img = (src, extra) => src ? h(Foto, Object.assign({ src }, extra || {})) : h("div", { style: { aspectRatio: "4/5", background: "#F4F4F4" } });

    return h("div", { style: { padding: "32px", maxWidth: "1100px", margin: "0 auto" } },
      h("p", { className: "subtitulo", style: { marginBottom: "16px" } }, "Como aparece na lista do acervo:"),
      h("ul", { className: "grade", style: { gridTemplateColumns: "260px", marginBottom: "48px" } },
        h("li", { className: "card" + (d.status === "vendido" ? " card--vendido" : "") },
          h("a", { href: "#" },
            h("div", { className: "card__img" }, img(capa), d.status === "vendido" ? h("span", { className: "selo" }, "Vendida") : null),
            h("p", { className: "card__designer" }, d.designer || "Designer"),
            h("h3", { className: "card__titulo" }, d.titulo || "Nome da peça", d.ano ? h("span", { className: "card__ano" }, ", " + d.ano) : null),
            null
          )
        )
      ),
      h("p", { className: "subtitulo", style: { marginBottom: "16px" } }, "Como aparece na página da peça:"),
      h("div", { className: "peca", style: { padding: 0 } },
        h("div", { className: "galeria" },
          h("div", { className: "galeria__principal" }, img(capa)),
          fotos.length > 1 ? h("ul", { className: "galeria__mini" }, fotos.map((f, i) => h("li", { key: i }, h("button", null, h(Foto, { src: f }))))) : null
        ),
        h("div", { className: "ficha", style: { position: "static" } },
          h("p", { className: "ficha__designer" }, h("a", { href: "#" }, d.designer || "Designer")),
          h("h1", { className: "ficha__titulo" }, d.titulo || "Nome da peça"),
          d.ano ? h("p", { className: "ficha__ano" }, d.ano) : null,
          h("p", { className: "ficha__preco" }, precoTexto(d)),
          h("a", { className: "botao " + (d.status === "vendido" ? "botao--linha" : "botao--wa"), href: "#" }, d.status === "vendido" ? "Procurar peça parecida" : "Tenho interesse"),
          h("dl", { className: "ficha__dados" },
            d.dimensoes ? [h("dt", { key: "a" }, "Dimensões"), h("dd", { key: "b" }, d.dimensoes)] : null,
            d.materiais ? [h("dt", { key: "c" }, "Materiais"), h("dd", { key: "d" }, d.materiais)] : null
          ),
          h("div", { className: "ficha__texto" }, (d.descricao || "").split(/\n\n+/).map((p, i) => h("p", { key: i }, p)))
        )
      )
    );
  });
})();
