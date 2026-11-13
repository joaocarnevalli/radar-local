importScripts("price-extractor.js");

const DATA_KEY = "radarLocalData";
const SETTINGS_KEY = "radarLocalSettings";
const QUEUE_KEY = "radarLocalAutoQueue";
const STATUS_KEY = "radarLocalAutoStatus";
const SOUND_ALERT_STATE_KEY = "radarLocalSoundAlertTimes";
const AUTO_ALARM = "radar-local-startup-refresh";
const PRICE_CONTEXT_MENU_ID = "radar-local-use-selection-as-price";
let creatingOffscreenDocument;
let contextClickListenerRegistered = false;

function normalizedPace(value) {
  const pace = Number(value);
  return Number.isFinite(pace) ? Math.min(60, Math.max(0.5, Math.round(pace * 2) / 2)) : 5;
}

function sameOriginFaviconUrl(pageUrl, faviconUrl) {
  try {
    const page = new URL(pageUrl); const icon = new URL(faviconUrl || "/favicon.ico", pageUrl);
    return /^https?:$/.test(icon.protocol) && icon.origin === page.origin ? icon.href : "";
  } catch { return ""; }
}

chrome.runtime.onStartup.addListener(() => {
  startStartupRefresh().catch(() => {});
  syncPriceContextMenu().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => syncPriceContextMenu().catch(() => {}));

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTO_ALARM) processNextItem().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "radar:price-alert" && message.alert) showPriceAlert(message.alert).catch(() => {});
  if (message?.type === "radar:context-menu") {
    syncPriceContextMenu(message.enabled === true)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Falha ao configurar menu de contexto." }));
    return true;
  }
  if (message?.type === "radar:test-sound") {
    playPriceAlertSound(message.volume, message.style)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Falha ao tocar o som." }));
    return true;
  }
});

function onPriceSelectionContextClick(info, tab) {
  if (info.menuItemId !== PRICE_CONTEXT_MENU_ID || !info.selectionText || !/^https?:/i.test(tab?.url || "")) return;
  chrome.storage.local.set({ radarLocalPendingCapture: { selectionText: info.selectionText.slice(0, 500), url: tab.url, title: (tab.title || "").slice(0, 180) } })
    .then(() => chrome.tabs.create({ url: chrome.runtime.getURL("quick-capture.html"), active: true }))
    .catch(() => {});
}

function registerPriceSelectionContextListener() {
  if (contextClickListenerRegistered || !chrome.contextMenus?.onClicked) return;
  chrome.contextMenus.onClicked.addListener(onPriceSelectionContextClick);
  contextClickListenerRegistered = true;
}

registerPriceSelectionContextListener();
chrome.permissions?.onAdded?.addListener(permissions => {
  if (permissions.permissions?.includes("contextMenus")) registerPriceSelectionContextListener();
});

async function syncPriceContextMenu(overrideEnabled) {
  const setting = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const enabled = typeof overrideEnabled === "boolean" ? overrideEnabled : setting.contextMenuEnabled === true;
  if (!chrome.contextMenus) {
    if (enabled) throw new Error("Permissão do menu de contexto não concedida.");
    return;
  }
  await new Promise(resolve => chrome.contextMenus.remove(PRICE_CONTEXT_MENU_ID, () => { void chrome.runtime.lastError; resolve(); }));
  if (!enabled) return;
  await new Promise((resolve, reject) => chrome.contextMenus.create({
    id: PRICE_CONTEXT_MENU_ID,
    title: "Radar Local · Usar seleção como preço",
    contexts: ["selection"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  }, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message)); else resolve();
  }));
}

