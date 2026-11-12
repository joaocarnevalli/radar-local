const STORAGE_KEY = "radarLocalData";
const SETTINGS_KEY = "radarLocalSettings";
const AUTO_STATUS_KEY = "radarLocalAutoStatus";
const NO_FOLDER = "__no_folder__";
const FOLDER_COLORS = [
  { name: "Prata", value: "#c6c6c6" }, { name: "Azul", value: "#86a9e8" },
  { name: "Violeta", value: "#b69ade" }, { name: "Verde", value: "#78b99a" },
  { name: "Âmbar", value: "#d4ad68" }, { name: "Coral", value: "#dc8f88" },
  { name: "Ciano", value: "#75b9c4" }, { name: "Rosa", value: "#ce8ab3" }
];

const collapsedGroups = new Set();
let isBatchUpdating = false;
let data = { folders: [], items: [] };
let settings = { startupRefreshEnabled: false, startupRefreshPaceMinutes: 5, startupRefreshStaleHours: 24, defaultFolderId: NO_FOLDER };
let currentPage = null;
let toastTimer;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  data = await loadData();
  settings = await loadSettings();
  bindEvents();
  renderAll();
  renderSettings();
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

async function loadSettings() {
  const saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  return normalizeSettings(saved);
}

function normalizeSettings(saved = {}) {
  return {
    startupRefreshEnabled: saved.startupRefreshEnabled === true,
    startupRefreshPaceMinutes: [1, 3, 5, 10].includes(Number(saved.startupRefreshPaceMinutes)) ? Number(saved.startupRefreshPaceMinutes) : 5,
    startupRefreshStaleHours: [12, 24, 48, 168].includes(Number(saved.startupRefreshStaleHours)) ? Number(saved.startupRefreshStaleHours) : 24,
    defaultFolderId: saved.defaultFolderId || NO_FOLDER
  };
}

async function persistSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  renderSettings();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === button.dataset.view));
  }));
  document.getElementById("captureButton").addEventListener("click", onCaptureClick);
  document.getElementById("saveItem").addEventListener("click", saveCurrentPage);
  document.getElementById("cancelAdd").addEventListener("click", () => document.getElementById("addForm").classList.add("hidden"));
  document.getElementById("folderForm").addEventListener("submit", createFolder);
  document.getElementById("refreshAll").addEventListener("click", refreshAllItems);
  document.getElementById("backupExport").addEventListener("click", exportBackup);
  document.getElementById("backupImport").addEventListener("click", () => document.getElementById("backupFile").click());
  document.getElementById("backupFile").addEventListener("change", importBackup);
  document.getElementById("startupRefreshEnabled").addEventListener("change", async event => {
    settings.startupRefreshEnabled = event.target.checked;
    await persistSettings();
    if (!settings.startupRefreshEnabled) {
      await chrome.alarms.clear("radar-local-startup-refresh");
      await chrome.storage.local.remove("radarLocalAutoQueue");
    }
    showToast(settings.startupRefreshEnabled ? "A fila automática começa no próximo início do navegador." : "Fila cancelada. Se houver uma leitura em curso, ela termina antes de parar.");
  });
  document.getElementById("startupRefreshPaceMinutes").addEventListener("change", async event => { settings.startupRefreshPaceMinutes = Number(event.target.value); await persistSettings(); showToast("O novo intervalo será usado nas próximas páginas da fila."); });
  document.getElementById("startupRefreshStaleHours").addEventListener("change", async event => { settings.startupRefreshStaleHours = Number(event.target.value); await persistSettings(); });
  document.getElementById("defaultFolder").addEventListener("change", async event => { settings.defaultFolderId = event.target.value; await persistSettings(); showToast("Pasta padrão atualizada."); });

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
  fillFolderSelect(document.getElementById("itemFolder"), settings.defaultFolderId, true);
  document.getElementById("addForm").classList.remove("hidden");
}

