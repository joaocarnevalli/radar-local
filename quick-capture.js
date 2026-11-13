const DATA_KEY = "radarLocalData";
const NO_FOLDER = "__no_folder__";
let pending;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const stored = await chrome.storage.local.get(["radarLocalPendingCapture", DATA_KEY, "radarLocalSettings"]);
  const accentColor = stored.radarLocalSettings?.accentColor;
  if (/^#[0-9a-f]{6}$/i.test(accentColor || "")) document.documentElement.style.setProperty("--accent", accentColor);
  pending = stored.radarLocalPendingCapture;
  if (!pending?.url) return setStatus("Não encontrei uma seleção pendente. Volte à página, selecione um preço e use o menu do Radar.");
  await chrome.storage.local.remove("radarLocalPendingCapture");
  const parsed = parseSelection(pending.selectionText || "");
  document.getElementById("captureSelection").value = pending.selectionText || "";
  document.getElementById("captureAmount").value = parsed?.display || "";
  document.getElementById("captureUrl").textContent = pending.url;
  const data = stored[DATA_KEY] || { folders: [], items: [] };
  if (!Array.isArray(data.products)) data.products = [];
  const existing = (data.items || []).find(item => normalizeUrl(item.url) === normalizeUrl(pending.url));
  document.getElementById("captureName").value = existing?.name || pending.title || new URL(pending.url).hostname;
  const folderSelect = document.getElementById("captureFolder");
  const addOption = (value, text) => { const option = document.createElement("option"); option.value = value; option.textContent = text; folderSelect.append(option); };
  addOption(NO_FOLDER, "Sem pasta");
  (data.folders || []).forEach(folder => addOption(folder.id, folder.name));
  folderSelect.value = existing?.folderId || NO_FOLDER;
  document.getElementById("captureFolderLabel").classList.toggle("hidden", Boolean(existing));
  document.getElementById("captureStatus").classList.add("hidden");
  document.getElementById("captureForm").classList.remove("hidden");
  document.getElementById("cancelCapture").addEventListener("click", () => window.close());
  document.getElementById("captureForm").addEventListener("submit", saveSelection);
}

function parseSelection(text) {
  const matches = [...String(text).matchAll(/(?:R\$|US\$|\bBRL\b|\bUSD\b|€|£)\s*[\d.,]+/gi)];
  const candidate = matches.length === 1 ? matches[0][0] : (!matches.length && /^[\s\d.,]+$/.test(text) ? text.trim() : "");
  if (!candidate) return null;
  const clean = candidate.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  let normalized = clean;
  if (clean.includes(",") && clean.includes(".")) normalized = clean.lastIndexOf(",") > clean.lastIndexOf(".") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  else if (clean.includes(",")) normalized = clean.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = /R\$|\bBRL\b/i.test(candidate) ? "BRL" : /US\$|\bUSD\b/i.test(candidate) ? "USD" : candidate.includes("€") ? "EUR" : candidate.includes("£") ? "GBP" : "";
  return { amount, currency, display: amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
}

async function saveSelection(event) {
  event.preventDefault();
  const parsed = parseSelection(document.getElementById("captureAmount").value);
  if (!parsed) return setStatus("Informe um valor único e válido, como 1.899,90.");
  const stored = await chrome.storage.local.get(DATA_KEY);
  const data = stored[DATA_KEY] || { folders: [], items: [] };
  if (!Array.isArray(data.products)) data.products = [];
  const existing = data.items.find(item => normalizeUrl(item.url) === normalizeUrl(pending.url));
  const checkedAt = new Date().toISOString();
  const kind = document.getElementById("captureKind").value;
  const name = document.getElementById("captureName").value.trim() || pending.title || "Produto monitorado";
  if (existing) {
    if (kind === "regular") { existing.regularPrice = parsed; existing.regularPriceObservedAt = checkedAt; }
    else {
      existing.price = { ...parsed, checkedAt, source: "seleção manual", confidence: "confirmed" };
      existing.history = Array.isArray(existing.history) ? existing.history : [];
      existing.history.push({ ...parsed, checkedAt, source: "seleção manual", confidence: "confirmed" });
      existing.history = existing.history.slice(-300);
      delete existing.pendingPriceCandidate;
      delete existing.lastCheckError;
      delete existing.lastCheckErrorAt;
    }
    existing.name = name;
    const productId = existing.productId || existing.productGroupId || existing.id;
    existing.productId = existing.productGroupId = productId;
    let product = data.products.find(row => row.id === productId);
    if (!product) { product = { id: productId, name, folderId: existing.folderId || NO_FOLDER, target: existing.target ?? null, createdAt: new Date().toISOString() }; data.products.push(product); }
    product.name = name;
    data.items.filter(item => (item.productId || item.productGroupId || item.id) === productId).forEach(item => { item.name = name; });
  } else {
    const productId = crypto.randomUUID();
    const folderId = document.getElementById("captureFolder").value;
    data.products.unshift({ id: productId, name, folderId, target: null, createdAt: checkedAt });
    const newItem = { id: crypto.randomUUID(), productId, productGroupId: productId, offerLabel: new URL(pending.url).hostname, name, url: pending.url, folderId, target: null, selector: "", regularPrice: kind === "regular" ? parsed : null, regularPriceObservedAt: kind === "regular" ? checkedAt : null, price: kind === "current" ? { ...parsed, checkedAt, source: "seleção manual", confidence: "confirmed" } : null, history: [] };
    if (newItem.price) newItem.history.push({ ...newItem.price });
    data.items.unshift(newItem);
  }
  await chrome.storage.local.set({ [DATA_KEY]: data });
  setStatus(kind === "regular" ? "Preço normal salvo no Radar. Você pode fechar esta aba." : "Preço atual salvo no Radar e adicionado ao histórico.");
  document.getElementById("captureForm").classList.add("hidden");
}

function normalizeUrl(value) { try { const url = new URL(value); url.hash = ""; [...url.searchParams.keys()].forEach(key => { if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key); }); url.searchParams.sort(); return url.href; } catch { return String(value || ""); } }
function setStatus(message) { const status = document.getElementById("captureStatus"); status.textContent = message; status.classList.remove("hidden"); }
