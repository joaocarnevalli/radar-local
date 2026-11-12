const STORAGE_KEY = "radarLocalData";
const NO_FOLDER = "__no_folder__";
let data = { folders: [], items: [] };
let currentPage = null;
let toastTimer;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  data = await loadData();
  bindEvents();
  renderAll();
  await inspectCurrentTab();
}

async function loadData() {
  const saved = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (saved && Array.isArray(saved.folders) && Array.isArray(saved.items)) return saved;
  return { folders: [], items: [] };
}

async function persist() {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === button.dataset.view));
  }));
  document.getElementById("captureButton").addEventListener("click", onCaptureClick);
  document.getElementById("saveItem").addEventListener("click", saveCurrentPage);
  document.getElementById("cancelAdd").addEventListener("click", () => document.getElementById("addForm").classList.add("hidden"));
  document.getElementById("folderFilter").addEventListener("change", renderItems);
  document.getElementById("folderForm").addEventListener("submit", createFolder);
  document.getElementById("backupExport").addEventListener("click", exportBackup);
  document.getElementById("backupImport").addEventListener("click", () => document.getElementById("backupFile").click());
  document.getElementById("backupFile").addEventListener("change", importBackup);
}

async function inspectCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    document.getElementById("pageSummary").textContent = "Esta página não pode ser monitorada pelo Chrome.";
    document.getElementById("captureButton").disabled = true;
    return;
  }
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageInfo, args: [""] });
    currentPage = { ...result.result, url: tab.url };
    document.getElementById("pageSummary").textContent = `${currentPage.title || new URL(tab.url).hostname} · ${currentPage.price ? formatPrice(currentPage.price.amount, currentPage.price.currency) : "preço não detectado"}`;
  } catch {
    currentPage = { title: tab.title || "", url: tab.url, price: null };
    document.getElementById("pageSummary").textContent = "Não consegui ler esta página. Você ainda pode cadastrar o link manualmente.";
  }
}

function onCaptureClick() {
  if (!currentPage) return showToast("Abra uma página de produto ou curso no Chrome.", true);
  document.getElementById("itemName").value = currentPage.title || "";
  document.getElementById("itemPrice").value = currentPage.price ? String(currentPage.price.amount).replace(".", ",") : "";
  document.getElementById("itemTarget").value = "";
  document.getElementById("itemSelector").value = "";
  fillFolderSelect(document.getElementById("itemFolder"), data.items.length ? data.items[0].folderId : NO_FOLDER, true);
  document.getElementById("addForm").classList.remove("hidden");
}

async function saveCurrentPage() {
  if (!currentPage?.url) return showToast("Não encontrei a URL desta página.", true);
  const name = document.getElementById("itemName").value.trim();
  if (!name) return showToast("Informe um nome para o item.", true);
  const price = parseUserPrice(document.getElementById("itemPrice").value);
  const target = parseUserPrice(document.getElementById("itemTarget").value);
  const entry = {
    id: crypto.randomUUID(), name, url: currentPage.url,
    folderId: document.getElementById("itemFolder").value,
    target: target?.amount ?? null,
    selector: document.getElementById("itemSelector").value.trim(),
    price: price ? { ...price, checkedAt: new Date().toISOString(), source: "manual" } : (currentPage.price ? { ...currentPage.price, checkedAt: new Date().toISOString() } : null),
    history: []
  };
  if (entry.price) entry.history.push({ amount: entry.price.amount, currency: entry.price.currency || "", checkedAt: entry.price.checkedAt, source: entry.price.source || "page" });
  data.items.unshift(entry);
  await persist();
  document.getElementById("addForm").classList.add("hidden");
  renderAll();
  showToast("Página adicionada localmente.");
}

async function createFolder(event) {
  event.preventDefault();
  const input = document.getElementById("folderName");
  const name = input.value.trim();
  if (!name) return;
  if (data.folders.some(folder => folder.name.toLowerCase() === name.toLowerCase())) return showToast("Já existe uma pasta com esse nome.", true);
  data.folders.push({ id: crypto.randomUUID(), name });
  input.value = "";
  await persist();
  renderAll();
  showToast("Pasta criada.");
}

function renderAll() {
  renderFolderOptions();
  renderItems();
  renderFolders();
}

function renderFolderOptions() {
  const filter = document.getElementById("folderFilter");
  const old = filter.value || "all";
  filter.replaceChildren();
  addOption(filter, "all", "Todas as pastas");
  data.folders.forEach(folder => addOption(filter, folder.id, folder.name));
  addOption(filter, NO_FOLDER, "Sem pasta");
  filter.value = [...filter.options].some(option => option.value === old) ? old : "all";
  fillFolderSelect(document.getElementById("itemFolder"), NO_FOLDER, true);
}

