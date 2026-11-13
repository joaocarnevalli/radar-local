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
let isBatchUpdating = false;
const floatingWindowMode = new URLSearchParams(location.search).get("floating") === "1";
let data = { folders: [], products: [], items: [], siteProfiles: [] };
const DEFAULT_ACCENT_COLOR = "#c6c6c6";
let settings = { startupRefreshEnabled: false, startupRefreshPaceMinutes: 5, startupRefreshStaleMinutes: 1440, startupRefreshStaleUnit: "hours", defaultFolderId: NO_FOLDER, priceAlertsEnabled: false, priceAlertSoundEnabled: false, priceAlertVolume: 35, priceAlertCooldownMinutes: 15, priceAlertSoundStyle: "radar", priceAlertMinDropPercent: 0, priceAlertNewLowEnabled: false, quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00", priceAnomalyGuardEnabled: true, priceAnomalyThresholdPercent: 50, priceSourceEnabled: true, priceHistoryChartEnabled: true, contextMenuEnabled: false, accentColor: DEFAULT_ACCENT_COLOR };
let currentPage = null;
let toastTimer;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.documentElement.classList.toggle("floating-window", floatingWindowMode);
  data = await loadData();
  settings = await loadSettings();
  bindEvents();
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "Radar Local" });
  renderAll();
  renderSettings();
  await inspectCurrentTab();
}

async function loadData() {
  const saved = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (!saved || !Array.isArray(saved.folders) || !Array.isArray(saved.items)) return { folders: [], products: [], items: [], siteProfiles: [], favicons: {} };
  const normalized = normalizeProductData(saved);
  if (!Array.isArray(saved.products)) await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

function normalizeProductData(saved) {
  const products = Array.isArray(saved.products) ? saved.products.map(product => ({ ...product })) : [];
  const items = saved.items.map(item => ({ ...item }));
  const seen = new Set(products.map(product => product.id));
  for (const item of items) {
    const productId = item.productId || item.productGroupId || item.id || crypto.randomUUID();
    item.productId = productId;
    item.productGroupId = productId;
    let product = products.find(row => row.id === productId);
    if (!product) {
      let id = productId;
      if (seen.has(id)) id = crypto.randomUUID();
      seen.add(id);
      item.productId = item.productGroupId = id;
      product = { id, name: item.name || "Produto sem nome", folderId: item.folderId || NO_FOLDER, target: item.target ?? null, createdAt: item.createdAt || new Date().toISOString() };
      products.push(product);
    }
    item.name = product.name;
    item.folderId = product.folderId || item.folderId || NO_FOLDER;
    item.target = product.target ?? item.target ?? null;
  }
  return { ...saved, folders: [...saved.folders], products, items, siteProfiles: Array.isArray(saved.siteProfiles) ? [...saved.siteProfiles] : [], favicons: normalizeFavicons(saved.favicons) };
}

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
  if (!Array.isArray(data.siteProfiles)) data.siteProfiles = [];
  if (!Array.isArray(data.products)) data.products = [];
  if (!data.favicons || typeof data.favicons !== "object") data.favicons = {};
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function getSiteHost(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
function getSameOriginFaviconUrl(pageUrl, faviconUrl) {
  try {
    const page = new URL(pageUrl); const icon = new URL(faviconUrl || "/favicon.ico", pageUrl);
    return /^https?:$/.test(icon.protocol) && icon.origin === page.origin ? icon.href : "";
  } catch { return ""; }
}
function appendStoreIcon(parent, item) {
  const icon = document.createElement("span"); icon.className = "store-favicon"; icon.setAttribute("aria-hidden", "true");
  const cached = data.favicons?.[getSiteHost(item.url)];
  if (cached) {
    const image = document.createElement("img"); image.src = cached; image.alt = ""; image.loading = "lazy"; image.decoding = "async"; icon.append(image);
  } else {
    const words = String(item.offerLabel || getSiteHost(item.url)).replace(/^www\./i, "").split(/[\s._-]+/).filter(Boolean);
    icon.textContent = words.slice(0, 2).map(word => word[0]).join("").toUpperCase() || "↗";
  }
  parent.append(icon);
}
function faviconStorageBytes() { return Object.values(data.favicons || {}).reduce((sum, value) => sum + Math.ceil(String(value).length * 0.75), 0); }
function blobToDataUrl(blob) {
  return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null); reader.onerror = () => resolve(null); reader.readAsDataURL(blob); });
}
async function cacheFavicons(offers) {
  for (const item of offers) {
    const host = getSiteHost(item.url);
    if (!host || data.favicons?.[host]) continue;
    if (faviconFetches.has(host)) { await faviconFetches.get(host); continue; }
    const iconUrl = getSameOriginFaviconUrl(item.url, item.faviconUrl);
    if (!iconUrl || faviconStorageBytes() >= 512 * 1024) continue;
    const task = (async () => {
      try {
        const origin = new URL(item.url).origin;
        if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) return;
        const response = await fetch(iconUrl, { credentials: "omit", cache: "force-cache", redirect: "follow" });
        if (!response.ok || new URL(response.url).origin !== origin) return;
        const blob = await response.blob();
        const safeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/x-icon", "image/vnd.microsoft.icon"];
        if (!safeTypes.includes(blob.type.toLowerCase()) || !blob.size || blob.size > 24 * 1024 || faviconStorageBytes() + blob.size > 512 * 1024) return;
        const dataUrl = await blobToDataUrl(blob);
        if (!dataUrl) return;
        data.favicons[host] = dataUrl;
        try { await persist(); } catch { delete data.favicons[host]; return; }
        renderItems();
      } catch {}
    })();
    faviconFetches.set(host, task);
    await task;
    faviconFetches.delete(host);
  }
}
function getSiteProfile(url) { const host = getSiteHost(url); return data.siteProfiles?.find(profile => profile.host === host) || null; }
function resolveItemSelector(item) { return item.selector?.trim() || getSiteProfile(item.url)?.selector || ""; }
function getProductSiblings(item) {
  const productId = item.productId || item.productGroupId || item.id;
  return data.items.filter(row => (row.productId || row.productGroupId || row.id) === productId);
}

function isItemStale(item) {
  const checkedAt = Date.parse(item.price?.checkedAt || "");
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt > settings.startupRefreshStaleMinutes * 60_000;
}
function isItemFresh(item) { return Boolean(item.price && !item.lastCheckError && !isItemStale(item)); }
function getQuietHoursActive() {
  if (!settings.quietHoursEnabled) return false;
  const toMinutes = value => { const parts = value.split(":").map(Number); return parts[0] * 60 + parts[1]; };
  const now = new Date(); const current = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(settings.quietHoursStart), end = toMinutes(settings.quietHoursEnd);
  return start === end ? false : start < end ? current >= start && current < end : current >= start || current < end;
}
function itemAlertsMuted(item) {
  const product = data.products.find(row => row.id === (item.productId || item.productGroupId));
  return item.alertsMuted === true || product?.alertsMuted === true;
}
async function openFloatingWindow() {
  const granted = await chrome.permissions.request({ permissions: ["windows"] }).catch(() => false);
  if (!granted) return showToast("Permissão de janelas não concedida; a janela flutuante não foi aberta.", true);
  const url = chrome.runtime.getURL("popup.html?floating=1");
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
    const existing = windows.find(win => win.tabs?.some(tab => tab.url?.startsWith(url)));
    if (existing) { await chrome.windows.update(existing.id, { focused: true }); return; }
    await chrome.windows.create({ url, type: "popup", width: 420, height: 760, focused: true });
  } catch (error) { showToast(error.message || "Não consegui abrir a janela flutuante.", true); }
}

async function loadSettings() {
  const saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  return normalizeSettings(saved);
}

function normalizeSettings(saved = {}) {
  const pace = Number(saved.startupRefreshPaceMinutes);
  const savedStaleMinutes = Number(saved.startupRefreshStaleMinutes);
  const staleHours = Number(saved.startupRefreshStaleHours);
  const staleUnit = ["minutes", "hours", "days"].includes(saved.startupRefreshStaleUnit) ? saved.startupRefreshStaleUnit : (!saved.startupRefreshStaleUnit && staleHours === 168 ? "days" : "hours");
  const staleMinutes = Number.isFinite(savedStaleMinutes) ? savedStaleMinutes : Number.isFinite(staleHours) ? staleHours * 60 : 1440;
  const accentColor = /^#[0-9a-f]{6}$/i.test(saved.accentColor || "") ? saved.accentColor : DEFAULT_ACCENT_COLOR;
  return {
    startupRefreshEnabled: saved.startupRefreshEnabled === true,
    startupRefreshPaceMinutes: Number.isFinite(pace) ? Math.min(60, Math.max(0.5, Math.round(pace * 2) / 2)) : 5,
    startupRefreshStaleMinutes: Math.min(525600, Math.max(1, Math.round(staleMinutes))),
    startupRefreshStaleUnit: staleUnit,
    defaultFolderId: saved.defaultFolderId || NO_FOLDER,
    priceAlertsEnabled: saved.priceAlertsEnabled === true,
    priceAlertSoundEnabled: saved.priceAlertSoundEnabled === true,
    priceAlertVolume: Math.min(100, Math.max(0, Number.isFinite(Number(saved.priceAlertVolume)) ? Number(saved.priceAlertVolume) : 35)),
    priceAlertCooldownMinutes: Math.min(1440, Math.max(0, Number.isFinite(Number(saved.priceAlertCooldownMinutes)) ? Number(saved.priceAlertCooldownMinutes) : 15)),
    priceAlertSoundStyle: ["radar", "chime", "double", "rise", "calm", "bell", "down", "pulse"].includes(saved.priceAlertSoundStyle) ? saved.priceAlertSoundStyle : "radar",
    priceAlertMinDropPercent: Math.min(99, Math.max(0, Number.isFinite(Number(saved.priceAlertMinDropPercent)) ? Number(saved.priceAlertMinDropPercent) : 0)),
    priceAlertNewLowEnabled: saved.priceAlertNewLowEnabled === true,
    quietHoursEnabled: saved.quietHoursEnabled === true,
    quietHoursStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.quietHoursStart || "") ? saved.quietHoursStart : "22:00",
    quietHoursEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.quietHoursEnd || "") ? saved.quietHoursEnd : "08:00",
    priceAnomalyGuardEnabled: saved.priceAnomalyGuardEnabled !== false,
    priceAnomalyThresholdPercent: Math.min(95, Math.max(10, Number.isFinite(Number(saved.priceAnomalyThresholdPercent)) ? Number(saved.priceAnomalyThresholdPercent) : 50)),
    priceSourceEnabled: saved.priceSourceEnabled !== false,
    priceHistoryChartEnabled: saved.priceHistoryChartEnabled !== false,
    contextMenuEnabled: saved.contextMenuEnabled === true,
    accentColor
  };
}

