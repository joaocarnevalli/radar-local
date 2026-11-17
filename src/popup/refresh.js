// Atualização de preços: envio para a fila do service worker e estado da fila.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

async function queueRefresh(items) {
  const origins = [...new Set(items.map(item => new URL(item.url).origin + "/*"))];
  if (!origins.length) return;
  const allowed = await chrome.permissions.request({ origins });
  if (!allowed) return showToast("Acesso às lojas não concedido. Nenhuma leitura foi iniciada.", true);
  const response = await chrome.runtime.sendMessage({ type: "radar:refresh", ids: items.map(item => item.id) });
  if (!response?.ok) throw new Error(response?.error || "Não foi possível iniciar a fila.");
  await syncQueueStatus();
  showToast("Atualização iniciada. Você pode fechar o popup; a fila continua com o navegador aberto.");
}
async function refreshPrice(item) { return queueRefresh([item]); }
async function refreshAllItems() {
  if (isBatchUpdating) return;
  return queueRefresh(data.items.filter(item => !data.products.find(product => product.id === item.productId)?.archived));
}
async function refreshProductOffers(product, offers) {
  if (isBatchUpdating) return;
  return queueRefresh(offers);
}
function sendPriceAlert(alert) {
  if (getQuietHoursActive()) return;
  if (alert.itemId) { const item = data.items.find(row => row.id === alert.itemId); if (!item || itemAlertsMuted(item)) return; }
  chrome.runtime.sendMessage({ type: "radar:price-alert", alert }).catch(() => {});
}

async function syncQueueStatus() {
  const stored = await chrome.storage.local.get(["radarLocalAutoQueue", AUTO_STATUS_KEY]);
  const queue = stored.radarLocalAutoQueue;
  const last = stored[AUTO_STATUS_KEY];
  const state = queue || last;
  isBatchUpdating = Boolean(queue?.ids?.length && !queue.paused);
  refreshStates.clear();
  for (const [id, result] of Object.entries(state?.results || {})) refreshStates.set(id, result);
  if (queue?.currentId) refreshStates.set(queue.currentId, { state: "loading" });
  const controls = document.getElementById("startupQueueControls");
  controls.classList.toggle("hidden", !queue?.ids?.length);
  document.getElementById("pauseStartupQueue").textContent = queue?.paused ? "Retomar fila" : "Pausar fila";
  const completed = (state?.updated || 0) + (state?.review || 0) + (state?.skipped || 0);
  const total = completed + (queue?.ids?.length || 0);
  document.getElementById("batchProgress").classList.toggle("hidden", !state || !total);
  document.getElementById("batchProgressCount").textContent = completed + " / " + total;
  document.getElementById("batchProgressBar").max = total || 1;
  document.getElementById("batchProgressBar").value = completed;
  const copy = state?.error || (queue ? (queue.paused ? "Fila pausada" : "Atualizando uma loja por vez") : "Atualização concluída") + " · " + (state?.updated || 0) + " atualizadas · " + (state?.review || 0) + " para revisar · " + (state?.skipped || 0) + " falhas";
  document.getElementById("batchProgressText").textContent = copy;
  document.getElementById("batchProgress").classList.toggle("has-error", Boolean(state?.error));
  // O aviso só pode ser fechado quando nada está rodando; uma fila pausada pode ser retomada ali mesmo.
  document.getElementById("batchResume").classList.toggle("hidden", !queue?.paused);
  document.getElementById("batchDismiss").classList.toggle("hidden", Boolean(queue?.ids?.length && !queue.paused));
  document.getElementById("startupRefreshStatus").textContent = copy;
  updateRefreshAllButton();
  if (!document.activeElement?.matches("input, textarea, select")) renderItems();
}
async function controlStartupQueue(action) {
  const response = await chrome.runtime.sendMessage({ type: "radar:queue-control", action });
  if (!response?.ok) throw new Error(response?.error || "Não foi possível alterar a fila.");
  await syncQueueStatus();
}