function fillFolderSelect(select, selected, includeNoFolder = false) {
  if (!select) return;
  select.replaceChildren();
  if (includeNoFolder) addOption(select, NO_FOLDER, "Sem pasta");
  data.folders.forEach(folder => addOption(select, folder.id, folder.name));
  select.value = [...select.options].some(option => option.value === selected) ? selected : (includeNoFolder ? NO_FOLDER : data.folders[0]?.id || NO_FOLDER);
}

function addOption(select, value, text) {
  const option = document.createElement("option"); option.value = value; option.textContent = text; select.append(option);
}

function renderItems() {
  const root = document.getElementById("itemsList"); root.replaceChildren();
  const filter = document.getElementById("folderFilter").value || "all";
  const items = data.items.filter(item => filter === "all" || (item.folderId || NO_FOLDER) === filter);
  document.getElementById("emptyState").classList.toggle("hidden", items.length > 0);
  items.forEach(item => root.append(buildItemCard(item)));
}

function buildItemCard(item) {
  const card = document.createElement("article"); card.className = "item-card";
  const top = document.createElement("div"); top.className = "item-top";
  const name = document.createElement("div"); name.className = "item-name"; name.textContent = item.name;
  const price = document.createElement("div"); price.className = "price"; price.textContent = item.price ? formatPrice(item.price.amount, item.price.currency) : "Sem preço";
  top.append(name, price); card.append(top);
  const link = document.createElement("a"); link.className = "item-url"; link.href = item.url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = item.url; card.append(link);
  const meta = document.createElement("div"); meta.className = "item-meta";
  const folder = data.folders.find(entry => entry.id === item.folderId)?.name || "Sem pasta";
  const last = item.price?.checkedAt ? `Verificado ${formatDate(item.price.checkedAt)}` : "Ainda não verificado";
  meta.textContent = `${folder} · ${last}${item.target != null ? ` · alvo ${formatPrice(item.target, item.price?.currency)}` : ""}`;
  if (item.target != null && item.price && item.price.amount <= item.target) meta.classList.add("drop");
  card.append(meta);
  const controls = document.createElement("div"); controls.className = "item-controls";
  const targetLabel = document.createElement("label"); targetLabel.textContent = "Preço-alvo";
  const targetInput = document.createElement("input"); targetInput.inputMode = "decimal"; targetInput.placeholder = "Opcional"; targetInput.value = item.target ?? "";
  targetInput.addEventListener("change", async () => { item.target = parseUserPrice(targetInput.value)?.amount ?? null; await persist(); renderItems(); });
  targetLabel.append(targetInput);
  const folderLabel = document.createElement("label"); folderLabel.textContent = "Pasta";
  const folderSelect = document.createElement("select"); fillFolderSelect(folderSelect, item.folderId || NO_FOLDER, true);
  folderSelect.addEventListener("change", async () => { item.folderId = folderSelect.value; await persist(); renderAll(); }); folderLabel.append(folderSelect);
  const refresh = document.createElement("button"); refresh.className = "primary"; refresh.textContent = "Atualizar"; refresh.title = "Abrir página em segundo plano e verificar preço";
  refresh.addEventListener("click", () => refreshPrice(item, refresh));
  const remove = document.createElement("button"); remove.className = "icon-action danger"; remove.textContent = "×"; remove.title = "Remover item";
  remove.addEventListener("click", async () => { if (!confirm(`Remover “${item.name}” e o histórico local?`)) return; data.items = data.items.filter(row => row.id !== item.id); await persist(); renderAll(); });
  controls.append(targetLabel, folderLabel, refresh, remove); card.append(controls);
  const history = document.createElement("details"); history.className = "history";
  const summary = document.createElement("summary"); summary.textContent = `Histórico (${item.history?.length || 0} registros)`; history.append(summary);
  [...(item.history || [])].slice(-8).reverse().forEach(point => {
    const entry = document.createElement("div"); entry.className = "history-entry";
    const date = document.createElement("span"); date.textContent = formatDate(point.checkedAt);
    const value = document.createElement("span"); value.textContent = `${formatPrice(point.amount, point.currency)} · ${point.source || "página"}`;
    entry.append(date, value); history.append(entry);
  });
  card.append(history);
  const selectorLabel = document.createElement("label"); selectorLabel.textContent = "Seletor CSS (se necessário)";
  const selectorInput = document.createElement("input"); selectorInput.placeholder = "Ex.: [itemprop='price']"; selectorInput.value = item.selector || "";
  selectorInput.addEventListener("change", async () => { item.selector = selectorInput.value.trim(); await persist(); showToast("Seletor salvo."); });
  selectorLabel.style.marginTop = "7px"; selectorLabel.append(selectorInput); card.append(selectorLabel);
  return card;
}