async function saveCurrentPage() {
  if (!currentPage?.url) return showToast("Não encontrei a URL desta página.", true);
  const name = document.getElementById("itemName").value.trim();
  if (!name) return showToast("Informe um nome para o item.", true);
  const duplicate = data.items.find(item => normalizeItemUrl(item.url) === normalizeItemUrl(currentPage.url));
  if (duplicate) return showToast("Esse link já está monitorado. Use Atualizar no item existente.", true);
  const price = parseUserPrice(document.getElementById("itemPrice").value);
  const target = parseUserPrice(document.getElementById("itemTarget").value);
  const entry = {
    id: crypto.randomUUID(), name, url: currentPage.url,
    regularPrice: currentPage.regularPrice || null,
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
  data.folders.push({ id: crypto.randomUUID(), name, color: FOLDER_COLORS[0].value });
  input.value = "";
  await persist();

  renderAll();
  showToast("Pasta criada.");
}

function renderAll() {
  fillFolderSelect(document.getElementById("itemFolder"), NO_FOLDER, true);
  renderItems();
  renderFolders();
  renderSettings();
  updateRefreshAllButton();
}

function renderColorPicker(root, selected, onSelect, label) {
  root.replaceChildren();
  root.classList.add("color-picker");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", label);
  FOLDER_COLORS.forEach(color => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.style.setProperty("--swatch-color", color.value);
    swatch.title = color.name;
    swatch.setAttribute("aria-label", color.name);
    swatch.setAttribute("aria-pressed", String(selected === color.value));
    if (selected === color.value) swatch.classList.add("selected");
    swatch.addEventListener("click", () => onSelect(color.value));
    root.append(swatch);
  });
}

function getFolderColor(folder, index = 0) {
  return FOLDER_COLORS.find(color => color.value === folder?.color)?.value || FOLDER_COLORS[0].value;
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
  const root = document.getElementById("itemsList");
  root.replaceChildren();
  const total = data.items.length;
  const summary = document.getElementById("itemsSummary");
  summary.textContent = `${total} ${total === 1 ? "item" : "itens"} · ${data.folders.length} ${data.folders.length === 1 ? "pasta" : "pastas"}`;
  document.getElementById("emptyState").classList.toggle("hidden", total > 0 || data.folders.length > 0);
  if (!total && !data.folders.length) { updateRefreshAllButton(); return; }

  const groups = data.folders.map((folder, index) => ({ id: folder.id, name: folder.name, color: getFolderColor(folder, index), items: data.items.filter(item => item.folderId === folder.id) }));
  const unfiled = data.items.filter(item => !data.folders.some(folder => folder.id === item.folderId));
  if (unfiled.length) groups.push({ id: NO_FOLDER, name: "Sem pasta", color: "#9b9b9b", items: unfiled });

  groups.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  groups.forEach(groupData => {
    const section = document.createElement("details");
    section.className = "folder-section";
    section.open = !collapsedGroups.has(groupData.id);
    section.style.setProperty("--folder-color", groupData.color);
    const heading = document.createElement("summary");
    heading.className = "folder-section-heading";
    const dot = document.createElement("span"); dot.className = "folder-dot"; dot.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span"); copy.className = "folder-section-copy";
    const name = document.createElement("span"); name.className = "folder-section-name"; name.textContent = groupData.name;
    const count = document.createElement("span"); count.className = "folder-section-count"; count.textContent = String(groupData.items.length);
    copy.append(name, count); heading.append(dot, copy); section.append(heading);
    section.addEventListener("toggle", () => { if (section.open) collapsedGroups.delete(groupData.id); else collapsedGroups.add(groupData.id); });
    const cards = document.createElement("div"); cards.className = "folder-section-items";
    if (groupData.items.length) groupData.items.forEach(item => cards.append(buildItemCard(item, groupData.color)));
    else { const empty = document.createElement("div"); empty.className = "folder-empty"; empty.textContent = "Nenhum item nesta pasta ainda."; cards.append(empty); }
    section.append(cards); root.append(section);
  });
  updateRefreshAllButton();
}

function updateRefreshAllButton() {
  const button = document.getElementById("refreshAll");
  if (!button) return;
  button.disabled = isBatchUpdating || data.items.length === 0;
  button.textContent = isBatchUpdating ? button.textContent : "Atualizar tudo";
  button.title = data.items.length ? `Atualizar os ${data.items.length} itens monitorados` : "Adicione um item para habilitar a atualização";
}