async function persistSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  renderSettings();
}

function bindEvents() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.radarLocalAutoQueue || changes[AUTO_STATUS_KEY])) syncQueueStatus();
  });
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
  document.getElementById("backupExport").addEventListener("click", exportBackup);
  document.getElementById("openFloating").addEventListener("click", openFloatingWindow);
  document.getElementById("backupImport").addEventListener("click", () => document.getElementById("backupFile").click());
  document.getElementById("backupFile").addEventListener("change", importBackup);
  document.getElementById("backupCsv").addEventListener("click", exportCsv);
  document.getElementById("startupRefreshEnabled").addEventListener("change", async event => {
    settings.startupRefreshEnabled = event.target.checked;
    await persistSettings();
    if (!settings.startupRefreshEnabled) {
      await chrome.alarms.clear("radar-local-startup-refresh");
      await chrome.storage.local.remove("radarLocalAutoQueue");
    }
    showToast(settings.startupRefreshEnabled ? "A fila automática começa no próximo início do navegador." : "Fila cancelada. Se houver uma leitura em curso, ela termina antes de parar.");
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
  document.getElementById("priceAlertSoundStyle").addEventListener("change", async event => { settings.priceAlertSoundStyle = event.target.value; await persistSettings(); showToast("Tipo de som salvo. Use “Testar som” para ouvir."); });
  document.getElementById("accentColor").addEventListener("input", event => { updateAccentPreview(event.target.value); });
  document.getElementById("accentColor").addEventListener("change", onAccentColorChange);
  document.getElementById("resetAccentColor").addEventListener("click", resetAccentColor);

}

function normalizePace(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(60, Math.max(0.5, Math.round(number * 2) / 2));
}

function previewPace(value) {
  const pace = normalizePace(value);
  if (pace == null) return;
  document.getElementById("startupRefreshPaceMinutes").value = String(pace);
  document.getElementById("startupRefreshPaceSlider").value = String(pace);
  updatePaceWarning(pace);
}

function updatePaceWarning(value) {
  const warning = document.getElementById("startupPaceWarning");
  const pace = Number(value);
  warning.classList.toggle("hidden", !Number.isFinite(pace) || pace >= 1);
}

async function savePace(value) {
  const pace = normalizePace(value);
  if (pace == null) {
    document.getElementById("startupRefreshPaceMinutes").value = String(settings.startupRefreshPaceMinutes);
    return updatePaceWarning(settings.startupRefreshPaceMinutes);
  }
  settings.startupRefreshPaceMinutes = pace;
  document.getElementById("startupRefreshPaceMinutes").value = String(pace);
  document.getElementById("startupRefreshPaceSlider").value = String(pace);
  updatePaceWarning(pace);
  await persistSettings();
  showToast(`Intervalo salvo: ${formatPace(pace)} entre páginas.`);
}

function formatPace(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)} segundos`;
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

function staleValueFromMinutes(minutes = settings.startupRefreshStaleMinutes, unit = settings.startupRefreshStaleUnit) {
  if (unit === "days") return Math.ceil(minutes / 1440);
  if (unit === "hours") return Math.ceil(minutes / 60);
  return Math.min(59, Math.max(1, minutes));
}

function syncStaleControls() {
  const slider = document.getElementById("startupRefreshStaleSlider");
  const input = document.getElementById("startupRefreshStaleValue");
  const unit = document.getElementById("startupRefreshStaleUnit");
  const unitName = settings.startupRefreshStaleUnit;
  const min = 1;
  const max = unitName === "days" ? 365 : unitName === "hours" ? 8760 : 59;
  const value = Math.min(max, Math.max(min, staleValueFromMinutes()));
  slider.min = input.min = String(min);
  slider.max = input.max = String(max);
  slider.step = input.step = "1";
  slider.value = input.value = String(value);
  unit.value = settings.startupRefreshStaleUnit;
}

function previewStaleThreshold(value) {
  const unit = settings.startupRefreshStaleUnit;
  const max = unit === "days" ? 365 : unit === "hours" ? 8760 : 59;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const normalized = Math.min(max, Math.max(1, Math.round(parsed)));
  document.getElementById("startupRefreshStaleValue").value = String(normalized);
  document.getElementById("startupRefreshStaleSlider").value = String(normalized);
}

function updateStaleSlider(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const max = settings.startupRefreshStaleUnit === "days" ? 365 : settings.startupRefreshStaleUnit === "hours" ? 8760 : 59;
  document.getElementById("startupRefreshStaleSlider").value = String(Math.min(max, Math.max(1, Math.round(parsed))));
}

async function saveStaleThreshold(value) {
  const unit = settings.startupRefreshStaleUnit;
  const max = unit === "days" ? 365 : unit === "hours" ? 8760 : 59;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return syncStaleControls();
  const normalized = Math.min(max, Math.max(1, Math.round(parsed)));
  const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
  settings.startupRefreshStaleMinutes = normalized * multiplier;
  syncStaleControls();
  await persistSettings();
  renderItems();
  showToast(`Itens verificados há mais de ${formatStaleThreshold()} entrarão na fila.`);
}

async function onStaleUnitChange(event) {
  settings.startupRefreshStaleUnit = ["minutes", "hours", "days"].includes(event.target.value) ? event.target.value : "hours";
  const value = staleValueFromMinutes(settings.startupRefreshStaleMinutes, settings.startupRefreshStaleUnit);
  const multiplier = settings.startupRefreshStaleUnit === "days" ? 1440 : settings.startupRefreshStaleUnit === "hours" ? 60 : 1;
  settings.startupRefreshStaleMinutes = value * multiplier;
  syncStaleControls();
  await persistSettings();
  renderItems();
}

function formatStaleThreshold() {
  const value = staleValueFromMinutes();
  const unit = settings.startupRefreshStaleUnit;
  const label = unit === "days" ? (value === 1 ? "dia" : "dias") : unit === "hours" ? (value === 1 ? "hora" : "horas") : (value === 1 ? "minuto" : "minutos");
  return `${value} ${label}`;
}

function updateAccentPreview(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  document.documentElement.style.setProperty("--accent", color);
  document.getElementById("accentColorValue").textContent = color.toUpperCase();
}

async function onAccentColorChange(event) {
  settings.accentColor = event.target.value.toLowerCase();
  updateAccentPreview(settings.accentColor);
  await persistSettings();
}

async function resetAccentColor() {
  settings.accentColor = DEFAULT_ACCENT_COLOR;
  document.getElementById("accentColor").value = DEFAULT_ACCENT_COLOR;
  updateAccentPreview(DEFAULT_ACCENT_COLOR);
  await persistSettings();
  showToast("A cor padrão do Radar Local foi restaurada.");
}

async function onPriceAlertsToggle(event) {
  const enabled = event.target.checked;
  if (enabled) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ["notifications"] }); } catch {}
    if (!granted) {
      event.target.checked = false;
      showToast("Permissão de notificações não concedida; alertas continuam desligados.", true);
      return;
    }
  }
  settings.priceAlertsEnabled = enabled;
  await persistSettings();
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Radar Local" });
  }
  showToast(enabled ? "Alertas de preço ativados." : "Alertas de preço desativados.");
}

async function onPriceAlertSoundToggle(event) {
  if (event.target.checked) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ["offscreen"] }); } catch {}
    if (!granted) {
      event.target.checked = false;
      showToast("Permissão de áudio em segundo plano não concedida; som continua desligado.", true);
      return;
    }
  }
  settings.priceAlertSoundEnabled = event.target.checked;
  await persistSettings();
  showToast(settings.priceAlertSoundEnabled ? "Som de alerta ativado." : "Som de alerta desativado.");
}

function onPriceAlertVolumeInput(event) {
  const volume = Math.min(100, Math.max(0, Math.round(Number(event.target.value) || 0)));
  document.getElementById("priceAlertVolumeValue").value = String(volume);
  document.getElementById("priceAlertVolume").style.setProperty("--range-progress", `${volume}%`);
}

function onPriceAlertVolumeValueInput(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) return;
  const volume = Math.round(value);
  document.getElementById("priceAlertVolume").value = String(volume);
  document.getElementById("priceAlertVolume").style.setProperty("--range-progress", `${volume}%`);
}

async function onPriceAlertVolumeChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) { event.target.value = String(settings.priceAlertVolume); return; }
  settings.priceAlertVolume = Math.min(100, Math.max(0, Math.round(value)));
  document.getElementById("priceAlertVolume").value = String(settings.priceAlertVolume);
  document.getElementById("priceAlertVolumeValue").value = String(settings.priceAlertVolume);
  document.getElementById("priceAlertVolume").style.setProperty("--range-progress", `${settings.priceAlertVolume}%`);
  await persistSettings();
}

async function onSoundCooldownChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) { event.target.value = String(settings.priceAlertCooldownMinutes); return; }
  settings.priceAlertCooldownMinutes = Math.min(1440, Math.max(0, Math.round(value)));
  event.target.value = String(settings.priceAlertCooldownMinutes);
  await persistSettings();
  showToast(settings.priceAlertCooldownMinutes ? `Novo beep do mesmo item após ${settings.priceAlertCooldownMinutes} min.` : "Beep permitido em todo novo alerta.");
}

async function testAlertSound() {
  const button = document.getElementById("testAlertSound");
  const status = document.getElementById("soundTestStatus");
  button.disabled = true;
  status.textContent = "Preparando áudio…";
  try {
    const granted = await chrome.permissions.request({ permissions: ["offscreen"] });
    if (!granted) throw new Error("Permissão de áudio não concedida.");
    settings.priceAlertVolume = Number(document.getElementById("priceAlertVolumeValue").value);
    await persistSettings();
    const response = await chrome.runtime.sendMessage({ type: "radar:test-sound", volume: settings.priceAlertVolume, style: settings.priceAlertSoundStyle });
    if (!response?.ok) throw new Error(response?.error || "O áudio não confirmou a reprodução.");
    status.textContent = settings.priceAlertVolume === 0 ? "Volume em 0%; aumente a barra para ouvir." : "Som reproduzido. Ajuste o volume e teste novamente.";
  } catch (error) {
    status.textContent = error.message || "Não foi possível tocar o som.";
  } finally {
    button.disabled = false;
  }
}

async function inspectCurrentTab() {
  let tab;
  if (floatingWindowMode) {
    const activeWindow = await chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }).catch(() => null);
    tab = activeWindow?.tabs?.find(candidate => candidate.active);
  } else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    document.getElementById("pageSummary").textContent = "Esta página não pode ser monitorada pelo Chrome.";
    document.getElementById("captureButton").disabled = true;
    return;
  }
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageInfo, args: [getSiteProfile(tab.url)?.selector || ""] });
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
  const profile = getSiteProfile(currentPage.url);
  document.getElementById("itemSelector").placeholder = profile ? `Perfil de ${profile.host} disponível` : "Ex.: [itemprop='price']";
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
  const productId = crypto.randomUUID();
  const folderId = document.getElementById("itemFolder").value;
  const product = { id: productId, name, folderId, target: target?.amount ?? null, createdAt: new Date().toISOString() };
  const entry = {
    id: crypto.randomUUID(), productId, productGroupId: productId, offerLabel: getSiteHost(currentPage.url), name, url: currentPage.url,
    faviconUrl: getSameOriginFaviconUrl(currentPage.url, currentPage.faviconUrl),
    regularPrice: currentPage.regularPrice || null,
    regularPriceObservedAt: currentPage.regularPrice ? new Date().toISOString() : null,
    folderId,
    target: target?.amount ?? null,
    selector: document.getElementById("itemSelector").value.trim(),
    price: price ? { ...price, checkedAt: new Date().toISOString(), source: "entrada manual", confidence: "confirmed" } : (currentPage.price ? { ...currentPage.price, checkedAt: new Date().toISOString() } : null),
    history: []
  };
  if (entry.price) entry.history.push({ amount: entry.price.amount, currency: entry.price.currency || "", checkedAt: entry.price.checkedAt, source: entry.price.source || "page" });
  data.products.unshift(product);
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
  fillFolderSelect(document.getElementById("newProductFolder"), settings.defaultFolderId, true);
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
  const activeProducts = data.products.filter(product => !product.archived);
  const archivedProducts = data.products.filter(product => product.archived);
  const activeIds = new Set(activeProducts.map(product => product.id));
  const total = data.items.filter(item => activeIds.has(item.productId || item.productGroupId)).length;
  const productCount = activeProducts.length;
  const summary = document.getElementById("itemsSummary");
  summary.textContent = `${productCount} ${productCount === 1 ? "produto" : "produtos"} · ${total} ${total === 1 ? "URL" : "URLs"} · ${data.folders.length} ${data.folders.length === 1 ? "pasta" : "pastas"}`;
  document.getElementById("emptyState").classList.toggle("hidden", productCount > 0 || data.folders.length > 0 || archivedProducts.length > 0);
  if (!productCount && !data.folders.length && !archivedProducts.length) { updateRefreshAllButton(); return; }

  const productsForFolder = folderId => activeProducts.filter(product => (product.folderId || NO_FOLDER) === folderId);
  const groups = data.folders.map((folder, index) => ({ id: folder.id, name: folder.name, color: getFolderColor(folder, index), products: productsForFolder(folder.id) }));
  const unfiled = productsForFolder(NO_FOLDER).concat(activeProducts.filter(product => !data.folders.some(folder => folder.id === product.folderId) && product.folderId !== NO_FOLDER));
  if (unfiled.length) groups.push({ id: NO_FOLDER, name: "Sem pasta", color: "#9b9b9b", products: unfiled });

  groups.sort((a, b) => b.products.length - a.products.length || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

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
    const count = document.createElement("span"); count.className = "folder-section-count"; count.textContent = String(groupData.products.length);
    count.title = `${groupData.products.length} ${groupData.products.length === 1 ? "produto" : "produtos"}`;
    copy.append(name, count); heading.append(dot, copy); section.append(heading);
    section.addEventListener("toggle", () => { if (section.open) collapsedGroups.delete(groupData.id); else collapsedGroups.add(groupData.id); });
    const cards = document.createElement("div"); cards.className = "folder-section-items";
    if (groupData.products.length) [...groupData.products]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .forEach(product => cards.append(buildProductCard(product, data.items.filter(item => (item.productId || item.productGroupId) === product.id), groupData.color)));
    else { const empty = document.createElement("div"); empty.className = "folder-empty"; empty.textContent = "Nenhum item nesta pasta ainda."; cards.append(empty); }
    section.append(cards); root.append(section);
  });
  if (archivedProducts.length) {
    const archive = document.createElement("details"); archive.className = "archive-section";
    const heading = document.createElement("summary"); heading.textContent = "Arquivados (" + archivedProducts.length + ")";
    const cards = document.createElement("div"); cards.className = "archive-list";
    [...archivedProducts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).forEach(product => cards.append(buildProductCard(product, data.items.filter(item => (item.productId || item.productGroupId) === product.id), "#777777", true)));
    archive.append(heading, cards); root.append(archive);
  }
  updateRefreshAllButton();
}

function buildProductCard(product, offers, folderColor, archived = false) {
  const card = document.createElement("details"); card.className = "product-card"; card.open = expandedProducts.has(product.id);
  card.style.setProperty("--folder-color", folderColor);
  const summary = document.createElement("summary"); summary.className = "product-card-summary";
  const arrow = document.createElement("span"); arrow.className = "product-arrow"; arrow.setAttribute("aria-hidden", "true");
  const identity = document.createElement("span"); identity.className = "product-summary-identity";
  const titleWrap = document.createElement("span"); titleWrap.className = "product-title-wrap";
  const title = document.createElement("strong"); title.className = "product-title"; title.textContent = product.name;
  const editName = document.createElement("button"); editName.type = "button"; editName.className = "product-edit-button"; editName.title = "Editar nome do produto"; editName.setAttribute("aria-label", `Editar nome de ${product.name}`);
  editName.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 2.1 3 3M2 14l3.2-.7L13.7 4.8a1.6 1.6 0 0 0-2.3-2.3L2.9 11 2 14Z"/></svg>';
  editName.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); startProductRename(titleWrap, product, offers); });
  titleWrap.append(title, editName);
  if (archived && product.archiveReason === "purchased") { const purchased = document.createElement("small"); purchased.className = "purchased-badge"; purchased.textContent = "COMPRADO"; titleWrap.append(purchased); }
  const priced = offers.filter(item => isItemFresh(item) && item.availability !== "out-of-stock" && Number.isFinite(Number(item.price?.amount)) && Number(item.price.amount) > 0);
  const firstCurrency = priced.find(item => item.price?.currency)?.price.currency || "";
  const comparable = priced.filter(item => !firstCurrency || !item.price.currency || item.price.currency === firstCurrency);
  comparable.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
  const best = comparable[0];
  const known = offers.filter(item => item.price && Number(item.price.amount) > 0 && item.availability !== "out-of-stock").sort((a, b) => Number(a.price.amount) - Number(b.price.amount))[0];
  const summaryOffer = best || known;
  const source = document.createElement("span"); source.className = "product-best-source";
  if (summaryOffer) {
    const sourceName = summaryOffer.offerLabel || getSiteHost(summaryOffer.url);
    source.append(document.createTextNode(offers.length + (offers.length === 1 ? " loja · " : " lojas · ") + (best ? "menor atual " : "último preço conhecido ")));
    const sourceLink = document.createElement("a"); sourceLink.href = summaryOffer.url; sourceLink.target = "_blank"; sourceLink.rel = "noopener noreferrer"; sourceLink.className = "best-source-link"; sourceLink.title = `Abrir oferta em ${sourceName}`;
    sourceLink.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); chrome.tabs.create({ url: summaryOffer.url }); });
    appendStoreIcon(sourceLink, summaryOffer);
    sourceLink.append(document.createTextNode(sourceName));
    source.append(sourceLink);
  } else source.textContent = `${offers.length} ${offers.length === 1 ? "loja" : "lojas"} · ${offers.length ? "preço ainda não lido" : "adicione a primeira URL"}`;
  const priceWrap = document.createElement("span"); priceWrap.className = "product-summary-price-wrap";
  const price = document.createElement("span"); price.className = "product-summary-price"; price.textContent = summaryOffer ? formatPrice(summaryOffer.price.amount, summaryOffer.price.currency) : "—"; priceWrap.append(price);
  if (summaryOffer && !best) { const status = document.createElement("small"); status.className = "freshness-badge stale"; status.textContent = summaryOffer.lastCheckError ? "falha recente" : "desatualizado"; priceWrap.append(status); }
  const historyCompare = best ? getHistoricalLow(best) : null;
  if (historyCompare) {
    const badge = document.createElement("small"); badge.className = historyCompare.isLow ? "product-low-badge" : "product-above-low-badge";
    badge.textContent = historyCompare.isLow ? "MENOR HISTÓRICO" : `+${historyCompare.abovePercent}% do menor`;
    badge.title = `Comparação com o menor registrado nesta loja (${best.offerLabel || getSiteHost(best.url)}): ${formatPrice(historyCompare.minimum, best.price.currency)}.`;
    priceWrap.append(badge);
  }
  identity.append(titleWrap, source); summary.append(arrow, identity, priceWrap); card.append(summary);
  card.addEventListener("toggle", () => {
    if (card.open) { expandedProducts.add(product.id); void cacheFavicons(offers); }
    else expandedProducts.delete(product.id);
  });

  const body = document.createElement("div"); body.className = "product-card-body";
  body.append(buildProductSettings(product, offers, archived));
  const offerList = document.createElement("div"); offerList.className = "offer-list";
  const sortedOffers = [...offers].sort((a, b) => {
    const aAvailable = a.availability === "out-of-stock" ? 1 : 0, bAvailable = b.availability === "out-of-stock" ? 1 : 0;
    if (aAvailable !== bAvailable) return aAvailable - bAvailable;
    const aFresh = isItemFresh(a) ? 0 : 1, bFresh = isItemFresh(b) ? 0 : 1;
    if (aFresh !== bFresh) return aFresh - bFresh;
    const aPrice = Number(a.price?.amount), bPrice = Number(b.price?.amount);
    const aValid = Number.isFinite(aPrice) && aPrice > 0, bValid = Number.isFinite(bPrice) && bPrice > 0;
    if (aValid && bValid) return aPrice - bPrice;
    return aValid ? -1 : bValid ? 1 : (a.offerLabel || getSiteHost(a.url)).localeCompare(b.offerLabel || getSiteHost(b.url), "pt-BR");
  });
  sortedOffers.forEach(item => offerList.append(buildOfferAccordion(item, folderColor)));
  if (offers.length) body.append(offerList);
  body.append(buildAddOfferDetails(product));
  card.append(body);
  return card;
}

function buildProductSettings(product, offers, archived = false) {
  const row = document.createElement("div"); row.className = "product-settings";
  const targetLabel = document.createElement("label"); targetLabel.textContent = "Preço-alvo do produto";
  const target = document.createElement("input"); target.inputMode = "decimal"; target.placeholder = "Opcional"; target.value = product.target ?? "";
  target.addEventListener("change", async () => {
    product.target = parseUserPrice(target.value)?.amount ?? null;
    offers.forEach(item => { item.target = product.target; });
    await persist(); renderItems();
  });
  targetLabel.append(target);
  const folderLabel = document.createElement("label"); folderLabel.textContent = "Pasta do produto";
  const folder = document.createElement("select"); fillFolderSelect(folder, product.folderId || NO_FOLDER, true);
  folder.addEventListener("change", async () => {
    product.folderId = folder.value;
    offers.forEach(item => { item.folderId = product.folderId; });
    await persist(); renderItems();
  });
  folderLabel.append(folder);
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "icon-action danger delete-product"; remove.textContent = "×"; remove.title = "Excluir produto"; remove.setAttribute("aria-label", "Excluir produto");
  remove.addEventListener("click", async () => {
    const offerCount = offers.length ? `${offers.length} ${offers.length === 1 ? "URL" : "URLs"}` : "nenhuma URL";
    if (!confirm(`Excluir o produto “${product.name}” e ${offerCount}, incluindo os históricos associados?`)) return;
    data.products = data.products.filter(row => row.id !== product.id);
    data.items = data.items.filter(item => (item.productId || item.productGroupId) !== product.id);
    expandedProducts.delete(product.id); await persist(); renderAll();
  });
  const mute = document.createElement("label"); mute.className = "product-mute-toggle";
  const muteInput = document.createElement("input"); muteInput.type = "checkbox"; muteInput.checked = product.alertsMuted === true;
  muteInput.addEventListener("change", async () => { product.alertsMuted = muteInput.checked; await persist(); });
  mute.append(muteInput, document.createTextNode("Silenciar alertas deste produto"));
  const archiveButton = document.createElement("button"); archiveButton.type = "button"; archiveButton.className = "secondary archive-product"; archiveButton.textContent = archived ? "Restaurar" : "✓ Comprado"; archiveButton.title = archived ? "Restaurar produto aos monitorados" : "Marcar como comprado e arquivar";
  archiveButton.addEventListener("click", async () => { product.archived = !archived; product.archiveReason = archived ? "" : "purchased"; product.archivedAt = archived ? null : new Date().toISOString(); await persist(); renderItems(); showToast(archived ? "Produto restaurado." : "Produto marcado como comprado e arquivado com histórico preservado."); });
  const actions = document.createElement("div"); actions.className = "product-settings-actions"; actions.append(mute, archiveButton, remove);
  row.append(targetLabel, folderLabel, actions); return row;
}

function startProductRename(container, product, offers) {
  const editor = document.createElement("span"); editor.className = "product-rename-editor";
  const input = document.createElement("input"); input.type = "text"; input.maxLength = 140; input.value = product.name; input.setAttribute("aria-label", "Nome do produto");
  const finish = async save => {
    if (save) {
      const value = input.value.trim();
      if (!value) { input.focus(); return showToast("O nome do produto não pode ficar vazio.", true); }
      product.name = value; offers.forEach(item => { item.name = value; });
      await persist(); showToast("Nome do produto atualizado.");
    }
    renderItems();
  };
  const save = document.createElement("button"); save.type = "button"; save.className = "rename-action rename-save"; save.textContent = "✓"; save.title = "Salvar nome"; save.setAttribute("aria-label", "Salvar nome do produto");
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "rename-action"; cancel.textContent = "×"; cancel.title = "Cancelar edição"; cancel.setAttribute("aria-label", "Cancelar edição do nome");
  save.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); void finish(true); });
  cancel.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); void finish(false); });
  editor.addEventListener("click", event => event.stopPropagation());
  editor.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); void finish(true); }
    if (event.key === "Escape") { event.preventDefault(); void finish(false); }
  });
  editor.append(input, save, cancel); container.replaceChildren(editor); input.focus(); input.select();
}

function buildOfferAccordion(item, folderColor) {
  const details = document.createElement("details"); details.className = "offer-accordion"; details.open = expandedOffers.has(item.id);
  const summary = document.createElement("summary"); summary.className = "offer-summary";
  const arrow = document.createElement("span"); arrow.className = "offer-arrow"; arrow.setAttribute("aria-hidden", "true");
  const store = document.createElement("strong"); store.className = "offer-store"; store.textContent = item.offerLabel || getSiteHost(item.url);
  const renameStore = document.createElement("button"); renameStore.type = "button"; renameStore.className = "product-edit-button offer-edit-button"; renameStore.title = "Editar nome desta loja"; renameStore.setAttribute("aria-label", "Editar nome desta loja");
  renameStore.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 2.1 3 3M2 14l3.2-.7L13.7 4.8a1.6 1.6 0 0 0-2.3-2.3L2.9 11 2 14Z"/></svg>';
  renameStore.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); startOfferRename(store.parentElement, item); });
  const checked = document.createElement("small"); checked.className = "offer-checked"; checked.textContent = item.price?.checkedAt ? `Verificado ${formatDate(item.price.checkedAt)}` : "Ainda não verificado";
  const price = document.createElement("strong"); price.className = "offer-price"; price.textContent = item.price ? formatPrice(item.price.amount, item.price.currency) : "Sem preço";
  const correctPrice = document.createElement("button"); correctPrice.type = "button"; correctPrice.className = "offer-price-edit"; correctPrice.title = "Corrigir preço manualmente"; correctPrice.setAttribute("aria-label", correctPrice.title);
  correctPrice.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 2.1 3 3M2 14l3.2-.7L13.7 4.8a1.6 1.6 0 0 0-2.3-2.3L2.9 11 2 14Z"/></svg>';
  correctPrice.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); details.querySelector(".price-correct")?.click(); });
  const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = "offer-open-link"; link.textContent = "↗"; link.title = `Abrir ${item.offerLabel || getSiteHost(item.url)}`; link.setAttribute("aria-label", link.title);
  link.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); chrome.tabs.create({ url: item.url }); });
  const left = document.createElement("span"); left.className = "offer-summary-copy";
  const storeLine = document.createElement("span"); storeLine.className = "offer-summary-storeline"; appendStoreIcon(storeLine, item); storeLine.append(store, renameStore);
  const freshness = document.createElement("small"); freshness.className = "freshness-badge " + (item.lastCheckError ? "failed" : isItemStale(item) ? "stale" : item.price ? "fresh" : "unknown");
  freshness.textContent = item.lastCheckError ? "falha · último preço mantido" : isItemStale(item) ? (item.price ? "preço desatualizado" : "sem preço verificado") : "preço recente";
  left.append(storeLine, checked, freshness);
  details.addEventListener("toggle", () => { if (details.open) expandedOffers.add(item.id); else expandedOffers.delete(item.id); });
  if (item.availability !== "unknown") { const stock = document.createElement("small"); stock.className = "stock-badge " + (item.availability === "out-of-stock" ? "out" : "in"); stock.textContent = item.availability === "out-of-stock" ? "esgotado" : "disponível"; left.append(stock); }
  summary.append(arrow, left, price, correctPrice, link); details.append(summary, buildItemCard(item, folderColor, { asOffer: true })); return details;
}

function startOfferRename(container, item) {
  const editor = document.createElement("span"); editor.className = "product-rename-editor";
  const input = document.createElement("input"); input.type = "text"; input.maxLength = 80; input.value = item.offerLabel || getSiteHost(item.url); input.setAttribute("aria-label", "Nome da loja ou página");
  const finish = async save => { if (save) { const value = input.value.trim(); if (!value) return showToast("O nome da loja não pode ficar vazio.", true); item.offerLabel = value; await persist(); showToast("Nome da loja atualizado."); } renderItems(); };
  const save = document.createElement("button"); save.type = "button"; save.className = "rename-action rename-save"; save.textContent = "✓"; save.title = "Salvar nome da loja";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "rename-action"; cancel.textContent = "×"; cancel.title = "Cancelar edição";
  save.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); void finish(true); }); cancel.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); void finish(false); });
  editor.addEventListener("click", event => event.stopPropagation()); editor.addEventListener("keydown", event => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); void finish(true); } if (event.key === "Escape") { event.preventDefault(); void finish(false); } });
  editor.append(input, save, cancel); container.replaceChildren(editor); input.focus(); input.select();
}

function buildAddOfferDetails(product) {
  const details = document.createElement("details"); details.className = "add-offer-details";
  details.open = !data.items.some(item => (item.productId || item.productGroupId) === product.id);
  const summary = document.createElement("summary"); summary.textContent = "＋ Adicionar URL";
  const form = document.createElement("form"); form.className = "add-offer-form";
  const url = document.createElement("input"); url.type = "url"; url.required = true; url.placeholder = "https://loja.com/produto"; url.setAttribute("aria-label", "URL do produto em outra loja");
  const label = document.createElement("input"); label.maxLength = 80; label.placeholder = "Nome da loja (opcional)"; label.setAttribute("aria-label", "Nome da loja");
  const actions = document.createElement("div"); actions.className = "row-actions";
  const save = document.createElement("button"); save.type = "submit"; save.className = "primary"; save.textContent = "Adicionar loja";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "secondary"; cancel.textContent = "Cancelar";
  cancel.addEventListener("click", () => { details.open = false; form.reset(); });
  actions.append(save, cancel); form.append(url, label, actions);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    let normalizedUrl;
    try { normalizedUrl = new URL(url.value.trim()); } catch { return showToast("Informe uma URL válida.", true); }
    if (!/^https?:$/.test(normalizedUrl.protocol)) return showToast("A URL precisa começar com http:// ou https://.", true);
    if (data.items.some(item => normalizeItemUrl(item.url) === normalizeItemUrl(normalizedUrl.href))) return showToast("Essa URL já está monitorada.", true);
    const item = {
      id: crypto.randomUUID(), productId: product.id, productGroupId: product.id, offerLabel: label.value.trim() || normalizedUrl.hostname,
      name: product.name, url: normalizedUrl.href, folderId: product.folderId || NO_FOLDER,
      target: product.target ?? null, selector: "", regularPrice: null, price: null, history: []
    };
    data.items.push(item);
    expandedProducts.add(product.id); expandedOffers.delete(item.id);
    await persist(); renderAll();
    showToast(`URL adicionada a “${item.name}”. Atualize para ler o preço dessa loja.`);
  });
  details.append(summary, form);
  return details;
}

function createProduct(event) {
  event.preventDefault();
  const nameInput = document.getElementById("newProductName");
  const name = nameInput.value.trim();
  if (!name) return showToast("Informe o nome do produto.", true);
  const target = parseUserPrice(document.getElementById("newProductTarget").value);
  const product = { id: crypto.randomUUID(), name, folderId: document.getElementById("newProductFolder").value || NO_FOLDER, target: target?.amount ?? null, createdAt: new Date().toISOString() };
  data.products.unshift(product); expandedProducts.add(product.id);
  nameInput.value = ""; document.getElementById("newProductTarget").value = "";
  document.getElementById("newProductForm").classList.add("hidden");
  persist().then(() => { renderAll(); showToast(`Produto “${name}” criado. Adicione as URLs das lojas.`); });
}

function updateRefreshAllButton() {
  const button = document.getElementById("refreshAll");
  if (!button) return;
  const eligible = data.items.filter(item => !data.products.find(product => product.id === (item.productId || item.productGroupId))?.archived);
  button.disabled = isBatchUpdating || eligible.length === 0;
  button.textContent = isBatchUpdating ? button.textContent : "Atualizar tudo";
  button.title = eligible.length ? `Atualizar as ${eligible.length} URLs ativas` : "Adicione um item para habilitar a atualização";
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

function getHistoricalLow(item) {
  const points = Array.isArray(item.history) ? item.history : [];
  const current = item.price;
  if (!current || !Number.isFinite(Number(current.amount)) || Number(current.amount) <= 0 || points.length < 2) return null;
  const sameCurrency = points.filter(point => Number.isFinite(Number(point.amount)) && Number(point.amount) > 0 && (!current.currency || !point.currency || point.currency === current.currency));
  if (!sameCurrency.length) return null;
  const minimum = Math.min(...sameCurrency.map(point => Number(point.amount)));
  const currentAmount = Number(current.amount);
  const isLow = currentAmount <= minimum * 1.000001;
  return { minimum, isLow, abovePercent: isLow ? 0 : Math.round((currentAmount / minimum - 1) * 100) };
}

function getIncreasePercent(item) {
  const current = item.price;
  if (!current || !Number.isFinite(Number(current.amount)) || Number(current.amount) <= 0) return null;
  const currentTime = Date.parse(current.checkedAt || "");
  const history = Array.isArray(item.history) ? item.history : [];
  let previous = null;
  if (Number.isFinite(currentTime)) {
    previous = [...history].reverse().find(point => {
      const pointTime = Date.parse(point.checkedAt || "");
      return Number.isFinite(pointTime) && pointTime < currentTime;
    }) || null;
  }
  if (!previous && history.length > 1) {
    const latest = history[history.length - 1];
    if (latest.checkedAt !== current.checkedAt || Number(latest.amount) !== Number(current.amount)) previous = latest;
    else previous = history[history.length - 2];
  }
  if (!previous || !Number.isFinite(Number(previous.amount)) || Number(previous.amount) <= 0) return null;
  if (current.currency && previous.currency && current.currency !== previous.currency) return null;
  const difference = (Number(current.amount) / Number(previous.amount) - 1) * 100;
  return difference > 0.05 ? Math.round(difference * 10) / 10 : null;
}

function buildItemCard(item, folderColor = "#9b9b9b", options = {}) {
  const card = document.createElement("article"); card.className = "item-card" + (options.asOffer ? " offer-detail-card" : ""); card.style.setProperty("--folder-color", folderColor);
  const top = document.createElement("div"); top.className = "item-top";
  const name = document.createElement("div"); name.className = "item-name"; name.textContent = options.asOffer ? (item.offerLabel || getSiteHost(item.url)) : item.name; name.title = options.asOffer ? item.name : item.name;
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
    item.price = { ...parsed, currency, checkedAt, source: "correção manual", confidence: "confirmed" };
    delete item.pendingPriceCandidate;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: parsed.amount, currency, checkedAt, source: "correção manual", confidence: "confirmed" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    await persist(); renderItems(); showToast("Preço corrigido manualmente.");
  });
  const discountPercent = getDiscountPercent(item);
  priceBlock.append(price);
  if (discountPercent !== null) {
    const badge = document.createElement("span"); badge.className = "discount-badge"; badge.textContent = `${discountPercent}% OFF`;
    const observedAt = item.regularPriceObservedAt ? ` · detectado em ${formatDate(item.regularPriceObservedAt)}` : "";
    badge.title = item.regularPrice?.amount ? `Comparado ao último preço normal identificado: ${formatPrice(item.regularPrice.amount, item.regularPrice.currency || item.price?.currency)}${observedAt}` : "Desconto calculado sobre o preço normal";
    priceBlock.append(badge);
  }
  const historicalLow = getHistoricalLow(item);
  if (historicalLow) {
    const badge = document.createElement("span"); badge.className = historicalLow.isLow ? "low-price-badge" : "above-low-badge";
    badge.textContent = historicalLow.isLow ? "MENOR REGISTRADO" : `+${historicalLow.abovePercent}% do menor`;
    badge.title = `Comparação com o menor preço deste histórico local: ${formatPrice(historicalLow.minimum, item.price?.currency)}. Não representa desconto sobre o preço normal.`;
    priceBlock.append(badge);
  }
  const increasePercent = getIncreasePercent(item);
  if (increasePercent !== null) {
    const badge = document.createElement("span"); badge.className = "increase-badge"; badge.textContent = `↑ ${increasePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    const previousPoint = item.history?.filter(point => Number.isFinite(Number(point.amount))).slice(-2)[0];
    badge.title = previousPoint ? `Aumento em relação à verificação anterior: ${formatPrice(previousPoint.amount, previousPoint.currency || item.price?.currency)}` : "Aumento em relação ao registro anterior";
    priceBlock.append(badge);
  }
  priceBlock.append(correctPrice);
  top.append(name, priceBlock); card.append(top);
  const link = document.createElement("a"); link.className = "item-url"; link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = item.url; link.title = item.url; card.append(link);
  const meta = document.createElement("div"); meta.className = "item-meta";
  const last = item.price?.checkedAt ? `Verificado ${formatDate(item.price.checkedAt)}` : "Ainda não verificado";
  meta.textContent = `${last}${!options.asOffer && item.target != null ? ` · alvo ${formatPrice(item.target, item.price?.currency)}` : ""}`;
  if (item.target != null && item.price && item.price.amount <= item.target) meta.classList.add("drop");
  card.append(meta);
  if (settings.priceSourceEnabled && item.price?.source) {
    const provenance = document.createElement("div"); provenance.className = "price-provenance";
    const confidence = item.price.confidence === "corroborated" ? `corroborado por ${item.price.corroboratingSources?.length || 2} fontes` : item.price.confidence === "high" ? "alta" : item.price.confidence === "medium" ? "média" : item.price.confidence === "low" ? "baixa" : item.price.confidence === "confirmed" ? "confirmada manualmente" : "não informada";
    provenance.textContent = `Origem: ${item.price.source} · confiança ${confidence}`;
    card.append(provenance);
  }
  if (item.pendingPriceCandidate) {
    const candidate = item.pendingPriceCandidate;
    const review = document.createElement("div"); review.className = "price-review";
    const message = document.createElement("div"); message.textContent = `Variação de ${candidate.changePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% detectada. Candidato: ${formatPrice(candidate.amount, candidate.currency)}. O preço salvo foi mantido.`;
    const actions = document.createElement("div"); actions.className = "row-actions";
    const accept = document.createElement("button"); accept.className = "primary"; accept.type = "button"; accept.textContent = "Aceitar preço";
    accept.addEventListener("click", () => acceptPriceCandidate(item));
    const discard = document.createElement("button"); discard.className = "secondary"; discard.type = "button"; discard.textContent = "Descartar";
    discard.addEventListener("click", async () => { delete item.pendingPriceCandidate; await persist(); renderItems(); showToast("Preço candidato descartado."); });
    actions.append(accept, discard); review.append(message, actions); card.append(review);
  }
  if (item.lastCheckError) {
    const error = document.createElement("div"); error.className = "item-meta check-error";
    error.textContent = "Falha na verificação; último preço mantido.";
    error.title = `${item.lastCheckError}${item.lastCheckErrorAt ? ` · ${formatDate(item.lastCheckErrorAt)}` : ""}`;
    card.append(error);
  }
  const controls = document.createElement("div"); controls.className = "item-controls";
  let targetLabel = null, folderLabel = null;
  if (!options.asOffer) {
    targetLabel = document.createElement("label"); targetLabel.textContent = "Preço-alvo";
    const targetInput = document.createElement("input"); targetInput.inputMode = "decimal"; targetInput.placeholder = "Opcional"; targetInput.value = item.target ?? "";
    targetInput.addEventListener("change", async () => { const value = parseUserPrice(targetInput.value)?.amount ?? null; getProductSiblings(item).forEach(sibling => { sibling.target = value; }); await persist(); renderItems(); });
    targetLabel.append(targetInput);
    folderLabel = document.createElement("label"); folderLabel.textContent = "Pasta";
    const folderSelect = document.createElement("select"); fillFolderSelect(folderSelect, item.folderId || NO_FOLDER, true);
    folderSelect.addEventListener("change", async () => { getProductSiblings(item).forEach(sibling => { sibling.folderId = folderSelect.value; }); await persist(); renderAll(); }); folderLabel.append(folderSelect);
  }
  const refresh = document.createElement("button"); refresh.className = "primary item-refresh" + (isBatchUpdating ? " is-loading" : ""); refresh.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 8A6.3 6.3 0 0 0 5.1 5.2L3.5 7M3.5 7V3.8M3.5 7h3.2M3.8 12A6.3 6.3 0 0 0 14.9 14.8l1.6-1.8m0 0v3.2m0-3.2h-3.2"/></svg>'; refresh.title = isBatchUpdating ? "Atualização em andamento" : "Atualizar preço"; refresh.setAttribute("aria-label", refresh.title); refresh.disabled = isBatchUpdating;
  refresh.addEventListener("click", () => refreshPrice(item, refresh));
  const remove = document.createElement("button"); remove.className = "icon-action danger"; remove.textContent = "×"; remove.title = "Remover item"; remove.setAttribute("aria-label", `Remover ${item.name}`);
  remove.addEventListener("click", async () => { if (!confirm(`Remover a oferta “${item.offerLabel || getSiteHost(item.url)}” e seu histórico local?`)) return; data.items = data.items.filter(row => row.id !== item.id); await persist(); renderAll(); });
  if (targetLabel) controls.append(targetLabel, folderLabel);
  if (options.asOffer) {
    const preferences = document.createElement("div"); preferences.className = "offer-preferences";
    const stockLabel = document.createElement("label"); stockLabel.className = "stock-select-label"; stockLabel.append(document.createTextNode("Estoque"));
    const stock = document.createElement("select"); stock.className = "stock-select";
    [["unknown", "Não informada"], ["in-stock", "Disponível"], ["out-of-stock", "Esgotado"]].forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; stock.append(option); });
    stock.value = item.availability || "unknown"; stock.addEventListener("change", async () => { item.availability = stock.value; await persist(); renderItems(); });
    stockLabel.append(stock);
    const mute = document.createElement("label"); mute.className = "offer-mute-toggle";
    const muteInput = document.createElement("input"); muteInput.type = "checkbox"; muteInput.checked = item.alertsMuted === true; muteInput.addEventListener("change", async () => { item.alertsMuted = muteInput.checked; await persist(); });
    mute.title = "Silenciar alertas desta loja";
    mute.append(muteInput, document.createTextNode("Silenciar loja"));
    preferences.append(stockLabel, mute);
    const row = document.createElement("div"); row.className = "offer-detail-actions"; row.append(refresh, remove);
    card.append(preferences, row);
  } else controls.append(refresh, remove);
  if (!options.asOffer) card.append(controls);
  const history = document.createElement("details"); history.className = "history";
  const summary = document.createElement("summary"); summary.textContent = `Histórico (${item.history?.length || 0} registros)`; history.append(summary);
  history.addEventListener("toggle", () => {
    if (!history.open || !settings.priceHistoryChartEnabled || history.querySelector(".history-chart")) return;
    const chart = buildHistoryChart(item);
    if (chart) history.insertBefore(chart, history.children[1] || null);
  });
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
  selectorLabel.append(selectorInput); selectorDetails.append(selectorSummary, selectorLabel);
  const profileHint = document.createElement("small"); profileHint.className = "selector-profile-hint";
  const siteProfile = getSiteProfile(item.url);
  profileHint.textContent = !item.selector && siteProfile ? `Usando perfil de ${siteProfile.host}.` : `Domínio: ${getSiteHost(item.url) || "desconhecido"}.`;
  const saveProfile = document.createElement("button"); saveProfile.type = "button"; saveProfile.className = "secondary save-profile-button"; saveProfile.textContent = "Salvar seletor como perfil do site";
  saveProfile.addEventListener("click", async () => {
    const selector = selectorInput.value.trim();
    if (!selector) return showToast("Informe primeiro um seletor CSS.", true);
    const host = getSiteHost(item.url);
    const profile = data.siteProfiles.find(row => row.host === host);
    if (profile) { profile.selector = selector; profile.updatedAt = new Date().toISOString(); }
    else data.siteProfiles.push({ host, selector, updatedAt: new Date().toISOString() });
    await persist(); renderSettings(); showToast(`Seletor salvo para ${host}; produtos podem reutilizá-lo.`);
  });
  selectorDetails.append(profileHint, saveProfile); card.append(selectorDetails);
  return card;
}