async function refreshPrice(item, button) {
  button.disabled = true; button.textContent = "Lendo…";
  let tabId;
  try {
    const url = new URL(item.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Apenas páginas HTTP/HTTPS são aceitas.");
    const originPattern = `${url.origin}/*`;
    const allowed = await chrome.permissions.contains({ origins: [originPattern] }) || await chrome.permissions.request({ origins: [originPattern] });
    if (!allowed) throw new Error("Acesso ao domínio não foi autorizado.");
    const tab = await chrome.tabs.create({ url: item.url, active: false }); tabId = tab.id;
    await waitForTab(tabId);
    await delay(1200);
    let found = null;
    for (let attempt = 0; attempt < 4 && !found; attempt += 1) {
      if (attempt) await delay(1500);
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageInfo, args: [item.selector || ""] });
      found = result?.result?.price || null;
    }
    if (!found) throw new Error("Preço não encontrado. Configure um seletor CSS ou informe o valor manualmente.");
    const checkedAt = new Date().toISOString();
    const prior = item.price;
    item.price = { ...found, checkedAt };
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: found.amount, currency: found.currency || "", checkedAt, source: found.source || "page" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    await persist();
    renderItems();
    const fell = prior && prior.currency === found.currency && found.amount < prior.amount;
    const reachedTarget = item.target != null && found.amount <= item.target;
    showToast(`${formatPrice(found.amount, found.currency)} registrado${fell ? " · preço caiu" : ""}${reachedTarget ? " · atingiu o alvo" : ""}.`);
  } catch (error) {
    showToast(error.message || "Não foi possível verificar o preço.", true);
  } finally {
    if (tabId) { try { await chrome.tabs.remove(tabId); } catch {} }
    button.disabled = false; button.textContent = "Atualizar";
  }
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("A página demorou demais para carregar.")); }, 25000);
    const listener = (changedId, changeInfo) => {
      if (changedId === tabId && changeInfo.status === "complete") { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === "complete") { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); } }).catch(reject);
  });
}

function renderFolders() {
  const root = document.getElementById("foldersList"); root.replaceChildren();
  data.folders.forEach(folder => {
    const row = document.createElement("div"); row.className = "folder-row";
    const label = document.createElement("div"); label.className = "folder-label"; label.textContent = folder.name;
    const count = document.createElement("span"); count.className = "folder-count"; count.textContent = `${data.items.filter(item => item.folderId === folder.id).length} itens`; label.append(count);
    const actions = document.createElement("div"); actions.className = "folder-actions";
    const rename = document.createElement("button"); rename.className = "icon-action"; rename.textContent = "Renomear";
    rename.addEventListener("click", async () => { const value = prompt("Novo nome da pasta:", folder.name)?.trim(); if (!value || value === folder.name) return; if (data.folders.some(other => other.id !== folder.id && other.name.toLowerCase() === value.toLowerCase())) return showToast("Já existe uma pasta com esse nome.", true); folder.name = value; await persist(); renderAll(); });
    const del = document.createElement("button"); del.className = "icon-action danger"; del.textContent = "Apagar";
    del.addEventListener("click", async () => { if (!confirm(`Apagar a pasta “${folder.name}”? Os itens serão mantidos em “Sem pasta”.`)) return; data.items.forEach(item => { if (item.folderId === folder.id) item.folderId = NO_FOLDER; }); data.folders = data.folders.filter(other => other.id !== folder.id); await persist(); renderAll(); });
    actions.append(rename, del); row.append(label, actions); root.append(row);
  });
  if (!data.folders.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "Crie pastas como Certificados, Cursos ou Jogos."; root.append(empty); }
}

