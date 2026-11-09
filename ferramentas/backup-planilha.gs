/**
 * Backup automático do CRM da Voluta no Google Sheets.
 *
 * Copia todo dia os dados do repositório privado voluta-crm (GitHub) para abas desta planilha:
 * Inventário, Vendas, Despesas, Clientes, Contas (lançamentos e fixos). Cada execução
 * substitui o conteúdo das abas pelo estado atual do CRM e registra a hora na aba "Backup".
 *
 * Como instalar (uma vez só):
 * 1. Crie uma planilha nova no Google Drive, ex.: "Voluta — Backup do CRM".
 * 2. Extensões > Apps Script. Apague o que estiver lá e cole este arquivo inteiro. Salve.
 * 3. No GitHub, crie um token só de leitura: github.com/settings/personal-access-tokens/new
 *    (Fine-grained token). Nome: backup-planilha; Expiration: a maior permitida;
 *    Repository access: Only select repositories > voluta-crm;
 *    Permissions > Repository permissions > Contents: Read-only. Gere e copie o token.
 * 4. No Apps Script, Configurações do projeto (engrenagem) > Propriedades do script > Adicionar:
 *      GITHUB_TOKEN = o token copiado
 *      GITHUB_REPO  = andremenezes-volutagaleria/voluta-crm
 * 5. Volte ao editor, escolha a função "instalar" no menu de cima e clique em Executar.
 *    O Google vai pedir autorização (é o seu próprio script): permita.
 *    Isso faz o primeiro backup e agenda um por dia, de madrugada.
 * Para um backup na hora: menu "Voluta" na planilha > Fazer backup agora.
 */

const ARQUIVOS = [
  { arquivo: "inventario.json", aba: "Inventário", lista: d => d.itens },
  { arquivo: "vendas.json", aba: "Vendas", lista: d => d.itens },
  { arquivo: "despesas.json", aba: "Despesas", lista: d => d.itens },
  { arquivo: "clientes.json", aba: "Clientes", lista: d => d.itens },
  { arquivo: "contas.json", aba: "Contas · lançamentos", lista: d => d.lancamentos },
  { arquivo: "contas.json", aba: "Contas · fixos", lista: d => d.fixos },
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Voluta").addItem("Fazer backup agora", "fazerBackup").addToUi();
}

function instalar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "fazerBackup").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("fazerBackup").timeBased().everyDays(1).atHour(3).create();
  fazerBackup();
}

function lerArquivo_(nome) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty("GITHUB_TOKEN"), repo = p.getProperty("GITHUB_REPO");
  if (!token || !repo) throw new Error("Configure GITHUB_TOKEN e GITHUB_REPO nas Propriedades do script.");
  const url = "https://api.github.com/repos/" + repo + "/contents/" + encodeURIComponent(nome) + "?ref=main";
  const r = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw" }, muteHttpExceptions: true });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error(nome + ": GitHub respondeu  + r.getResponseCode());
  return JSON.parse(r.getContentText());
}

function fazerBackup() {
  const ss = SpreadsheetApp.getActive();
  const cache = {}, resumo = [];
  ARQUIVOS.forEach(cfg => {
    if (!(cfg.arquivo in cache)) cache[cfg.arquivo] = lerArquivo_(cfg.arquivo);
    const dados = cache[cfg.arquivo];
    const lista = (dados && cfg.lista(dados)) || [];
    const colunas = [];
    lista.forEach(o => Object.keys(o || {}).forEach(k => { if (colunas.indexOf(k) < 0) colunas.push(k); }));
    const linhas = lista.map(o => colunas.map(k => {
      const v = o[k];
      return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v;
    }));
    const aba = ss.getSheetByName(cfg.aba) || ss.insertSheet(cfg.aba);
    aba.clearContents();
    if (colunas.length) {
      aba.getRange(1, 1, 1, colunas.length).setValues([colunas]).setFontWeight("bold");
      if (linhas.length) aba.getRange(2, 1, linhas.length, colunas.length).setValues(linhas);
      aba.setFrozenRows(1);
    }
    resumo.push([cfg.aba, lista.length]);
  });
  const log = ss.getSheetByName("Backup") || ss.insertSheet("Backup", 0);
  log.clearContents();
  log.getRange(1, 1, 1, 2).setValues([["Último backup", new Date()]]).setFontWeight("bold");
  log.getRange(3, 1, resumo.length + 1, 2).setValues([["Aba", "Linhas"]].concat(resumo));
  // Guarda também o JSON bruto (para restaurar o CRM se precisar)
  const bruto = ss.getSheetByName("JSON") || ss.insertSheet("JSON");
  bruto.clearContents();
  const nomes = Object.keys(cache);
  bruto.getRange(1, 1, nomes.length, 2).setValues(nomes.map(n => [n, JSON.stringify(cache[n] || null).slice(0, 49000)]));
}