async function acceptPriceCandidate(item) {
  const candidate = item.pendingPriceCandidate;
  if (!candidate) return;
  const prior = item.price;
  const alert = evaluatePriceAlert(item, candidate, settings);
  item.price = { amount: candidate.amount, currency: candidate.currency || "", checkedAt: candidate.checkedAt, source: candidate.source, confidence: candidate.confidence, corroboratingSources: candidate.corroboratingSources || [] };
  if (candidate.regularPrice && Number(candidate.regularPrice.amount) > Number(candidate.amount) && (!candidate.regularPrice.currency || !candidate.currency || candidate.regularPrice.currency === candidate.currency)) {
    item.regularPrice = candidate.regularPrice;
    item.regularPriceObservedAt = candidate.checkedAt;
  }
  item.history = Array.isArray(item.history) ? item.history : [];
  item.history.push({ amount: candidate.amount, currency: candidate.currency || "", checkedAt: candidate.checkedAt, source: candidate.source || "página", confidence: candidate.confidence || "unknown" });
  if (item.history.length > 300) item.history = item.history.slice(-300);
  delete item.pendingPriceCandidate;
  delete item.lastCheckError;
  delete item.lastCheckErrorAt;
  await persist(); renderItems();
  if ((settings.priceAlertsEnabled || settings.priceAlertSoundEnabled) && alert) sendPriceAlert({ ...alert, itemId: item.id, itemName: item.name, price: formatPrice(candidate.amount, candidate.currency) });
  showToast(`Preço candidato aceito: ${formatPrice(candidate.amount, candidate.currency)}${prior ? ` (antes ${formatPrice(prior.amount, prior.currency)})` : ""}.`);
}