function getDiscountPercent(item) {
  const current = Number(item.price?.amount);
  const regular = Number(item.regularPrice?.amount ?? item.regularPrice);
  const currentCurrency = item.price?.currency || "";
  const regularCurrency = item.regularPrice?.currency || currentCurrency;
  if (!Number.isFinite(current) || !Number.isFinite(regular) || current <= 0 || regular <= current) return null;
  if (currentCurrency && regularCurrency && currentCurrency !== regularCurrency) return null;
  return Math.round((1 - current / regular) * 100);
}
function buildItemCard(item, folderColor = "#9b9b9b") {
  const card = document.createElement("article"); card.className = "item-card"; card.style.setProperty("--folder-color", folderColor);
  const top = document.createElement("div"); top.className = "item-top";
  const name = document.createElement("div"); name.className = "item-name"; name.textContent = item.name;
  const priceBlock = document.createElement("div"); priceBlock.className = "price-block";
  const price = document.createElement("div"); price.className = "price"; price.textContent = item.price ? formatPrice(item.price.amount, item.price.currency) : "Sem preço";
  const correctPrice = document.createElement("button"); correctPrice.type = "button"; correctPrice.className = "price-correct"; correctPrice.textContent = "Corrigir"; correctPrice.title = "Corrigir o preço atual manualmente";
  correctPrice.addEventListener("click", async () => {
    const value = prompt("Informe o preço atual (ex.: 1.899,90):", item.price ? formatPrice(item.price.amount, item.price.currency) : "");
    if (value === null) return;
    const parsed = parseUserPrice(value);
    if (!parsed || parsed.amount <= 0) return showToast("Informe um preço válido, como 1.899,90.", true);
    const checkedAt = new Date().toISOString();
    const currency = item.price?.currency || "BRL";
    item.price = { ...parsed, currency, checkedAt, source: "manual" };
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: parsed.amount, currency, checkedAt, source: "manual" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    await persist(); renderItems(); showToast("Preço corrigido manualmente.");
  });
  const discountPercent = getDiscountPercent(item);
  priceBlock.append(price);
  if (discountPercent !== null) {
    const badge = document.createElement("span"); badge.className = "discount-badge"; badge.textContent = `${discountPercent}% OFF`;
    badge.title = item.regularPrice?.amount ? `Preço normal: ${formatPrice(item.regularPrice.amount, item.regularPrice.currency || item.price?.currency)}` : "Desconto calculado sobre o preço normal";
    priceBlock.append(badge);
  }
  priceBlock.append(correctPrice);
  top.append(name, priceBlock); card.append(top);
  const link = document.createElement("a"); link.className = "item-url"; link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = item.url; link.title = item.url; card.append(link);
  const meta = document.createElement("div"); meta.className = "item-meta";
  const last = item.price?.checkedAt ? `Verificado ${formatDate(item.price.checkedAt)}` : "Ainda não verificado";
  meta.textContent = `${last}${item.target != null ? ` · alvo ${formatPrice(item.target, item.price?.currency)}` : ""}`;
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
  const refresh = document.createElement("button"); refresh.className = "primary item-refresh"; refresh.textContent = isBatchUpdating ? "Aguarde" : "Atualizar"; refresh.title = "Abrir a página em segundo plano e verificar o preço"; refresh.disabled = isBatchUpdating;
  refresh.addEventListener("click", () => refreshPrice(item, refresh));
  const remove = document.createElement("button"); remove.className = "icon-action danger"; remove.textContent = "×"; remove.title = "Remover item"; remove.setAttribute("aria-label", `Remover ${item.name}`);
  remove.addEventListener("click", async () => { if (!confirm(`Remover “${item.name}” e o histórico local?`)) return; data.items = data.items.filter(row => row.id !== item.id); await persist(); renderAll(); });
  controls.append(targetLabel, folderLabel, refresh, remove); card.append(controls);
  const history = document.createElement("details"); history.className = "history";
  const summary = document.createElement("summary"); summary.textContent = `Histórico (${item.history?.length || 0} registros)`; history.append(summary);
  [...(item.history || [])].slice(-8).reverse().forEach((point, displayIndex) => {
    const historyIndex = item.history.length - 1 - displayIndex;
    const entry = document.createElement("div"); entry.className = "history-entry";
    const date = document.createElement("span"); date.className = "history-date"; date.textContent = formatDate(point.checkedAt);
    const value = document.createElement("span"); value.className = "history-value"; value.textContent = `${formatPrice(point.amount, point.currency)} · ${point.source || "página"}`;
    const removePoint = document.createElement("button"); removePoint.type = "button"; removePoint.className = "history-remove"; removePoint.textContent = "×"; removePoint.title = "Remover este registro"; removePoint.setAttribute("aria-label", "Remover este registro do histórico");
    removePoint.addEventListener("click", async () => { if (!confirm("Remover este registro do histórico?")) return; item.history.splice(historyIndex, 1); await persist(); renderItems(); });
    entry.append(date, value, removePoint); history.append(entry);
  });
  card.append(history);
  const selectorDetails = document.createElement("details"); selectorDetails.className = "selector-disclosure"; selectorDetails.open = Boolean(item.selector);
  const selectorSummary = document.createElement("summary"); selectorSummary.textContent = "Seletor CSS (avançado)";
  const selectorLabel = document.createElement("label"); selectorLabel.className = "selector-label"; selectorLabel.textContent = "Seletor do preço atual";
  const selectorInput = document.createElement("input"); selectorInput.placeholder = "Ex.: [itemprop='price']"; selectorInput.value = item.selector || "";
  selectorInput.addEventListener("change", async () => { item.selector = selectorInput.value.trim(); await persist(); showToast("Seletor salvo."); });
  selectorLabel.append(selectorInput); selectorDetails.append(selectorSummary, selectorLabel); card.append(selectorDetails);
  return card;
}

