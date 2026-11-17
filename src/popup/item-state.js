// Estado derivado das ofertas: domínio, favicons, perfis de site, frescor da leitura e silêncio de alertas.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

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
        const response = await fetch(iconUrl, { credentials: "omit", cache: "force-cache", redirect: "error", signal: AbortSignal.timeout(5000) });
        if (!response.ok || new URL(response.url).origin !== origin) return;
        const reader = response.body?.getReader();
        if (!reader) return;
        const chunks = []; let received = 0;
        try {
          while (true) { const chunk = await reader.read(); if (chunk.done) break; received += chunk.value.byteLength; if (received > 24 * 1024) { await reader.cancel(); return; } chunks.push(chunk.value); }
        } finally { reader.releaseLock(); }
        const blob = new Blob(chunks, { type: (response.headers.get("Content-Type") || "").split(";")[0] });
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
function isItemFresh(item) { return Boolean(item.price && !item.pendingPriceCandidate && !item.lastCheckError && !isItemStale(item)); }
function itemRefreshState(item) {
  const state = refreshStates.get(item.id);
  if (state?.state === "loading") return state;
  if (item.pendingPriceCandidate) return { state: "review" };
  if (item.lastCheckError) return { state: "error" };
  if (state?.state === "success" && !isItemStale(item) && Date.now() - Date.parse(state.checkedAt || "") < 60000) return state;
  return null;
}
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