async function exportBackup() {
  const payload = { app: "Radar Local", schemaVersion: 1, exportedAt: new Date().toISOString(), ...data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `radar-local-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Backup JSON exportado.");
}

async function importBackup(event) {
  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.items)) throw new Error("Este arquivo não parece ser um backup do Radar Local.");
    if (!confirm(`Importar ${parsed.folders.length} pastas e ${parsed.items.length} itens? Isso substituirá os dados atuais.`)) return;
    data = { folders: parsed.folders, items: parsed.items }; await persist(); renderAll(); showToast("Backup importado neste navegador.");
  } catch (error) { showToast(error.message || "Não foi possível importar o arquivo.", true); }
}

function parseUserPrice(value) {
  const clean = String(value || "").trim().replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  let normalized = clean;
  if (clean.includes(",") && clean.includes(".")) normalized = clean.lastIndexOf(",") > clean.lastIndexOf(".") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  else if (clean.includes(",")) normalized = clean.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? { amount, currency: "" } : null;
}

function formatPrice(amount, currency) {
  if (!Number.isFinite(Number(amount))) return "Sem preço";
  if (currency) { try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(amount)); } catch {} }
  return `${Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "data desconhecida" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function showToast(message, isError = false) { const toast = document.getElementById("toast"); toast.textContent = message; toast.classList.toggle("error", isError); toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 3300); }

// Runs in the page context; keep this function self-contained for executeScript.
function extractPageInfo(selector) {
  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();
  const parse = (value, currencyHint = "") => {
    if (value == null) return null;
    const raw = String(value).trim();
    const currency = currencyHint || (raw.includes("R$") ? "BRL" : /\bBRL\b/i.test(raw) ? "BRL" : /€/.test(raw) ? "EUR" : /£/.test(raw) ? "GBP" : /\bUSD\b/i.test(raw) ? "USD" : "");
    let number = raw.replace(/[^\d,.-]/g, "");
    if (!number) return null;
    if (number.includes(",") && number.includes(".")) number = number.lastIndexOf(",") > number.lastIndexOf(".") ? number.replace(/\./g, "").replace(",", ".") : number.replace(/,/g, "");
    else if (number.includes(",")) number = number.replace(",", ".");
    const amount = Number(number);
    return Number.isFinite(amount) && amount > 0 && amount < 100000000 ? { amount, currency } : null;
  };
  const title = cleanText(document.querySelector('meta[property="og:title"]')?.content || document.querySelector("h1")?.innerText || document.title);
  const candidates = [];
  const add = (value, currency, source, confidence) => { const p = parse(value, currency); if (p) candidates.push({ ...p, source, confidence }); };
  if (selector) {
    try {
      const node = document.querySelector(selector);
      if (node) add(node.getAttribute("content") || node.getAttribute("data-price") || node.innerText || node.textContent, node.getAttribute("currency") || "", "CSS selector", "high");
    } catch {}
  }
  const walkJson = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walkJson); return; }
    const type = value["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some(t => ["Product", "Offer", "AggregateOffer"].includes(t))) {
      const offer = value.offers || value;
      const offers = Array.isArray(offer) ? offer : [offer];
      offers.forEach(entry => {
        if (!entry || typeof entry !== "object") return;
        add(entry.price ?? entry.lowPrice ?? entry.priceSpecification?.price, entry.priceCurrency || entry.priceSpecification?.priceCurrency || "", "JSON-LD", "high");
      });
    }
    Object.values(value).forEach(walkJson);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => { try { walkJson(JSON.parse(script.textContent)); } catch {} });
  const metas = [
    ['meta[property="product:price:amount"]', 'meta[property="product:price:currency"]'],
    ['meta[property="og:price:amount"]', 'meta[property="og:price:currency"]'],
    ['meta[itemprop="price"]', 'meta[itemprop="priceCurrency"]'],
    ['meta[name="price"]', 'meta[name="currency"]']
  ];
  metas.forEach(([priceSelector, currencySelector]) => {
    const p = document.querySelector(priceSelector); if (p) add(p.content || p.getAttribute("content") || p.textContent, document.querySelector(currencySelector)?.content || "", "metadata", "high");
  });
  document.querySelectorAll('[itemprop="price"], [data-price]').forEach(node => {
    if (candidates.length > 30) return;
    add(node.getAttribute("content") || node.getAttribute("data-price") || node.textContent, node.closest('[itemtype*="Offer"]')?.querySelector('[itemprop="priceCurrency"]')?.content || "", "page markup", "medium");
  });
  let chosen = candidates.find(candidate => candidate.source === "CSS selector") || candidates.find(candidate => candidate.source === "JSON-LD") || candidates.find(candidate => candidate.source === "metadata") || candidates.find(candidate => candidate.source === "page markup");
  if (!chosen) {
    const text = document.body?.innerText?.slice(0, 180000) || "";
    const patterns = [/R\$\s?[\d.]+,\d{2}/g, /(?:US\$|USD\s?)\s?[\d,]+(?:\.\d{2})?/g, /€\s?[\d.,]+/g, /£\s?[\d.,]+/g];
    for (const pattern of patterns) { const match = text.match(pattern)?.[0]; if (match) { chosen = { ...parse(match), source: "texto visível", confidence: "low" }; break; } }
  }
  return { title, price: chosen || null };
}