async function startStartupRefresh() {
  await chrome.alarms.clear(AUTO_ALARM);
  const stored = await chrome.storage.local.get([DATA_KEY, SETTINGS_KEY, QUEUE_KEY]);
  const data = stored[DATA_KEY];
  const settings = stored[SETTINGS_KEY] || {};
  const wasPaused = stored[QUEUE_KEY]?.paused === true;
  if (settings.startupRefreshEnabled !== true || !data || !Array.isArray(data.items)) {
    await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }

  const paceMinutes = normalizedPace(settings.startupRefreshPaceMinutes);
  const configuredStaleMinutes = Number(settings.startupRefreshStaleMinutes);
  const staleMinutes = Number.isFinite(configuredStaleMinutes) ? Math.min(525600, Math.max(1, configuredStaleMinutes)) : Math.min(525600, Math.max(60, Number(settings.startupRefreshStaleHours) * 60 || 1440));
  const cutoff = Date.now() - staleMinutes * 60 * 1000;
  const candidates = data.items
    .filter(item => {
      try {
        const url = new URL(item.url);
        const lastChecked = Date.parse(item.price?.checkedAt || "");
        const product = data.products?.find(row => row.id === (item.productId || item.productGroupId));
        return !product?.archived && /^https?:$/.test(url.protocol) && !item.pendingPriceCandidate && (!Number.isFinite(lastChecked) || lastChecked < cutoff);
      } catch { return false; }
    })
    .sort((a, b) => Number(b.target != null) - Number(a.target != null) || (Date.parse(a.price?.checkedAt || "") || 0) - (Date.parse(b.price?.checkedAt || "") || 0));

  const allowedIds = [];
  let skipped = 0;
  for (const item of candidates) {
    const url = new URL(item.url);
    const permitted = await chrome.permissions.contains({ origins: [`${url.origin}/*`] }).catch(() => false);
    if (permitted) allowedIds.push(item.id);
    else skipped += 1;
  }

  if (!allowedIds.length) {
    await chrome.storage.local.remove(QUEUE_KEY);
    await chrome.storage.local.set({ [STATUS_KEY]: { lastRun: new Date().toISOString(), updated: 0, skipped } });
    return;
  }

  await chrome.storage.local.set({
    [QUEUE_KEY]: { ids: allowedIds, updated: 0, skipped, review: 0, paused: wasPaused, startedAt: new Date().toISOString() },
    [STATUS_KEY]: { startedAt: new Date().toISOString(), updated: 0, skipped, review: 0 }
  });
  if (!wasPaused) await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: 1 });
}

async function processNextItem() {
  const stored = await chrome.storage.local.get([DATA_KEY, SETTINGS_KEY, QUEUE_KEY]);
  const queue = stored[QUEUE_KEY];
  if (!queue || !Array.isArray(queue.ids) || !queue.ids.length) {
    await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }
  if (queue.paused === true) return;
  if (stored[SETTINGS_KEY]?.startupRefreshEnabled !== true) {
    await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }

  const id = queue.ids[0];
  const item = stored[DATA_KEY]?.items?.find(row => row.id === id);
  const product = item && stored[DATA_KEY]?.products?.find(row => row.id === (item.productId || item.productGroupId));
  let outcome = false;
  if (item && !product?.archived) outcome = await refreshItem(item);
  else queue.skipped += 1;
  const currentState = await chrome.storage.local.get([SETTINGS_KEY, QUEUE_KEY]);
  if (currentState[SETTINGS_KEY]?.startupRefreshEnabled !== true || !currentState[QUEUE_KEY]) return;
  if (currentState[QUEUE_KEY].paused === true) queue.paused = true;
  if (outcome === true) queue.updated += 1;
  else if (outcome === "review") queue.review = (queue.review || 0) + 1;
  else if (item && !product?.archived) queue.skipped += 1;
  queue.ids.shift();

  const status = { startedAt: queue.startedAt, updated: queue.updated, skipped: queue.skipped, review: queue.review || 0 };
  if (!queue.ids.length) {
    status.lastRun = new Date().toISOString();
    await chrome.storage.local.remove(QUEUE_KEY);
    await chrome.storage.local.set({ [STATUS_KEY]: status });
    return;
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: queue, [STATUS_KEY]: status });
  if (queue.paused) return;
  const currentSettings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const paceMinutes = normalizedPace(currentSettings.startupRefreshPaceMinutes);
  await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: paceMinutes });
}

