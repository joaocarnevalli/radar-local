importScripts("price-extractor.js");

const DATA_KEY = "radarLocalData";
const SETTINGS_KEY = "radarLocalSettings";
const QUEUE_KEY = "radarLocalAutoQueue";
const STATUS_KEY = "radarLocalAutoStatus";
const AUTO_ALARM = "radar-local-startup-refresh";

chrome.runtime.onStartup.addListener(() => {
  startStartupRefresh().catch(() => {});
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTO_ALARM) processNextItem().catch(() => {});
});

async function startStartupRefresh() {
  await chrome.alarms.clear(AUTO_ALARM);
  const stored = await chrome.storage.local.get([DATA_KEY, SETTINGS_KEY]);
  const data = stored[DATA_KEY];
  const settings = stored[SETTINGS_KEY] || {};
  if (settings.startupRefreshEnabled !== true || !data || !Array.isArray(data.items)) {
    await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }

  const paceMinutes = [1, 3, 5, 10].includes(Number(settings.startupRefreshPaceMinutes)) ? Number(settings.startupRefreshPaceMinutes) : 5;
  const staleHours = [12, 24, 48, 168].includes(Number(settings.startupRefreshStaleHours)) ? Number(settings.startupRefreshStaleHours) : 24;
  const cutoff = Date.now() - staleHours * 60 * 60 * 1000;
  const candidates = data.items
    .filter(item => {
      try {
        const url = new URL(item.url);
        const lastChecked = Date.parse(item.price?.checkedAt || "");
        return /^https?:$/.test(url.protocol) && (!Number.isFinite(lastChecked) || lastChecked < cutoff);
      } catch { return false; }
    })
    .sort((a, b) => (Date.parse(a.price?.checkedAt || "") || 0) - (Date.parse(b.price?.checkedAt || "") || 0));

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
    [QUEUE_KEY]: { ids: allowedIds, updated: 0, skipped, startedAt: new Date().toISOString() },
    [STATUS_KEY]: { startedAt: new Date().toISOString(), updated: 0, skipped }
  });
  await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: 1 });
}

async function processNextItem() {
  const stored = await chrome.storage.local.get([DATA_KEY, SETTINGS_KEY, QUEUE_KEY]);
  const queue = stored[QUEUE_KEY];
  if (!queue || !Array.isArray(queue.ids) || !queue.ids.length) {
    await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }
  if (stored[SETTINGS_KEY]?.startupRefreshEnabled !== true) {
    await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }

  const id = queue.ids[0];
  const item = stored[DATA_KEY]?.items?.find(row => row.id === id);
  let updated = false;
  if (item) updated = await refreshItem(item);
  else queue.skipped += 1;
  const currentState = await chrome.storage.local.get([SETTINGS_KEY, QUEUE_KEY]);
  if (currentState[SETTINGS_KEY]?.startupRefreshEnabled !== true || !currentState[QUEUE_KEY]) return;
  if (updated) queue.updated += 1;
  if (item && !updated) queue.skipped += 1;
  queue.ids.shift();

  const status = { startedAt: queue.startedAt, updated: queue.updated, skipped: queue.skipped };
  if (!queue.ids.length) {
    status.lastRun = new Date().toISOString();
    await chrome.storage.local.remove(QUEUE_KEY);
    await chrome.storage.local.set({ [STATUS_KEY]: status });
    return;
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: queue, [STATUS_KEY]: status });
  const currentSettings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const paceMinutes = [1, 3, 5, 10].includes(Number(currentSettings.startupRefreshPaceMinutes)) ? Number(currentSettings.startupRefreshPaceMinutes) : 5;
  await chrome.alarms.create(AUTO_ALARM, { delayInMinutes: paceMinutes });
}

async function refreshItem(item) {
  let tabId;
  try {
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
      const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageInfo, args: [item.selector || ""] });
      result = injected?.result;
    }
    if (!result?.price) return false;

    const checkedAt = new Date().toISOString();
    item.price = { ...result.price, checkedAt };
    item.regularPrice = result.regularPrice || null;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: result.price.amount, currency: result.price.currency || "", checkedAt, source: result.price.source || "preço visível" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    const saved = await chrome.storage.local.get(DATA_KEY);
    const data = saved[DATA_KEY];
    const index = data?.items?.findIndex(row => row.id === item.id) ?? -1;
    if (index < 0) return false;
    data.items[index] = item;
    await chrome.storage.local.set({ [DATA_KEY]: data });
    return true;
  } catch {
    return false;
  } finally {
    if (tabId != null) await chrome.tabs.remove(tabId).catch(() => {});
  }
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