function buildHistoryChart(item) {
  const points = (item.history || []).filter(point => Number.isFinite(Number(point.amount)) && Number(point.amount) > 0).slice(-60);
  if (points.length < 2) return null;
  const wrap = document.createElement("div"); wrap.className = "history-chart";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 300 72"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `Histórico recente de ${item.name}`);
  const values = points.map(point => Number(point.amount));
  const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || Math.max(max * 0.05, 1);
  const coords = values.map((value, index) => ({ x: 5 + index * 290 / (values.length - 1), y: 62 - (value - min) / spread * 52 }));
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "));
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "var(--accent)"); path.setAttribute("stroke-width", "2"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  const last = coords.at(-1); const dot = document.createElementNS(svg.namespaceURI, "circle"); dot.setAttribute("cx", last.x); dot.setAttribute("cy", last.y); dot.setAttribute("r", "3"); dot.setAttribute("fill", "var(--accent)"); svg.append(dot);
  const caption = document.createElement("div"); caption.className = "chart-caption"; caption.textContent = `Menor nos pontos exibidos: ${formatPrice(min, points.find(point => Number(point.amount) === min)?.currency || item.price?.currency)} · ${points.length} registros recentes`;
  wrap.append(svg, caption); return wrap;
}

async function refreshPrice(item, button, options = {}) {
  if (button) { button.disabled = true; button.classList.add("is-loading"); button.title = "Lendo preço…"; button.setAttribute("aria-label", "Lendo preço"); }
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
    let extractedFaviconUrl = "";
    for (let attempt = 0; attempt < 4 && !found; attempt += 1) {
      if (attempt) await delay(1500);
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageInfo, args: [resolveItemSelector(item)] });
      found = result?.result?.price || null;
      extractedRegularPrice = result?.result?.regularPrice || null;
      extractedFaviconUrl = result?.result?.faviconUrl || extractedFaviconUrl;
    }
    if (!found) throw new Error("Preço não encontrado. Configure um seletor CSS ou informe o valor manualmente.");
    const checkedAt = new Date().toISOString();
    const prior = item.price;
    const anomaly = settings.priceAnomalyGuardEnabled ? isSuspiciousPriceChange(prior, found, settings.priceAnomalyThresholdPercent) : null;
    if (anomaly) {
      item.pendingPriceCandidate = { ...found, regularPrice: extractedRegularPrice, checkedAt, changePercent: anomaly.changePercent, direction: anomaly.direction };
      delete item.lastCheckError;
      delete item.lastCheckErrorAt;
      await persist();
      if (options.rerender !== false) renderItems();
      if (!options.suppressToast) showToast(`Variação de ${anomaly.changePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% guardada para revisão. O preço anterior foi mantido.`, true);
      return { ok: true, reviewRequired: true, price: found };
    }
    const priceDropped = Boolean(prior && (!prior.currency || !found.currency || prior.currency === found.currency) && found.amount < prior.amount);
    const alert = evaluatePriceAlert(item, found, settings);
    item.price = { ...found, checkedAt };
    item.faviconUrl = getSameOriginFaviconUrl(item.url, extractedFaviconUrl) || item.faviconUrl || "";
    if (extractedRegularPrice && Number(extractedRegularPrice.amount) > Number(found.amount) && (!extractedRegularPrice.currency || !found.currency || extractedRegularPrice.currency === found.currency)) {
      item.regularPrice = extractedRegularPrice;
      item.regularPriceObservedAt = checkedAt;
    }
    delete item.pendingPriceCandidate;
    delete item.lastCheckError;
    delete item.lastCheckErrorAt;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: found.amount, currency: found.currency || "", checkedAt, source: found.source || "página", confidence: found.confidence || "unknown" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    await persist();
    if (options.rerender !== false) renderItems();
    const alertPayload = alert
      ? { ...alert, itemId: item.id, itemName: item.offerLabel ? `${item.name} · ${item.offerLabel}` : item.name, price: formatPrice(found.amount, found.currency) }
      : null;
    if ((settings.priceAlertsEnabled || settings.priceAlertSoundEnabled) && alertPayload && !options.suppressAlerts) sendPriceAlert(alertPayload);
    if (!options.suppressToast) showToast(`${formatPrice(found.amount, found.currency)} registrado${priceDropped ? " · preço caiu" : ""}${alert?.kind === "target" ? " · atingiu o alvo" : alert?.kind === "new-low" ? " · novo menor preço" : ""}.`);
    return { ok: true, price: found, alert: alertPayload };
  } catch (error) {
    item.lastCheckError = error.message || "Falha na verificação.";
    item.lastCheckErrorAt = new Date().toISOString();
    await persist().catch(() => {});
    if (options.rerender !== false) renderItems();
    if (!options.suppressToast) showToast(error.message || "Não foi possível verificar o preço.", true);
    return { ok: false, error: error.message || "Falha na verificação." };
  } finally {
    if (tabId) { try { await chrome.tabs.remove(tabId); } catch {} }
    if (button) { button.disabled = false; button.classList.remove("is-loading"); button.title = "Atualizar preço"; button.setAttribute("aria-label", "Atualizar preço"); }
  }
}