async function refreshItem(item) {
  let tabId;
  try {
    const stored = await chrome.storage.local.get([SETTINGS_KEY, DATA_KEY]);
    const storedSettings = stored[SETTINGS_KEY] || {};
    const url = new URL(item.url);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (!await chrome.permissions.contains({ origins: [`${url.origin}/*`] })) return false;
    const tab = await chrome.tabs.create({ url: item.url, active: false });
    tabId = tab.id;
    await waitForTab(tabId, 45000);
    await new Promise(resolve => setTimeout(resolve, 1200));
    let result = null;
    for (let attempt = 0; attempt < 3 && !result?.price; attempt += 1) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
      const siteProfile = (stored[DATA_KEY]?.siteProfiles || []).find(profile => profile.host === url.hostname.toLowerCase());
      const selector = item.selector?.trim() || siteProfile?.selector || "";
      const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageInfo, args: [selector] });
      result = injected?.result;
    }
    if (!result?.price) throw new Error("Preço não encontrado na página.");

    const checkedAt = new Date().toISOString();
    const prior = item.price;
    const anomaly = (storedSettings.priceAnomalyGuardEnabled !== false) ? isSuspiciousPriceChange(prior, result.price, Number(storedSettings.priceAnomalyThresholdPercent) || 50) : null;
    if (anomaly) {
      item.pendingPriceCandidate = { ...result.price, regularPrice: result.regularPrice || null, checkedAt, changePercent: anomaly.changePercent, direction: anomaly.direction };
      delete item.lastCheckError;
      delete item.lastCheckErrorAt;
      const saved = await chrome.storage.local.get(DATA_KEY);
      const data = saved[DATA_KEY];
      const index = data?.items?.findIndex(row => row.id === item.id) ?? -1;
      if (index < 0) return false;
      data.items[index] = item;
      await chrome.storage.local.set({ [DATA_KEY]: data });
      return "review";
    }
    const alert = evaluatePriceAlert(item, result.price, storedSettings);
    item.price = { ...result.price, checkedAt };
    item.faviconUrl = sameOriginFaviconUrl(item.url, result.faviconUrl) || item.faviconUrl || "";
    if (result.regularPrice && Number(result.regularPrice.amount) > Number(result.price.amount) && (!result.regularPrice.currency || !result.price.currency || result.regularPrice.currency === result.price.currency)) {
      item.regularPrice = result.regularPrice;
      item.regularPriceObservedAt = checkedAt;
    }
    delete item.pendingPriceCandidate;
    delete item.lastCheckError;
    delete item.lastCheckErrorAt;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: result.price.amount, currency: result.price.currency || "", checkedAt, source: result.price.source || "preço visível", confidence: result.price.confidence || "unknown" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    const saved = await chrome.storage.local.get(DATA_KEY);
    const data = saved[DATA_KEY];
    const index = data?.items?.findIndex(row => row.id === item.id) ?? -1;
    if (index < 0) return false;
    data.items[index] = item;
    await chrome.storage.local.set({ [DATA_KEY]: data });
    if (alert) {
      await showPriceAlert({
        ...alert,
        itemId: item.id,
        itemName: item.offerLabel ? `${item.name} · ${item.offerLabel}` : item.name,
        price: formatAlertPrice(result.price.amount, result.price.currency)
      }).catch(() => {});
    }
    return true;
  } catch (error) {
    await recordBackgroundFailure(item.id, error).catch(() => {});
    return false;
  } finally {
    if (tabId != null) await chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function recordBackgroundFailure(itemId, error) {
  const stored = await chrome.storage.local.get(DATA_KEY);
  const data = stored[DATA_KEY];
  const item = data?.items?.find(row => row.id === itemId);
  if (!item) return;
  item.lastCheckError = error?.message || "Falha na verificação.";
  item.lastCheckErrorAt = new Date().toISOString();
  await chrome.storage.local.set({ [DATA_KEY]: data });
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
    if (alert.kind === "target" || cooldownMinutes === 0 || now - lastPlayed >= cooldownMinutes * 60 * 1000) {
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
  if (!chrome.offscreen) return;
  if (creatingOffscreenDocument) await creatingOffscreenDocument;
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
