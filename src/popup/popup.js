// Núcleo do popup e do painel: estado global, inicialização, sincronização entre janelas e gravação.
// As demais funções ficam em arquivos vizinhos carregados antes deste (veja popup.html).
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
const expandedProducts = new Set();
const expandedOffers = new Set();
const faviconFetches = new Map();
const refreshStates = new Map();
const productRefreshStates = new Set();
let isBatchUpdating = false;
const floatingWindowMode = new URLSearchParams(location.search).get("floating") === "1";
let data = { folders: [], products: [], items: [], siteProfiles: [] };
const DEFAULT_ACCENT_COLOR = "#c6c6c6";
let settings = { startupRefreshEnabled: false, startupRefreshPaceMinutes: 5, startupRefreshStaleMinutes: 1440, startupRefreshStaleUnit: "hours", defaultFolderId: NO_FOLDER, priceAlertsEnabled: false, priceAlertSoundEnabled: false, priceAlertVolume: 35, priceAlertCooldownMinutes: 15, priceAlertSoundStyle: "radar", priceAlertMinDropPercent: 0, priceAlertNewLowEnabled: false, quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00", priceAnomalyGuardEnabled: true, priceAnomalyThresholdPercent: 50, priceSourceEnabled: true, priceHistoryChartEnabled: true, contextMenuEnabled: false, accentColor: DEFAULT_ACCENT_COLOR };
let currentPage = null;
let dataBaseline;
let settingsBaseline;
let pendingWrites = 0;
let pendingSettingsWrites = 0;
let refreshViewTimer;
let toastTimer;

document.addEventListener("DOMContentLoaded", () => { void init().catch(showOperationError); });
window.addEventListener("unhandledrejection", event => { event.preventDefault(); showOperationError(event.reason); });
function showOperationError(error) {
  showToast(error?.message || "Não foi possível salvar. Os dados anteriores foram mantidos.", true);
  if (dataBaseline && !pendingWrites) void synchronizeData().catch(() => {});
}
async function synchronizeData(render = true) {
  if (pendingWrites) return;
  const latest = await RadarData.read();
  if (pendingWrites) return;
  RadarData.reconcile(data, latest);
  dataBaseline = RadarData.clone(latest);
  if (render) renderAll();
}
function scheduleDataSync() {
  clearTimeout(refreshViewTimer);
  refreshViewTimer = setTimeout(() => {
    if (pendingWrites) return;
    const editing = document.activeElement?.matches("input:not([type=checkbox]):not([type=range]):not([type=color]), textarea");
    if (editing) { scheduleDataSync(); return; }
    void synchronizeData().catch(showOperationError);
  }, 250);
}

async function init() {
  document.documentElement.classList.toggle("floating-window", floatingWindowMode);
  try { data = await loadData(); }
  catch (error) { await showDataRecovery(error); return; }
  settings = await loadSettings();
  dataBaseline = RadarData.clone(data);
  settingsBaseline = RadarData.clone(settings);
  bindEvents();
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "Radar Local" });
  renderAll();
  await syncQueueStatus();
  focusRequestedItem();
  await inspectCurrentTab();
  renderSiteProfiles();
}

