// Utilidades de formatação, avisos (toast) e conversão de valores digitados.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

function normalizeItemUrl(value) { return RadarData.normalizedUrl(value); }
function parseUserPrice(value) { return RadarMoney.parse(value, "", true); }

function formatPrice(amount, currency) {
  if (!Number.isFinite(Number(amount))) return "Sem preço";
  if (currency) { try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(amount)); } catch {} }
  return `${Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "data desconhecida" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function showToast(message, isError = false, undoAction = null) {
  const toast = document.getElementById("toast");
  const copy = document.createElement("span"); copy.textContent = message;
  toast.replaceChildren(copy);
  if (undoAction) {
    const undo = document.createElement("button"); undo.type = "button"; undo.className = "toast-action"; undo.textContent = undoAction.label;
    undo.addEventListener("click", async () => {
      undo.disabled = true;
      try { await undoAction.run(); showToast("Ação desfeita."); }
      catch { showToast("Não foi possível desfazer a ação.", true); }
    });
    toast.append(undo);
  }
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), undoAction ? 6500 : 3300);
}
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }
