importScripts("money.js", "data-store.js", "price-extractor.js");

const DATA_KEY = RadarData.KEY;
const SETTINGS_KEY = RadarData.SETTINGS;
const QUEUE_KEY = "radarLocalAutoQueue";
const STATUS_KEY = "radarLocalAutoStatus";
const SOUND_ALERT_STATE_KEY = "radarLocalSoundAlertTimes";
const AUTO_ALARM = "radar-local-startup-refresh";
const PRICE_CONTEXT_MENU_ID = "radar-local-use-selection-as-price";
let creatingOffscreenDocument;
let processing = false;
let contextClickListenerRegistered = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function normalizedPace(value) { const n = Number(value); return Number.isFinite(n) ? Math.min(60, Math.max(0.5, n)) : 5; }
function sameOriginFaviconUrl(pageUrl, faviconUrl) { try { const page = new URL(pageUrl), icon = new URL(faviconUrl || "/favicon.ico", pageUrl); return RadarData.url(icon.href) && icon.origin === page.origin ? icon.href : ""; } catch { return ""; } }
function trustedSender(sender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const base = chrome.runtime.getURL("");
  return ["popup.html", "dashboard.html", "quick-capture.html"].some(path => sender.url.split(/[?#]/)[0] === base + path);
}
async function startup() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await cleanupReadTab();
  await syncPriceContextMenu();
  await startStartupRefresh();
}
chrome.runtime.onStartup.addListener(() => { void startup().catch(reportQueueError); });
chrome.runtime.onInstalled.addListener(() => { void startup().catch(reportQueueError); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === AUTO_ALARM) void processNextItem().catch(reportQueueError); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedSender(sender)) return;
  const tasks = {
    "radar:price-alert": () => showPriceAlert(message.alert),
    "radar:context-menu": () => syncPriceContextMenu(),
    "radar:test-sound": () => playPriceAlertSound(message.volume, message.style),
    "radar:refresh": () => enqueueItems(message.ids),
    "radar:queue-control": () => controlQueue(message.action)
  };
  if (!Object.hasOwn(tasks, message?.type)) return;
  Promise.resolve().then(tasks[message.type]).then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: error?.message || "Não foi possível concluir a operação." }));
  return true;
});
async function onPriceSelectionContextClick(info, tab) {
  if (info.menuItemId !== PRICE_CONTEXT_MENU_ID || !info.selectionText || !RadarData.url(tab?.url)) return;
  const token = crypto.randomUUID();
  const key = "radarCapture:" + token;
  await navigator.locks.request("radar-captures", async () => {
    const all = await chrome.storage.local.get(null);
    const captures = Object.entries(all).filter(([name]) => name.startsWith("radarCapture:")).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
    const expired = captures.filter(([, capture], index) => Date.now() - capture.createdAt > 86400000 || index < captures.length - 19).map(([name]) => name);
    if (expired.length) await chrome.storage.local.remove(expired);
    await chrome.storage.local.set({ [key]: { selectionText: info.selectionText.slice(0, 500), url: tab.url, title: (tab.title || "").slice(0, 180), createdAt: Date.now() } });
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL("quick-capture.html?capture=" + token), active: true });
}
function registerContextListener() {
  if (contextClickListenerRegistered || !chrome.contextMenus?.onClicked) return;
  chrome.contextMenus.onClicked.addListener((info, tab) => { void onPriceSelectionContextClick(info, tab).catch(reportQueueError); });
  contextClickListenerRegistered = true;
}
registerContextListener();
chrome.permissions.onAdded.addListener(() => { registerContextListener(); void syncPriceContextMenu().catch(() => {}); });
async function syncPriceContextMenu() {
  const enabled = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]?.contextMenuEnabled === true;
  const permitted = await chrome.permissions.contains({ permissions: ["contextMenus"] });
  if (!permitted || !chrome.contextMenus) return;
  await new Promise(resolve => chrome.contextMenus.remove(PRICE_CONTEXT_MENU_ID, () => { void chrome.runtime.lastError; resolve(); }));
  if (!enabled) return;
  await new Promise((resolve, reject) => chrome.contextMenus.create({ id: PRICE_CONTEXT_MENU_ID, title: "Radar Local · Usar seleção como preço", contexts: ["selection"], documentUrlPatterns: ["http://*/*", "https://*/*"] }, () => { const error = chrome.runtime.lastError; error ? reject(new Error(error.message)) : resolve(); }));
}
async function queueState() { return (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY]; }
async function reportQueueError(error) {
  console.error("Radar: operação interrompida:", error?.message || "erro desconhecido");
  await navigator.locks.request("radar-queue", async () => {
    const queue = await queueState();
    const status = { error: error?.message || "Falha ao gravar o resultado.", lastRun: new Date().toISOString() };
    if (queue) { queue.paused = true; queue.currentId = null; queue.error = status.error; }
    await chrome.storage.local.set({ [STATUS_KEY]: status, ...(queue ? { [QUEUE_KEY]: queue } : {}) });
    await chrome.alarms.clear(AUTO_ALARM);
  }).catch(() => {});
}
async function enqueueItems(ids, mode = "manual") {
  if (!Array.isArray(ids) || ids.length > 5000 || ids.some(id => typeof id !== "string")) throw new Error("Lista de ofertas inválida.");
  const data = await RadarData.read();
  const eligible = [...new Set(ids)].filter(id => { const item = data.items.find(row => row.id === id); return item && !data.products.find(p => p.id === item.productId)?.archived; });
  if (!eligible.length) throw new Error("Nenhuma oferta ativa para atualizar.");
  await navigator.locks.request("radar-queue", async () => {
    const existing = await queueState();
    const queue = existing?.ids?.length ? existing : { id: crypto.randomUUID(), ids: [], manualIds: [], results: {}, updated: 0, skipped: 0, review: 0, alertIds: [], startedAt: new Date().toISOString(), paused: false };
    queue.ids = [...new Set([...queue.ids, ...eligible])];
    if (mode === "manual") queue.manualIds = [...new Set([...(queue.manualIds || []), ...eligible])];
    queue.paused = false;
    queue.id ||= crypto.randomUUID();
    delete queue.error;
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: 0.5 });
  });
  void processNextItem().catch(reportQueueError);
  return { queued: eligible.length };
}
async function startStartupRefresh() {
  const existing = await queueState();
  if (existing?.ids?.length) {
    if (!existing.paused) { await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: 0.5 }); void processNextItem().catch(reportQueueError); }
    return;
  }
  const data = await RadarData.read();
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  if (!settings.startupRefreshEnabled) return;
  const cutoff = Date.now() - Math.min(525600, Math.max(1, Number(settings.startupRefreshStaleMinutes) || 1440)) * 60000;
  const ids = [];
  for (const item of [...data.items].sort((a, b) => Number(b.target != null) - Number(a.target != null))) {
    if (data.products.find(p => p.id === item.productId)?.archived || item.pendingPriceCandidate || (Date.parse(item.price?.checkedAt || "") || 0) >= cutoff) continue;
    if (await chrome.permissions.contains({ origins: [new URL(item.url).origin + "/*"] }).catch(() => false)) ids.push(item.id);
  }
  if (ids.length) await enqueueItems(ids, "startup");
}
async function controlQueue(action) {
  await navigator.locks.request("radar-queue", async () => {
    const queue = await queueState();
    if (!queue) return;
    if (action === "cancel") { await chrome.storage.local.remove(QUEUE_KEY); await chrome.alarms.clear(AUTO_ALARM); return; }
    if (action === "disable-auto") {
      queue.ids = queue.ids.filter(id => queue.manualIds?.includes(id));
      if (!queue.ids.length) { await chrome.storage.local.remove(QUEUE_KEY); await chrome.alarms.clear(AUTO_ALARM); return; }
    } else if (action === "pause") { queue.paused = !queue.paused; delete queue.error; }
    else throw new Error("Ação de fila inválida.");
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    if (queue.paused) await chrome.alarms.clear(AUTO_ALARM);
    else await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: 0.5 });
  });
}
async function processNextItem() {
  if (processing) return;
  processing = true;
  try {
    const queue = await queueState();
    if (!queue?.ids?.length || queue.paused) return;
    await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: 1 });
    const itemId = queue.ids[0];
    const claimed = await navigator.locks.request("radar-queue", async () => {
      const latest = await queueState();
      if (!latest || latest.id !== queue.id || latest.paused || !latest.ids.includes(itemId)) return false;
      latest.currentId = itemId;
      await chrome.storage.local.set({ [QUEUE_KEY]: latest });
      return true;
    });
    if (!claimed) return;
    const outcome = await refreshItem(itemId);
    let nextIsManual = false, hasNext = false, summary = null;
    await navigator.locks.request("radar-queue", async () => {
      const latest = await queueState();
      if (!latest || latest.id !== queue.id) return;
      latest.ids = latest.ids.filter(id => id !== itemId);
      latest.results ||= {};
      latest.results[itemId] = { state: outcome.state, message: outcome.error || "", checkedAt: new Date().toISOString() };
      latest.updated = (latest.updated || 0) + Number(outcome.state === "success");
      latest.review = (latest.review || 0) + Number(outcome.state === "review");
      latest.skipped = (latest.skipped || 0) + Number(outcome.state === "error");
      latest.currentId = null;
      if (outcome.alert) (latest.alertIds ||= []).push(itemId);
      if (!latest.ids.length) {
        summary = { ...latest, lastRun: new Date().toISOString() };
        await chrome.storage.local.set({ [STATUS_KEY]: summary });
        await chrome.storage.local.remove(QUEUE_KEY);
        await chrome.alarms.clear(AUTO_ALARM);
      } else {
        await chrome.storage.local.set({ [QUEUE_KEY]: latest });
        hasNext = !latest.paused;
        nextIsManual = latest.manualIds?.includes(latest.ids[0]);
      }
    });
    if (summary?.alertIds?.length) {
      const data = await RadarData.read();
      const audible = summary.alertIds.filter(id => { const item = data.items.find(row => row.id === id); const product = data.products.find(p => p.id === item?.productId); return item && !item.alertsMuted && !product?.alertsMuted && !product?.archived; });
      if (audible.length) await showPriceAlert({ kind: "summary", itemName: audible.length + " oferta(s) atingiram uma condição de alerta", price: "Abra o Radar para ver os valores." });
    }
    if (hasNext) {
      const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
      await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: nextIsManual ? 0.5 : normalizedPace(settings.startupRefreshPaceMinutes) });
      if (nextIsManual) setTimeout(() => { void processNextItem().catch(reportQueueError); }, 500);
    }
  } finally { processing = false; }
}
async function cleanupReadTab() {
  const saved = (await chrome.storage.local.get("radarReadTab")).radarReadTab;
  if (!saved) return;
  try { const tab = await chrome.tabs.get(saved.id); if (!tab.active) await chrome.tabs.remove(saved.id); } catch {}
  await chrome.storage.local.remove("radarReadTab");
}
async function readPrice(tabId, selector, expectedUrl) {
  let best = null, previous = "", repeats = 0;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || new URL(tab.url).origin !== new URL(expectedUrl).origin) throw new Error("A página redirecionou para outro domínio. Confira e salve a URL final da oferta.");
    await chrome.scripting.executeScript({ target: { tabId }, files: ["money.js", "price-extractor.js"] });
    const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: selector => extractPageInfo(selector), args: [selector] });
    const found = injected?.result;
    if (found?.price) {
      best = found;
      const signature = JSON.stringify([found.price.amount, found.price.currency, found.price.source]);
      repeats = signature === previous ? repeats + 1 : 0; previous = signature;
      if (!found.price.requiresReview && repeats >= 1) return found;
    } else { best = null; repeats = 0; previous = ""; }
    await delay(1000);
  }
  if (best) return best;
  throw new Error("Preço não encontrado com segurança. Configure um seletor CSS ou informe o valor manualmente.");
}
async function refreshItem(itemId) {
  let tabId;
  try {
    const data = await RadarData.read();
    const item = data.items.find(row => row.id === itemId);
    if (!item || data.products.find(p => p.id === item.productId)?.archived) return { state: "error", error: "Oferta removida ou arquivada." };
    if (!await chrome.permissions.contains({ origins: [new URL(item.url).origin + "/*"] })) throw new Error("Permissão de leitura não concedida para esta loja.");
    const tab = await chrome.tabs.create({ url: item.url, active: false }); tabId = tab.id;
    await chrome.storage.local.set({ radarReadTab: { id: tabId } });
    await waitForTab(tabId, 45000);
    const selector = item.selector || data.siteProfiles.find(profile => profile.host === new URL(item.url).hostname)?.selector || "";
    const result = await readPrice(tabId, selector, item.url);
    const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
    const transaction = await RadarData.update(latest => {
      const current = latest.items.find(row => row.id === itemId);
      if (!current || latest.products.find(p => p.id === current.productId)?.archived) return { state: "error", error: "Oferta removida ou arquivada durante a leitura." };
      const currentSelector = current.selector || latest.siteProfiles.find(profile => profile.host === new URL(current.url).hostname)?.selector || "";
      if (!RadarData.equal(current.price, item.price) || currentSelector !== selector || current.url !== item.url) return { state: "review", error: "A oferta foi alterada durante a leitura. O valor mais recente foi mantido." };
      const checkedAt = new Date().toISOString();
      const reason = priceReviewReason(current.price, result.price, settings);
      if (reason) {
        const anomaly = isSuspiciousPriceChange(current.price, result.price, Number(settings.priceAnomalyThresholdPercent) || 50);
        current.pendingPriceCandidate = { ...result.price, regularPrice: result.regularPrice, checkedAt, reason, changePercent: anomaly?.changePercent ?? null, direction: anomaly?.direction || "increase" };
        delete current.lastCheckError; delete current.lastCheckErrorAt;
        return { state: "review" };
      }
      const alert = evaluatePriceAlert(current, result.price, settings);
      current.price = { ...result.price, checkedAt };
      current.faviconUrl = sameOriginFaviconUrl(current.url, result.faviconUrl);
      if (result.regularPrice && result.regularPrice.amount > result.price.amount) { current.regularPrice = result.regularPrice; current.regularPriceObservedAt = checkedAt; }
      delete current.pendingPriceCandidate; delete current.lastCheckError; delete current.lastCheckErrorAt;
      current.history.push({ ...current.price }); current.history = current.history.slice(-300);
      return { state: "success", alert: Boolean(alert) };
    });
    return transaction.output;
  } catch (error) {
    await RadarData.update(data => { const item = data.items.find(row => row.id === itemId); if (item) { item.lastCheckError = error.message; item.lastCheckErrorAt = new Date().toISOString(); } }).catch(() => {});
    return { state: "error", error: error.message || "Falha na verificação." };
  } finally {
    if (tabId != null) { try { const tab = await chrome.tabs.get(tabId); if (!tab.active) await chrome.tabs.remove(tabId); } catch {} }
    await chrome.storage.local.remove("radarReadTab");
  }
}

async function showPriceAlert(alert) {
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  if (settings.priceAlertsEnabled !== true && settings.priceAlertSoundEnabled !== true) return;
  if (settings.quietHoursEnabled === true && isWithinQuietHours(settings.quietHoursStart || "22:00", settings.quietHoursEnd || "08:00")) return;
  if (alert.itemId) {
    const savedData = (await chrome.storage.local.get(DATA_KEY))[DATA_KEY];
    const item = savedData?.items?.find(row => row.id === alert.itemId);
    const product = savedData?.products?.find(row => row.id === (item?.productId || item?.productGroupId));
    if (!item || item.alertsMuted === true || product?.alertsMuted === true || product?.archived === true) return;
  }
  const isTarget = alert.kind === "target";
  const isNewLow = alert.kind === "new-low";
  const isSummary = alert.kind === "summary";
  const targetBadge = isTarget || alert.badgeText === "!";
  const title = isSummary ? "Atualização de preços" : isTarget ? "Preço-alvo alcançado" : isNewLow ? "Novo menor preço observado" : "O preço caiu";
  if (settings.priceAlertsEnabled === true && await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false)) {
    await chrome.action.setBadgeText({ text: alert.badgeText || (isTarget ? "!" : "↓") });
    await chrome.action.setBadgeBackgroundColor({ color: targetBadge ? "#78b99a" : "#c6c6c6" });
    await chrome.action.setTitle({ title: `Radar Local · ${title.toLowerCase()}` });
    await chrome.notifications.create(`radar-price-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title,
      message: `${alert.itemName || "Item monitorado"} · ${alert.price}`,
      priority: 1,
      silent: true
    });
  }

  if (settings.priceAlertSoundEnabled === true && await chrome.permissions.contains({ permissions: ["offscreen"] }).catch(() => false)) {
    const rawCooldown = Number(settings.priceAlertCooldownMinutes);
    const cooldownMinutes = Number.isFinite(rawCooldown) ? Math.min(1440, Math.max(0, rawCooldown)) : 15;
    const soundKey = alert.itemId || "__summary__";
    const soundState = (await chrome.storage.local.get(SOUND_ALERT_STATE_KEY))[SOUND_ALERT_STATE_KEY] || {};
    const now = Date.now();
    const lastPlayed = Number(soundState[soundKey]) || 0;
    if (cooldownMinutes === 0 || now - lastPlayed >= cooldownMinutes * 60 * 1000) {
      await playPriceAlertSound(settings.priceAlertVolume, settings.priceAlertSoundStyle);
      soundState[soundKey] = now;
      const cutoff = now - 30 * 24 * 60 * 60 * 1000;
      for (const [key, time] of Object.entries(soundState)) if (!Number.isFinite(Number(time)) || Number(time) < cutoff) delete soundState[key];
      await chrome.storage.local.set({ [SOUND_ALERT_STATE_KEY]: soundState });
    }
  }
}

function isWithinQuietHours(startValue, endValue) {
  const parse = value => { const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
  const start = parse(startValue), end = parse(endValue);
  if (start == null || end == null || start === end) return false;
  const now = new Date(); const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

async function playPriceAlertSound(volume = 35, style = "radar") {
  if (!chrome.offscreen || !await chrome.permissions.contains({ permissions: ["offscreen"] })) throw new Error("Ative a permissão de áudio para ouvir o alerta.");
  return navigator.locks.request("radar-audio", async () => {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl] });
  if (!contexts.length) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Tocar o beep curto de um alerta de preço que o usuário ativou."
    });
    try { await creatingOffscreenDocument; } finally { creatingOffscreenDocument = undefined; }
  }
  const response = await chrome.runtime.sendMessage({ target: "radar-offscreen", type: "play-price-alert-sound", volume: Number(volume), style });
  if (!response?.ok) throw new Error(response?.error || "O áudio não confirmou a reprodução.");
  });
}

function formatAlertPrice(amount, currency) {
  if (currency) {
    try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(amount)); } catch {}
  }
  return `${Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

function waitForTab(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("Timeout ao carregar a página")), timeoutMs);
    const listener = (changedId, changeInfo) => {
      if (changedId === tabId && changeInfo.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    const checkTab = () => chrome.tabs.get(tabId)
      .then(tab => { if (tab.status === "complete") finish(); })
      .catch(error => finish(error));
    const poll = setInterval(checkTab, 10000);
    checkTab();
  });
}