function sendPriceAlert(alert) {
  if (getQuietHoursActive()) return;
  if (alert.itemId) { const item = data.items.find(row => row.id === alert.itemId); if (!item || itemAlertsMuted(item)) return; }
  chrome.runtime.sendMessage({ type: "radar:price-alert", alert }).catch(() => {});
}

async function refreshAllItems() {
  const items = data.items.filter(item => !data.products.find(product => product.id === (item.productId || item.productGroupId))?.archived);
  if (isBatchUpdating || !items.length) return;
  const button = document.getElementById("refreshAll");
  const origins = [...new Set(items.flatMap(item => { try { const url = new URL(item.url); return /^https?:$/.test(url.protocol) ? [`${url.origin}/*`] : []; } catch { return []; } }))];
  if (!origins.length) return showToast("Nenhum item tem um endereço HTTP/HTTPS válido.", true);
  isBatchUpdating = true;
  button.disabled = true;
  button.textContent = "Preparando…";
  button.setAttribute("aria-busy", "true");
  renderItems();
  let updated = 0;
  let failed = 0;
  let reviewRequired = 0;
  const alerts = [];
  const failedNames = [];
  try {
    const allowed = await chrome.permissions.request({ origins });
    if (!allowed) throw new Error("A permissão para um ou mais sites não foi concedida.");
    for (let index = 0; index < items.length; index += 1) {
      button.textContent = `Atualizando ${index + 1}/${items.length}`;
      const result = await refreshPrice(items[index], null, { permissionGranted: true, suppressToast: true, suppressAlerts: true, rerender: false });
      if (result.reviewRequired) reviewRequired += 1;
      else if (result.ok) { updated += 1; if (result.alert && !itemAlertsMuted(items[index])) alerts.push(result.alert); }
      else { failed += 1; failedNames.push(items[index].name); }
      renderItems();
    }
    if ((settings.priceAlertsEnabled || settings.priceAlertSoundEnabled) && alerts.length && !getQuietHoursActive()) {
      const hitTarget = alerts.some(alert => alert.kind === "target");
      sendPriceAlert({
        kind: "summary",
        badgeText: hitTarget ? "!" : "↓",
        itemName: `${alerts.length} ${alerts.length === 1 ? "item teve" : "itens tiveram"} uma condição de alerta`,
        price: "Abra o Radar para ver os valores."
      });
    }
    const failedSummary = failedNames.length ? ` · Falha: ${failedNames.slice(0, 2).join(", ")}${failedNames.length > 2 ? "…" : ""}` : "";
    const updatedLabel = updated === 1 ? "1 item atualizado" : `${updated} itens atualizados`;
    const reviewSummary = reviewRequired ? ` · ${reviewRequired} para revisar` : "";
    showToast(`${updatedLabel}${reviewSummary}${failed ? ` · ${failed} ${failed === 1 ? "falhou" : "falharam"}${failedSummary}` : ""}.`, failed > 0);
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
    const count = document.createElement("span"); count.className = "folder-count"; count.textContent = `${data.products.filter(product => product.folderId === folder.id).length} produtos`; label.append(count);
    const actions = document.createElement("div"); actions.className = "folder-actions";
    const rename = document.createElement("button"); rename.className = "icon-action"; rename.textContent = "Renomear";
    rename.addEventListener("click", async () => { const value = prompt("Novo nome da pasta:", folder.name)?.trim(); if (!value || value === folder.name) return; if (data.folders.some(other => other.id !== folder.id && other.name.toLowerCase() === value.toLowerCase())) return showToast("Já existe uma pasta com esse nome.", true); folder.name = value; await persist(); renderAll(); });
    const del = document.createElement("button"); del.className = "icon-action danger"; del.textContent = "Apagar";
    del.addEventListener("click", async () => { if (!confirm(`Apagar a pasta “${folder.name}”? Os produtos serão mantidos em “Sem pasta”.`)) return; data.products.forEach(product => { if (product.folderId === folder.id) product.folderId = NO_FOLDER; }); data.items.forEach(item => { if (item.folderId === folder.id) item.folderId = NO_FOLDER; }); data.folders = data.folders.filter(other => other.id !== folder.id); collapsedGroups.delete(folder.id); await persist(); renderAll(); });
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
  document.getElementById("startupRefreshPaceSlider").value = String(settings.startupRefreshPaceMinutes);
  updatePaceWarning(settings.startupRefreshPaceMinutes);
  syncStaleControls();
  renderSiteProfiles();
  let alertPreferencesChanged = false;
  if (settings.priceAlertsEnabled && !await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false)) {
    settings.priceAlertsEnabled = false;
    alertPreferencesChanged = true;
  } else if (settings.priceAlertSoundEnabled && !await chrome.permissions.contains({ permissions: ["offscreen"] }).catch(() => false)) {
    settings.priceAlertSoundEnabled = false;
    alertPreferencesChanged = true;
  } else if (settings.contextMenuEnabled && !await chrome.permissions.contains({ permissions: ["contextMenus"] }).catch(() => false)) {
    settings.contextMenuEnabled = false;
    alertPreferencesChanged = true;
  }
  if (alertPreferencesChanged) await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  document.getElementById("priceAlertsEnabled").checked = settings.priceAlertsEnabled;
  const soundToggle = document.getElementById("priceAlertSoundEnabled");
  soundToggle.checked = settings.priceAlertSoundEnabled;
  const volume = document.getElementById("priceAlertVolume");
  volume.value = String(settings.priceAlertVolume);
  volume.style.setProperty("--range-progress", `${settings.priceAlertVolume}%`);
  document.getElementById("priceAlertVolumeValue").value = String(settings.priceAlertVolume);
  document.getElementById("priceAlertCooldownMinutes").value = String(settings.priceAlertCooldownMinutes);
  document.getElementById("priceAlertMinDropPercent").value = String(settings.priceAlertMinDropPercent);
  document.getElementById("priceAnomalyThresholdPercent").value = String(settings.priceAnomalyThresholdPercent);
  document.getElementById("priceAnomalyThresholdPercent").disabled = !settings.priceAnomalyGuardEnabled;
  document.getElementById("priceAlertNewLowEnabled").checked = settings.priceAlertNewLowEnabled;
  document.getElementById("quietHoursEnabled").checked = settings.quietHoursEnabled;
  document.getElementById("quietHoursStart").value = settings.quietHoursStart;
  document.getElementById("quietHoursEnd").value = settings.quietHoursEnd;
  document.getElementById("priceAnomalyGuardEnabled").checked = settings.priceAnomalyGuardEnabled;
  document.getElementById("priceSourceEnabled").checked = settings.priceSourceEnabled;
  document.getElementById("priceHistoryChartEnabled").checked = settings.priceHistoryChartEnabled;
  document.getElementById("contextMenuEnabled").checked = settings.contextMenuEnabled;
  document.getElementById("priceAlertSoundStyle").value = settings.priceAlertSoundStyle;
  document.getElementById("accentColor").value = settings.accentColor;
  updateAccentPreview(settings.accentColor);
  const folderSelect = document.getElementById("defaultFolder");
  fillFolderSelect(folderSelect, settings.defaultFolderId, true);
  settings.defaultFolderId = folderSelect.value;
  const status = document.getElementById("startupRefreshStatus");
  const stored = (await chrome.storage.local.get(AUTO_STATUS_KEY))[AUTO_STATUS_KEY];
  const queue = (await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue;
  const queueControls = document.getElementById("startupQueueControls");
  queueControls.classList.toggle("hidden", !queue?.ids?.length);
  document.getElementById("pauseStartupQueue").textContent = queue?.paused ? "Retomar fila" : "Pausar fila";
  const bytesInUse = await chrome.storage.local.getBytesInUse(null).catch(() => 0);
  document.getElementById("storageUsage").textContent = `Dados locais: ${formatBytes(bytesInUse)} usados (limite padrão do Chrome: 10 MB).`;
  if (!settings.startupRefreshEnabled) {
    status.textContent = "Desativada. Nenhuma página será aberta automaticamente.";
    return;
  }
  if (queue?.ids?.length) {
    status.textContent = `${queue.paused ? "Fila pausada" : "Fila em andamento"}: ${queue.updated || 0} atualizado(s), ${queue.review || 0} para revisar, ${queue.ids.length} restante(s).`;
  } else if (stored?.lastRun) {
    const when = formatDate(stored.lastRun);
    status.textContent = `Última execução: ${when} · ${stored.updated || 0} atualizados${stored.review ? ` · ${stored.review} para revisar` : ""}${stored.skipped ? ` · ${stored.skipped} ignorados` : ""}.`;
  } else {
    status.textContent = `Ativa para o próximo início: fila de itens sem atualização há ${formatStaleThreshold()}, com intervalo de ${formatPace(settings.startupRefreshPaceMinutes)} entre páginas.`;
  }
}

function renderSiteProfiles() {
  const root = document.getElementById("siteProfilesList");
  if (!root) return;
  root.replaceChildren();
  const profiles = [...(data.siteProfiles || [])].sort((a, b) => a.host.localeCompare(b.host));
  if (!profiles.length) {
    const empty = document.createElement("div"); empty.className = "profile-empty"; empty.textContent = "Nenhum perfil salvo. Você pode reutilizar um seletor CSS para todas as páginas do mesmo domínio."; root.append(empty); return;
  }
  profiles.forEach(profile => {
    const row = document.createElement("div"); row.className = "site-profile-row";
    const heading = document.createElement("strong"); heading.className = "site-profile-host"; heading.textContent = profile.host;
    const selector = document.createElement("input"); selector.value = profile.selector || ""; selector.placeholder = "Seletor CSS"; selector.setAttribute("aria-label", `Seletor CSS para ${profile.host}`);
    const actions = document.createElement("div"); actions.className = "row-actions";
    const save = document.createElement("button"); save.type = "button"; save.className = "secondary"; save.textContent = "Salvar";
    save.addEventListener("click", async () => {
      const value = selector.value.trim();
      if (!value) return showToast("Informe um seletor CSS.", true);
      profile.selector = value; profile.updatedAt = new Date().toISOString();
      await persist(); renderSettings(); showToast(`Perfil de ${profile.host} salvo.`);
    });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary"; remove.textContent = "Remover";
    remove.addEventListener("click", async () => { data.siteProfiles = data.siteProfiles.filter(row => row.host !== profile.host); await persist(); renderSettings(); showToast(`Perfil de ${profile.host} removido.`); });
    actions.append(save, remove); row.append(heading, selector, actions); root.append(row);
  });
}

async function syncQueueStatus() {
  const queue = (await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue;
  const last = (await chrome.storage.local.get(AUTO_STATUS_KEY))[AUTO_STATUS_KEY];
  const controls = document.getElementById("startupQueueControls");
  if (!controls) return;
  controls.classList.toggle("hidden", !queue?.ids?.length);
  document.getElementById("pauseStartupQueue").textContent = queue?.paused ? "Retomar fila" : "Pausar fila";
  const status = document.getElementById("startupRefreshStatus");
  if (queue?.ids?.length) status.textContent = `${queue.paused ? "Fila pausada" : "Fila em andamento"}: ${queue.updated || 0} atualizado(s), ${queue.review || 0} para revisar, ${queue.ids.length} restante(s).`;
  else if (settings.startupRefreshEnabled && last?.lastRun) status.textContent = `Última execução: ${formatDate(last.lastRun)} · ${last.updated || 0} atualizados${last.review ? ` · ${last.review} para revisar` : ""}${last.skipped ? ` · ${last.skipped} ignorados` : ""}.`;
}

async function controlStartupQueue(action) {
  const stored = (await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue;
  if (!stored?.ids?.length) return renderSettings();
  if (action === "cancel") {
    await chrome.alarms.clear("radar-local-startup-refresh");
    await chrome.storage.local.remove("radarLocalAutoQueue");
    showToast("Fila automática cancelada.");
  } else {
    stored.paused = !stored.paused;
    await chrome.storage.local.set({ radarLocalAutoQueue: stored });
    if (stored.paused) await chrome.alarms.clear("radar-local-startup-refresh");
    else await chrome.alarms.create("radar-local-startup-refresh", { delayInMinutes: 1 });
    showToast(stored.paused ? "Fila pausada." : "Fila retomada.");
  }
  await renderSettings();
}

async function exportBackup() {
  const payload = { app: "Radar Local", schemaVersion: 2, exportedAt: new Date().toISOString(), ...data, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `radar-local-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Backup JSON exportado.");
}

function exportCsv() {
  const escapeCell = value => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [["Produto", "Status do produto", "Loja", "URL", "Preço registrado", "Moeda", "Preço-alvo", "Data da verificação", "Origem", "Confiança", "Disponibilidade", "Pasta", "Erro da última verificação"]];
  for (const item of data.items) {
    const history = (item.history || []).filter(point => Number.isFinite(Number(point.amount)) && Number(point.amount) > 0);
    if (!history.length && item.price) history.push(item.price);
    const product = data.products.find(row => row.id === (item.productId || item.productGroupId));
    const folder = data.folders.find(row => row.id === item.folderId)?.name || "Sem pasta";
    const availability = item.availability === "in-stock" ? "Disponível" : item.availability === "out-of-stock" ? "Esgotado" : "Não informada";
    for (const point of history) rows.push([item.name, product?.archived ? (product.archiveReason === "purchased" ? "Comprado/arquivado" : "Arquivado") : "Ativo", item.offerLabel || getSiteHost(item.url), item.url, point.amount, point.currency || "", item.target ?? "", point.checkedAt || "", point.source || "", point.confidence || "", availability, folder, item.lastCheckError || ""]);
    if (!history.length) rows.push([item.name, product?.archived ? "Arquivado" : "Ativo", item.offerLabel || getSiteHost(item.url), item.url, "", "", item.target ?? "", "", "", "", availability, folder, item.lastCheckError || ""]);
  }
  const csv = "\uFEFF" + rows.map(row => row.map(escapeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `radar-local-itens-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Lista e histórico exportados para CSV.");
}

async function importBackup(event) {
  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.items)) throw new Error("Este arquivo não parece ser um backup do Radar Local.");
    const mode = document.getElementById("backupImportMode").value;
    if (mode === "merge") {
      if (!confirm(`Mesclar ${parsed.folders.length} pastas e ${parsed.items.length} itens com os dados atuais? URLs repetidas serão combinadas pelo histórico mais recente. Suas configurações não serão alteradas.`)) return;
      data = mergeBackupData(parsed);
    } else {
      if (!confirm(`Substituir os dados atuais por ${parsed.folders.length} pastas e ${parsed.items.length} itens?${parsed.settings ? " As configurações também serão substituídas." : ""} Exporte um backup antes se quiser voltar atrás.`)) return;
      data = normalizeProductData({ ...parsed, siteProfiles: Array.isArray(parsed.siteProfiles) ? parsed.siteProfiles : [] });
    }
    if (mode === "replace" && parsed.settings && typeof parsed.settings === "object") {
      settings = normalizeSettings(parsed.settings);
      if (settings.defaultFolderId !== NO_FOLDER && !data.folders.some(folder => folder.id === settings.defaultFolderId)) settings.defaultFolderId = NO_FOLDER;
      await persistSettings();
    }
    await persist();
    await chrome.runtime.sendMessage({ type: "radar:context-menu", enabled: settings.contextMenuEnabled }).catch(() => {});
    if (!settings.contextMenuEnabled) await chrome.permissions.remove({ permissions: ["contextMenus"] }).catch(() => {});
    renderAll(); showToast(mode === "merge" ? "Backup mesclado neste navegador." : "Backup importado neste navegador.");
  } catch (error) { showToast(error.message || "Não foi possível importar o arquivo.", true); }
}

function mergeBackupData(parsed) {
  parsed = normalizeProductData(parsed);
  const merged = { folders: [...data.folders], products: [...data.products], items: [...data.items], siteProfiles: [...(data.siteProfiles || [])], favicons: { ...(data.favicons || {}), ...(parsed.favicons || {}) } };
  const productGroupMap = new Map();
  for (const profile of parsed.siteProfiles || []) {
    if (!merged.siteProfiles.some(row => row.host === profile.host)) merged.siteProfiles.push({ ...profile });
  }
  const folderMap = new Map();
  for (const incoming of parsed.folders) {
    let match = merged.folders.find(folder => folder.id === incoming.id) || merged.folders.find(folder => folder.name?.trim().toLowerCase() === incoming.name?.trim().toLowerCase());
    if (!match) { match = { ...incoming, id: merged.folders.some(folder => folder.id === incoming.id) ? crypto.randomUUID() : incoming.id || crypto.randomUUID() }; merged.folders.push(match); }
    folderMap.set(incoming.id, match.id);
  }
  for (const incoming of parsed.items) {
    const groupKey = incoming.productGroupId || incoming.id;
    const existing = merged.items.find(item => normalizeItemUrl(item.url) === normalizeItemUrl(incoming.url));
    if (existing && groupKey) productGroupMap.set(groupKey, existing.productGroupId || existing.id);
  }
  for (const incomingProduct of parsed.products) {
    const mapped = productGroupMap.get(incomingProduct.id);
    let existing = mapped ? merged.products.find(product => product.id === mapped) : merged.products.find(product => product.id === incomingProduct.id);
    if (!existing) {
      const product = { ...incomingProduct };
      if (merged.products.some(row => row.id === product.id)) product.id = crypto.randomUUID();
      existing = product; merged.products.push(product);
    } else {
      if (existing.target == null && incomingProduct.target != null) existing.target = incomingProduct.target;
      if (!existing.folderId || existing.folderId === NO_FOLDER) existing.folderId = folderMap.get(incomingProduct.folderId) || incomingProduct.folderId || NO_FOLDER;
    }
    productGroupMap.set(incomingProduct.id, existing.id);
  }
  for (const incoming of parsed.items) {
    const incomingItem = { ...incoming, history: Array.isArray(incoming.history) ? [...incoming.history] : [], folderId: folderMap.get(incoming.folderId) || NO_FOLDER };
    const existing = merged.items.find(item => normalizeItemUrl(item.url) === normalizeItemUrl(incoming.url));
    const groupKey = incoming.productGroupId || incoming.id;
    if (productGroupMap.has(groupKey)) incomingItem.productId = incomingItem.productGroupId = productGroupMap.get(groupKey);
    else if (groupKey) {
      const usedGroupIds = new Set(merged.items.map(row => row.productGroupId || row.id));
      incomingItem.productGroupId = usedGroupIds.has(groupKey) ? crypto.randomUUID() : groupKey;
      incomingItem.productId = incomingItem.productGroupId;
      productGroupMap.set(groupKey, incomingItem.productGroupId);
    }
    const mappedProduct = merged.products.find(product => product.id === incomingItem.productId);
    if (mappedProduct) { incomingItem.name = mappedProduct.name; incomingItem.folderId = mappedProduct.folderId || incomingItem.folderId; incomingItem.target = mappedProduct.target ?? incomingItem.target ?? null; }
    if (!existing) {
      incomingItem.id = incomingItem.id || crypto.randomUUID();
      if (merged.items.some(item => item.id === incomingItem.id)) incomingItem.id = crypto.randomUUID();
      merged.items.push(incomingItem);
      continue;
    }
    const points = [...(existing.history || []), ...incomingItem.history];
    const unique = new Map(points.map(point => [`${point.checkedAt}|${point.amount}|${point.currency}|${point.source}`, point]));
    existing.history = [...unique.values()].sort((a, b) => (Date.parse(a.checkedAt) || 0) - (Date.parse(b.checkedAt) || 0)).slice(-300);
    const incomingTime = Date.parse(incomingItem.price?.checkedAt || "") || 0;
    const existingTime = Date.parse(existing.price?.checkedAt || "") || 0;
    if (incomingItem.productId) existing.productId = existing.productGroupId = incomingItem.productId;
    if (incomingItem.price && incomingTime > existingTime) existing.price = incomingItem.price;
    if (incomingItem.regularPrice && (!existing.regularPriceObservedAt || Date.parse(incomingItem.regularPriceObservedAt) > Date.parse(existing.regularPriceObservedAt))) { existing.regularPrice = incomingItem.regularPrice; existing.regularPriceObservedAt = incomingItem.regularPriceObservedAt; }
    if (existing.target == null && incomingItem.target != null) existing.target = incomingItem.target;
    if (!existing.selector && incomingItem.selector) existing.selector = incomingItem.selector;
    if (!existing.folderId || existing.folderId === NO_FOLDER) existing.folderId = incomingItem.folderId;
    if (!existing.pendingPriceCandidate && incomingItem.pendingPriceCandidate) existing.pendingPriceCandidate = incomingItem.pendingPriceCandidate;
  }
  return merged;
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
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }
