// Gera um painel de TESTE em dist/admin-teste/ (só para a prévia; não vai para o site real).
// Carrega todas as peças e textos em memória: dá para cadastrar, editar e subir fotos,
// mas nada é salvo; ao recarregar a página tudo volta ao original.
// Uso: node build.mjs && node teste-painel.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "admin-teste");
fs.mkdirSync(OUT, { recursive: true });

// Arquivos do repositório em memória, no formato do backend "test-repo" do Decap
const repo = { content: { pecas: {} } };
for (const f of fs.readdirSync(path.join(ROOT, "content/pecas")).filter(f => f.endsWith(".json"))) {
  repo.content.pecas[f] = { content: fs.readFileSync(path.join(ROOT, "content/pecas", f), "utf8") };
}
repo.content["site.json"] = { content: fs.readFileSync(path.join(ROOT, "content/site.json"), "utf8") };
// A listagem de pastas do modo teste procura a chave "content/pecas" inteira; a leitura de um arquivo segue o caminho por partes.
fs.writeFileSync(path.join(OUT, "dados.js"), `window.repoFiles = ${JSON.stringify(repo)}; window.repoFiles["content/pecas"] = window.repoFiles.content.pecas;`);

// Mesma configuração do painel real, trocando só o "backend" pelo modo de teste
const config = fs.readFileSync(path.join(ROOT, "static/admin/config.yml"), "utf8")
  .replace(/backend:[\s\S]*?\n(?=\S)/, "backend:\n  name: test-repo\n\n");
fs.writeFileSync(path.join(OUT, "config.yml"), config);

fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Painel de teste · Voluta</title>
  <style>
    .aviso-teste { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 9999; background: #300A15; color: #fff;
      font: 500 12px/1.4 system-ui, sans-serif; padding: 8px 16px; border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,.2); pointer-events: none; }
  </style>
  <script src="/admin-teste/dados.js"></script>
</head>
<body>
  <div class="aviso-teste">Modo teste: pode mexer à vontade. Nada é salvo; ao recarregar, tudo volta ao original.</div>
  <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
  <script src="/admin/preview.js"></script>
</body>
</html>
`);
console.log(`Painel de teste: ${Object.keys(repo.content.pecas).length} peças em dist/admin-teste/`);
