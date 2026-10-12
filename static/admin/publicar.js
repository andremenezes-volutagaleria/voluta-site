// Botão "Publicar site": junta todas as alterações salvas no painel e atualiza o site de uma vez.
// As alterações feitas no editor são salvas com "[skip netlify]" (não geram deploy); este botão cria
// um envio sem essa marca, e o Netlify publica tudo num único deploy.
(() => {
  const area = document.querySelector(".inv__acoes");
  if (!area) return;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const css = document.createElement("style");
  css.textContent = `
    .pub { position: relative; }
    .pub__btn[disabled] { opacity: .55; cursor: default; }
    .pub__lista { position: absolute; left: 0; top: calc(100% + 6px); z-index: 20; background: #fff; border: 1px solid #ECE8E4; box-shadow: 0 10px 24px rgba(48,10,21,.1);
      width: min(420px, 90vw); padding: 14px 16px; font-size: 12.5px; }
    .pub__lista[hidden] { display: none; }
    .pub__lista ul { margin: 6px 0 12px; padding-left: 16px; max-height: 220px; overflow: auto; }
    .pub__lista p { margin: 0 0 8px; }
    .pub__nota { color: var(--cinza); font-size: 11.5px; }
    .pub__ok { color: #1F6A43; }`;
  document.head.appendChild(css);

  const caixa = document.createElement("div");
  caixa.className = "pub";
  caixa.innerHTML = `<button class="bt bt--prim pub__btn" type="button" disabled aria-expanded="false" aria-controls="pub-lista">Publicar site</button>
    <div class="pub__lista" id="pub-lista" hidden></div>`;
  area.prepend(caixa);
  const btn = caixa.querySelector(".pub__btn"), lista = caixa.querySelector(".pub__lista");

  let pendentes = [];
  const api = (inv, caminho, opts = {}) => fetch(`https://api.github.com/repos/${inv.repo.dono}/${inv.repo.nome}${caminho}`, {
    ...opts, headers: { Authorization: "token " + inv.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
  }).then(async r => { if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`); return r.json(); });

  const legivel = m => m.split("\n")[0].replace(/\s*\[skip netlify\]/i, "").replace(/^Alteração: /, "Alterada: ").replace(/^Nova peça: /, "Nova: ").replace(/^Foto enviada: .*\//, "Foto: ");

  async function verificar() {
    const inv = window.VOLUTA_INV; if (!inv) return;
    try {
      const commits = await api(inv, `/commits?sha=${inv.repo.ramo}&per_page=100`);
      pendentes = [];
      for (const c of commits) { if (!/\[skip netlify\]/i.test(c.commit.message)) break; pendentes.push(c.commit.message); }
      if (pendentes.length) { btn.disabled = false; btn.textContent = `Publicar site (${pendentes.length})`; btn.title = `${pendentes.length} alteração(ões) salvas esperando publicação`; }
      else { btn.disabled = true; btn.textContent = "Site em dia"; btn.title = "Nenhuma alteração esperando publicação"; }
    } catch { btn.disabled = true; btn.textContent = "Publicar site"; btn.title = "Não foi possível verificar as alterações"; }
  }

  btn.addEventListener("click", () => {
    const aberto = lista.hidden;
    lista.hidden = !aberto; btn.setAttribute("aria-expanded", String(aberto));
    if (!aberto) return;
    lista.innerHTML = `<p><strong>${pendentes.length} ${pendentes.length === 1 ? "alteração salva" : "alterações salvas"}</strong> vão para o site:</p>
      <ul>${pendentes.slice(0, 40).map(m => `<li>${esc(legivel(m))}</li>`).join("")}${pendentes.length > 40 ? `<li>…e mais ${pendentes.length - 40}</li>` : ""}</ul>
      <p class="pub__nota">Cada publicação usa 15 créditos do Netlify, não importa quantas alterações vão juntas.</p>
      <button class="bt bt--prim" type="button" id="pub-confirmar">Publicar agora</button> <button class="bt" type="button" id="pub-cancelar">Cancelar</button>`;
    lista.querySelector("#pub-cancelar").onclick = () => { lista.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); };
    lista.querySelector("#pub-confirmar").onclick = async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = "Publicando…";
      const inv = window.VOLUTA_INV;
      try {
        const ref = await api(inv, `/git/ref/heads/${inv.repo.ramo}`);
        const atual = await api(inv, `/git/commits/${ref.object.sha}`);
        const novo = await api(inv, `/git/commits`, { method: "POST", body: JSON.stringify({ message: `Publicar site: ${pendentes.length} ${pendentes.length === 1 ? "alteração" : "alterações"}`, tree: atual.tree.sha, parents: [ref.object.sha] }) });
        await api(inv, `/git/refs/heads/${inv.repo.ramo}`, { method: "PATCH", body: JSON.stringify({ sha: novo.sha }) });
        lista.innerHTML = `<p class="pub__ok"><strong>Publicação enviada.</strong> O site atualiza em cerca de 1 minuto.</p>`;
        pendentes = []; btn.disabled = true; btn.textContent = "Site em dia";
        setTimeout(() => { lista.hidden = true; btn.setAttribute("aria-expanded", "false"); }, 4000);
      } catch (err) {
        b.disabled = false; b.textContent = "Tentar de novo";
        lista.insertAdjacentHTML("afterbegin", `<p style="color:var(--vinho)">Não foi possível publicar (${esc(err.message)}). Nada foi alterado no site.</p>`);
      }
    };
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !lista.hidden) { lista.hidden = true; btn.setAttribute("aria-expanded", "false"); } });

  if (window.VOLUTA_INV) verificar(); else document.addEventListener("inventario-pronto", verificar, { once: true });
  window.addEventListener("focus", verificar); // ao voltar do editor, atualiza a contagem
})();