async function refreshPrice(item, button, options = {}) {
  if (button) { button.disabled = true; button.textContent = "Lendo…"; }
  let tabId;
  try {
    const url = new URL(item.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Apenas páginas HTTP/HTTPS são aceitas.");
    if (!options.permissionGranted) {
      const originPattern = `${url.origin}/*`;
      const allowed = await chrome.permissions.contains({ origins: [originPattern] }) || await chrome.permissions.request({ origins: [originPattern] });
      if (!allowed) throw new Error("Acesso ao domínio não foi autorizado.");
    }
    const tab = await chrome.tabs.create({ url: item.url, active: false }); tabId = tab.id;
    await waitForTab(tabId);
    await delay(1200);
    let found = null;
    let extractedRegularPrice = null;
    for (let attempt = 0; attempt < 4 && !found; attempt += 1) {
      if (attempt) await delay(1500);
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageInfo, args: [item.selector || ""] });
      found = result?.result?.price || null;
      extractedRegularPrice = result?.result?.regularPrice || null;
    }
    if (!found) throw new Error("Preço não encontrado. Configure um seletor CSS ou informe o valor manualmente.");
    const checkedAt = new Date().toISOString();
    const prior = item.price;
    item.price = { ...found, checkedAt };
    item.regularPrice = extractedRegularPrice;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: found.amount, currency: found.currency || "", checkedAt, source: found.source || "página" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    await persist();
    if (options.rerender !== false) renderItems();
    const fell = prior && prior.currency === found.currency && found.amount < prior.amount;
    const reachedTarget = item.target != null && found.amount <= item.target;
    if (!options.suppressToast) showToast(`${formatPrice(found.amount, found.currency)} registrado${fell ? " · preço caiu" : ""}${reachedTarget ? " · atingiu o alvo" : ""}.`);
    return { ok: true, price: found };
  } catch (error) {
    if (!options.suppressToast) showToast(error.message || "Não foi possível verificar o preço.", true);
    return { ok: false, error: error.message || "Falha na verificação." };
  } finally {
    if (tabId) { try { await chrome.tabs.remove(tabId); } catch {} }
    if (button) { button.disabled = false; button.textContent = "Atualizar"; }
  }
}