// Abre e destaca a oferta pedida pela notificação (?focusItem=id).
function focusRequestedItem() {
  const itemId = new URLSearchParams(location.search).get("focusItem");
  const item = itemId && data.items.find(row => row.id === itemId);
  if (!item) return;
  expandedProducts.add(item.productId);
  expandedOffers.add(item.id);
  renderItems();
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-item-id="${CSS.escape(item.id)}"]`);
    card?.scrollIntoView({ block: "center" });
    card?.classList.add("focus-flash");
    setTimeout(() => card?.classList.remove("focus-flash"), 1800);
  });
}

async function showDataRecovery(error) {
  const original = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  const main = document.querySelector("main");
  const section = document.createElement("section"); section.className = "settings-card";
  const heading = document.createElement("h2"); heading.textContent = "Os dados precisam de revisão";
  const message = document.createElement("p"); message.textContent = `${error.message} Os registros originais continuam salvos. Exporte uma cópia antes de recuperar.`;
  const backup = document.createElement("button"); backup.textContent = "Exportar dados originais";
  backup.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "Radar Local", recovery: true, rawData: original }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "radar-local-recuperacao.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const restore = document.createElement("button"); restore.textContent = "Restaurar backup válido";
  const file = document.createElement("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  restore.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    try {
      const selected = file.files?.[0]; if (!selected) return;
      if (selected.size > 9 * 1024 * 1024) throw new Error("O backup excede 9 MB.");
      const parsed = JSON.parse(await selected.text());
      if (parsed.schemaVersion != null && (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion > 3 || parsed.schemaVersion < 1)) throw new Error("Versão de backup não suportada.");
      const restored = RadarData.normalize(parsed);
      if (!await radarConfirm("Os dados atuais serão substituídos pelo backup validado. Guarde a cópia dos dados originais antes de continuar.", { title: "Restaurar backup?", confirmLabel: "Restaurar", danger: true })) return;
      await RadarData.replace(original, restored, null, true);
      location.reload();
    } catch (failure) { message.textContent = failure.message; }
    finally { file.value = ""; }
  });
  section.append(heading, message, backup, restore, file); main.replaceChildren(section);
  document.querySelector(".tabs").hidden = true;
  for (const button of document.querySelectorAll(".topbar button")) button.disabled = true;
}

async function loadData() { return RadarData.read(); }
function normalizeProductData(saved) { return RadarData.normalize(saved); }


function normalizeFavicons(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const icons = {}; let size = 0;
  for (const [host, dataUrl] of Object.entries(value)) {
    if (!/^[a-z0-9.-]+$/i.test(host) || typeof dataUrl !== "string" || !/^data:image\/(?:png|jpe?g|webp|gif|avif|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i.test(dataUrl)) continue;
    const bytes = Math.ceil(dataUrl.length * 0.75);
    if (bytes > 24 * 1024 || size + bytes > 512 * 1024) continue;
    icons[host] = dataUrl; size += bytes;
  }
  return icons;
}

async function persist() {
  const snapshot = RadarData.normalize(data);
  const patch = RadarData.changes(dataBaseline, snapshot);
  dataBaseline = RadarData.clone(snapshot);
  pendingWrites += 1;
  try { await RadarData.commit(patch); }
  finally { pendingWrites -= 1; if (!pendingWrites) await synchronizeData(false); }
}
async function openFloatingWindow() {
  const sourceTab = currentPage?.tabId;
  const url = chrome.runtime.getURL("src/popup/popup.html?floating=1" + (sourceTab ? "&sourceTab=" + sourceTab : ""));
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
    const existing = windows.find(win => win.tabs?.some(tab => tab.url?.startsWith(chrome.runtime.getURL("src/popup/popup.html?floating=1"))));
    if (existing) { await chrome.windows.update(existing.id, { focused: true }); return; }
    await chrome.windows.create({ url, type: "popup", width: 420, height: 760, focused: true });
  } catch (error) { showToast(error.message || "Não consegui abrir a janela flutuante.", true); }
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html" + (currentPage?.tabId ? "?sourceTab=" + currentPage.tabId : "")) });
}

function bindEvents() {
  document.getElementById("pickPriceButton")?.addEventListener("click", () => { void startPricePicker().catch(showOperationError); });
  document.getElementById("siteProfileForm")?.addEventListener("submit", event => { void addSiteProfileFromForm(event).catch(showOperationError); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) scheduleDataSync();
    if (changes[SETTINGS_KEY] && !pendingSettingsWrites) { settings = normalizeSettings(changes[SETTINGS_KEY].newValue || {}); settingsBaseline = RadarData.clone(settings); void renderSettings().catch(showOperationError); }
    if (changes.radarLocalAutoQueue || changes[AUTO_STATUS_KEY]) void syncQueueStatus().catch(showOperationError);
  });
  if (document.documentElement.classList.contains("dashboard-embed")) {
    window.addEventListener("message", event => {
      if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== "radar:navigate") return;
      const view = ["itemsView", "foldersView", "settingsView"].includes(event.data.view) ? event.data.view : "itemsView";
      document.querySelector(`.tab[data-view="${view}"]`)?.click();
    });
  }
  document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === button.dataset.view));
  }));
  document.getElementById("captureButton").addEventListener("click", onCaptureClick);
  document.getElementById("saveItem").addEventListener("click", saveCurrentPage);
  document.getElementById("cancelAdd").addEventListener("click", () => document.getElementById("addForm").classList.add("hidden"));
  document.getElementById("openNewProduct").addEventListener("click", () => {
    const form = document.getElementById("newProductForm");
    form.classList.toggle("hidden");
    fillFolderSelect(document.getElementById("newProductFolder"), settings.defaultFolderId, true);
    if (!form.classList.contains("hidden")) document.getElementById("newProductName").focus();
  });
  document.getElementById("newProductForm").addEventListener("submit", createProduct);
  document.getElementById("cancelNewProduct").addEventListener("click", () => document.getElementById("newProductForm").classList.add("hidden"));
  document.getElementById("folderForm").addEventListener("submit", createFolder);
  document.getElementById("refreshAll").addEventListener("click", refreshAllItems);
  document.getElementById("productSearch").addEventListener("input", renderItems);
  document.getElementById("productFilter").addEventListener("change", renderItems);
  document.getElementById("productSort").addEventListener("change", renderItems);
  document.getElementById("backupExport").addEventListener("click", exportBackup);
  document.getElementById("dashboardLaunch").addEventListener("click", openDashboard);
  document.getElementById("openFloating").addEventListener("click", openFloatingWindow);
  document.getElementById("backupImport").addEventListener("click", () => document.getElementById("backupFile").click());
  document.getElementById("backupFile").addEventListener("change", importBackup);
  document.getElementById("backupCsv").addEventListener("click", exportCsv);
  document.getElementById("startupRefreshEnabled").addEventListener("change", async event => {
    settings.startupRefreshEnabled = event.target.checked;
    await persistSettings();
    if (!settings.startupRefreshEnabled && !settings.periodicRefreshEnabled) {
      await chrome.runtime.sendMessage({ type: "radar:queue-control", action: "disable-auto" });
    }
    showToast(settings.startupRefreshEnabled ? "A fila automática começa no próximo início do navegador." : "Fila cancelada. Se houver uma leitura em curso, ela termina antes de parar.");
  });
  document.getElementById("periodicRefreshEnabled").addEventListener("change", async event => {
    settings.periodicRefreshEnabled = event.target.checked;
    await persistSettings();
    if (!settings.periodicRefreshEnabled && !settings.startupRefreshEnabled) await chrome.runtime.sendMessage({ type: "radar:queue-control", action: "disable-auto" });
    showToast(settings.periodicRefreshEnabled ? `Verificação a cada ${settings.periodicRefreshHours} h ativada.` : "Verificação periódica desativada.");
  });
  document.getElementById("periodicRefreshHours").addEventListener("change", async event => {
    settings.periodicRefreshHours = Number(event.target.value);
    await persistSettings();
    showToast(`Intervalo da verificação periódica: ${settings.periodicRefreshHours} h.`);
  });
  const paceSlider = document.getElementById("startupRefreshPaceSlider");
  const paceInput = document.getElementById("startupRefreshPaceMinutes");
  paceSlider.addEventListener("input", () => previewPace(paceSlider.value));
  paceSlider.addEventListener("change", () => savePace(paceSlider.value));
  paceInput.addEventListener("input", () => updatePaceWarning(paceInput.value));
  paceInput.addEventListener("change", () => savePace(paceInput.value));
  const staleSlider = document.getElementById("startupRefreshStaleSlider");
  const staleValue = document.getElementById("startupRefreshStaleValue");
  staleSlider.addEventListener("input", () => previewStaleThreshold(staleSlider.value));
  staleSlider.addEventListener("change", () => saveStaleThreshold(staleSlider.value));
  staleValue.addEventListener("input", () => updateStaleSlider(staleValue.value));
  staleValue.addEventListener("change", () => saveStaleThreshold(staleValue.value));
  document.getElementById("startupRefreshStaleUnit").addEventListener("change", onStaleUnitChange);
  document.getElementById("defaultFolder").addEventListener("change", async event => { settings.defaultFolderId = event.target.value; await persistSettings(); showToast("Pasta padrão atualizada."); });
  document.getElementById("priceAlertsEnabled").addEventListener("change", onPriceAlertsToggle);
  document.getElementById("priceAlertSoundEnabled").addEventListener("change", onPriceAlertSoundToggle);
  document.getElementById("priceAlertVolume").addEventListener("input", onPriceAlertVolumeInput);
  document.getElementById("priceAlertVolume").addEventListener("change", onPriceAlertVolumeChange);
  document.getElementById("priceAlertVolumeValue").addEventListener("input", onPriceAlertVolumeValueInput);
  document.getElementById("priceAlertVolumeValue").addEventListener("change", onPriceAlertVolumeChange);
  document.getElementById("testAlertSound").addEventListener("click", testAlertSound);
  document.getElementById("priceAlertCooldownMinutes").addEventListener("change", onSoundCooldownChange);
  document.getElementById("priceAlertMinDropPercent").addEventListener("change", async event => { const value = Number(event.target.value); settings.priceAlertMinDropPercent = Number.isFinite(value) ? Math.min(99, Math.max(0, Math.round(value))) : 0; event.target.value = String(settings.priceAlertMinDropPercent); await persistSettings(); });
  document.getElementById("priceAlertNewLowEnabled").addEventListener("change", async event => { settings.priceAlertNewLowEnabled = event.target.checked; await persistSettings(); });
  document.getElementById("quietHoursEnabled").addEventListener("change", async event => { settings.quietHoursEnabled = event.target.checked; await persistSettings(); });
  for (const id of ["quietHoursStart", "quietHoursEnd"]) document.getElementById(id).addEventListener("change", async event => { settings[id] = event.target.value; await persistSettings(); });
  document.getElementById("priceAnomalyThresholdPercent").addEventListener("change", async event => { const value = Number(event.target.value); settings.priceAnomalyThresholdPercent = Number.isFinite(value) ? Math.min(95, Math.max(10, Math.round(value / 5) * 5)) : 50; event.target.value = String(settings.priceAnomalyThresholdPercent); await persistSettings(); });
  for (const [id, key] of [["priceAnomalyGuardEnabled", "priceAnomalyGuardEnabled"], ["priceSourceEnabled", "priceSourceEnabled"], ["priceHistoryChartEnabled", "priceHistoryChartEnabled"]]) {
    document.getElementById(id).addEventListener("change", async event => { settings[key] = event.target.checked; if (key === "priceAnomalyGuardEnabled") document.getElementById("priceAnomalyThresholdPercent").disabled = !event.target.checked; await persistSettings(); renderItems(); });
  }
  document.getElementById("contextMenuEnabled").addEventListener("change", async event => {
    if (event.target.checked) {
      let granted = false;
      try { granted = await chrome.permissions.request({ permissions: ["contextMenus"] }); } catch {}
      if (!granted) { event.target.checked = false; showToast("Permissão de menu contextual não concedida; o recurso ficou desligado.", true); return; }
    }
    settings.contextMenuEnabled = event.target.checked;
    await persistSettings();
    const response = await chrome.runtime.sendMessage({ type: "radar:context-menu", enabled: settings.contextMenuEnabled });
    if (!response?.ok) { settings.contextMenuEnabled = false; event.target.checked = false; await persistSettings(); showToast(response?.error || "Não foi possível ativar o menu de contexto.", true); }
    else {
      if (!settings.contextMenuEnabled) await chrome.permissions.remove({ permissions: ["contextMenus"] }).catch(() => {});
      showToast(settings.contextMenuEnabled ? "Menu de contexto ativado." : "Menu de contexto removido.");
    }
  });
  document.getElementById("pauseStartupQueue").addEventListener("click", () => controlStartupQueue("pause"));
  document.getElementById("cancelStartupQueue").addEventListener("click", () => controlStartupQueue("cancel"));
  document.getElementById("batchResume").addEventListener("click", () => { void controlStartupQueue("resume").catch(showOperationError); });
  document.getElementById("batchDismiss").addEventListener("click", () => { void controlStartupQueue("dismiss").catch(showOperationError); });
  document.getElementById("priceAlertSoundStyle").addEventListener("change", async event => { settings.priceAlertSoundStyle = event.target.value; await persistSettings(); showToast("Tipo de som salvo. Use “Testar som” para ouvir."); });
  document.getElementById("accentColor").addEventListener("input", event => { updateAccentPreview(event.target.value); });
  document.getElementById("accentColor").addEventListener("change", onAccentColorChange);
  document.getElementById("resetAccentColor").addEventListener("click", resetAccentColor);

}

function renderAll() {
  fillFolderSelect(document.getElementById("itemFolder"), NO_FOLDER, true);
  fillFolderSelect(document.getElementById("newProductFolder"), settings.defaultFolderId, true);
  renderItems();
  renderFolders();
  void renderSettings().catch(showOperationError);
  updateRefreshAllButton();
}
