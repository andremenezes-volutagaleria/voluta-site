// Conserta fichas que o editor salvou com dados tortos:
// - foto de peça NOVA salva como /uploads/pecas/foto.jpg (o arquivo vai para /uploads/pecas/<peça>/foto.jpg)
// - código digitado sem hífen (VLT121 -> VLT-121), que o CRM não reconhecia
// window.voltaFichaCerta(nomeDoArquivo, dados) devolve os dados corrigidos (ou os mesmos, se já estão certos).
// Na tabela do painel, as fichas tortas são corrigidas no GitHub (com [skip netlify], entram no próximo "Publicar site").
(() => {
  const codigo = c => String(c || "").replace(/\bVLT\s*-?\s*(\d+)/gi, (_, n) => "VLT-" + n);
  window.voltaFichaCerta = (arquivo, d) => {
    if (!d || typeof d !== "object") return d;
    const slug = String(arquivo || "").replace(/\.json$/, "");
    const fotos = Array.isArray(d.imagens) ? d.imagens.map(u => typeof u === "string" && slug && /^\/uploads\/pecas\/[^/]+$/.test(u) ? `/uploads/pecas/${slug}/${u.split("/").pop()}` : u) : d.imagens;
    const cod = d.codigo ? codigo(d.codigo) : d.codigo;
    const mudou = JSON.stringify(fotos) !== JSON.stringify(d.imagens) || cod !== d.codigo;
    return mudou ? { ...d, imagens: fotos, codigo: cod } : d;
  };
  window.voltaGravarConsertos = async (inv) => {
    const b64 = s => { const b = new TextEncoder().encode(s); let t = ""; for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(t); };
    const deb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
    const feitos = [];
    for (const f of inv.fichas) {
      if (window.voltaFichaCerta(f.arquivo, f.dados) === f.dados) continue;
      try {
        const cam = `${inv.repo.pasta}/${f.arquivo}`;
        const url = `https://api.github.com/repos/${inv.repo.dono}/${inv.repo.nome}/contents/${cam}`;
        const h = { Authorization: "token " + inv.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
        const r = await fetch(`${url}?ref=${inv.repo.ramo}`, { cache: "no-store", headers: h }); if (!r.ok) continue;
        const j = await r.json(), atual = JSON.parse(deb64(j.content)), certo = window.voltaFichaCerta(f.arquivo, atual);
        if (certo === atual) continue;
        const w = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({ message: `Alteração: ${f.arquivo.replace(/\.json$/, "")} (endereço das fotos) [skip netlify]`, content: b64(JSON.stringify(certo, null, 2) + "\n"), sha: j.sha, branch: inv.repo.ramo }) });
        if (w.ok) { f.dados = certo; feitos.push(f.arquivo); }
      } catch {}
    }
    if (feitos.length) window.dispatchEvent(new Event("focus"));   // atualiza a contagem do "Publicar site"
    return feitos;
  };
})();