async function refreshAllItems() {
  if (isBatchUpdating || !data.items.length) return;
  const button = document.getElementById("refreshAll");
  const items = [...data.items];
  const origins = [...new Set(items.flatMap(item => { try { const url = new URL(item.url); return /^https?:$/.test(url.protocol) ? [`${url.origin}/*`] : []; } catch { return []; } }))];
  if (!origins.length) return showToast("Nenhum item tem um endereço HTTP/HTTPS válido.", true);
  isBatchUpdating = true;
  button.disabled = true;
  button.textContent = "Preparando…";
  button.setAttribute("aria-busy", "true");
  renderItems();
  let updated = 0;
  let failed = 0;
  const failedNames = [];
  try {
    const allowed = await chrome.permissions.request({ origins });
    if (!allowed) throw new Error("A permissão para um ou mais sites não foi concedida.");
    for (let index = 0; index < items.length; index += 1) {
      button.textContent = `Atualizando ${index + 1}/${items.length}`;
      const result = await refreshPrice(items[index], null, { permissionGranted: true, suppressToast: true, rerender: false });
      if (result.ok) updated += 1; else { failed += 1; failedNames.push(items[index].name); }
      renderItems();
    }
    const failedSummary = failedNames.length ? ` · Falha: ${failedNames.slice(0, 2).join(", ")}${failedNames.length > 2 ? "…" : ""}` : "";
    const updatedLabel = updated === 1 ? "1 item atualizado" : `${updated} itens atualizados`;
    showToast(failed ? `${updatedLabel} · ${failed} ${failed === 1 ? "falhou" : "falharam"}${failedSummary}.` : `${updatedLabel}.`, failed > 0);
  } catch (error) {
    showToast(error.message || "Não foi possível iniciar a atualização em lote.", true);
  } finally {
    isBatchUpdating = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Atualizar tudo";
    renderAll();
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
  data.folders.forEach((folder, index) => {
    const row = document.createElement("div"); row.className = "folder-row"; row.style.setProperty("--folder-color", getFolderColor(folder, index));
    const label = document.createElement("div"); label.className = "folder-label"; label.textContent = folder.name;
    const count = document.createElement("span"); count.className = "folder-count"; count.textContent = `${data.items.filter(item => item.folderId === folder.id).length} itens`; label.append(count);
    const actions = document.createElement("div"); actions.className = "folder-actions";
    const rename = document.createElement("button"); rename.className = "icon-action"; rename.textContent = "Renomear";
    rename.addEventListener("click", async () => { const value = prompt("Novo nome da pasta:", folder.name)?.trim(); if (!value || value === folder.name) return; if (data.folders.some(other => other.id !== folder.id && other.name.toLowerCase() === value.toLowerCase())) return showToast("Já existe uma pasta com esse nome.", true); folder.name = value; await persist(); renderAll(); });
    const del = document.createElement("button"); del.className = "icon-action danger"; del.textContent = "Apagar";
    del.addEventListener("click", async () => { if (!confirm(`Apagar a pasta “${folder.name}”? Os itens serão mantidos em “Sem pasta”.`)) return; data.items.forEach(item => { if (item.folderId === folder.id) item.folderId = NO_FOLDER; }); data.folders = data.folders.filter(other => other.id !== folder.id); collapsedGroups.delete(folder.id); await persist(); renderAll(); });
    actions.append(rename, del);
    const colorLabel = document.createElement("span"); colorLabel.className = "folder-color-caption"; colorLabel.textContent = "Cor de identificação";
    const palette = document.createElement("div");
    renderColorPicker(palette, getFolderColor(folder, index), async color => { folder.color = color; await persist(); renderAll(); }, `Cor da pasta ${folder.name}`);
    row.append(label, actions, colorLabel, palette); root.append(row);
  });
  if (!data.folders.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "Crie pastas como Certificados, Cursos ou Jogos."; root.append(empty); }
}

async function renderSettings() {
  const enabled = document.getElementById("startupRefreshEnabled");
  if (!enabled) return;
  enabled.checked = settings.startupRefreshEnabled;
  document.getElementById("startupRefreshPaceMinutes").value = String(settings.startupRefreshPaceMinutes);
  document.getElementById("startupRefreshStaleHours").value = String(settings.startupRefreshStaleHours);
  const folderSelect = document.getElementById("defaultFolder");
  fillFolderSelect(folderSelect, settings.defaultFolderId, true);
  settings.defaultFolderId = folderSelect.value;
  const status = document.getElementById("startupRefreshStatus");
  if (!settings.startupRefreshEnabled) {
    status.textContent = "Desativada. Nenhuma página será aberta automaticamente.";
    return;
  }
  const stored = (await chrome.storage.local.get(AUTO_STATUS_KEY))[AUTO_STATUS_KEY];
  const queue = (await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue;
  if (queue?.ids?.length) {
    status.textContent = `Lote em andamento: ${queue.updated || 0} atualizado(s), ${queue.ids.length} restante(s).`;
  } else if (stored?.lastRun) {
    const when = formatDate(stored.lastRun);
    status.textContent = `Última execução: ${when} · ${stored.updated || 0} atualizados${stored.skipped ? ` · ${stored.skipped} ignorados` : ""}.`;
  } else {
    status.textContent = `Ativa para o próximo início: fila de itens sem atualização há ${settings.startupRefreshStaleHours === 168 ? "7 dias" : `${settings.startupRefreshStaleHours} horas`}, com intervalo de ${settings.startupRefreshPaceMinutes} min entre páginas.`;
  }
}

async function exportBackup() {
  const payload = { app: "Radar Local", schemaVersion: 1, exportedAt: new Date().toISOString(), ...data, settings };
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
    if (!confirm(`Importar ${parsed.folders.length} pastas e ${parsed.items.length} itens? Isso substituirá os dados atuais${parsed.settings ? " e as configurações" : ""}.`)) return;
    data = { folders: parsed.folders, items: parsed.items };
    if (parsed.settings && typeof parsed.settings === "object") {
      settings = normalizeSettings(parsed.settings);
      if (settings.defaultFolderId !== NO_FOLDER && !data.folders.some(folder => folder.id === settings.defaultFolderId)) settings.defaultFolderId = NO_FOLDER;
      await persistSettings();
    }
    await persist(); renderAll(); showToast("Backup importado neste navegador.");
  } catch (error) { showToast(error.message || "Não foi possível importar o arquivo.", true); }
}

function normalizeItemUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    [...url.searchParams.keys()].forEach(key => { if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key); });
    url.searchParams.sort();
    return url.href;
  } catch { return String(value || "").trim(); }
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
