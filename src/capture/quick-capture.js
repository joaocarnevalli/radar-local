const DATA_KEY = "radarLocalData";
const NO_FOLDER = "__no_folder__";
let pending, pendingKey, initialPrice, initialRegularPrice, initialName, initialItemId, saving = false;
document.addEventListener("DOMContentLoaded", () => { void init().catch(error => setStatus(error.message)); });

async function init() {
  const token = new URLSearchParams(location.search).get("capture");
  pendingKey = /^[a-f0-9-]{36}$/.test(token || "") ? "radarCapture:" + token : "radarLocalPendingCapture";
  const stored = await chrome.storage.local.get([pendingKey, "radarLocalSettings"]);
  const accentColor = stored.radarLocalSettings?.accentColor;
  if (/^#[0-9a-f]{6}$/i.test(accentColor || "")) document.documentElement.style.setProperty("--accent", accentColor);
  pending = stored[pendingKey];
  if (!RadarData.url(pending?.url)) return setStatus("Seleção não encontrada. Selecione um preço na loja e use o menu do Radar.");
  const data = await RadarData.read();
  const existing = data.items.find(item => RadarData.normalizedUrl(item.url) === RadarData.normalizedUrl(pending.url));
  initialPrice = existing?.price || null;
  initialRegularPrice = existing?.regularPrice || null;
  initialName = existing?.name;
  initialItemId = existing?.id;
  const parsed = RadarMoney.parse(pending.selectionText, existing?.price?.currency || "");
  document.getElementById("captureSelection").value = pending.selectionText || "";
  document.getElementById("captureAmount").value = parsed ? parsed.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  document.getElementById("captureCurrency").value = parsed?.currency || existing?.price?.currency || "";
  document.getElementById("captureUrl").textContent = pending.url;
  document.getElementById("captureName").value = existing?.name || pending.title || new URL(pending.url).hostname;
  const folderSelect = document.getElementById("captureFolder");
  for (const folder of [{ id: NO_FOLDER, name: "Sem pasta" }, ...data.folders]) { const option = document.createElement("option"); option.value = folder.id; option.textContent = folder.name; folderSelect.append(option); }
  folderSelect.value = existing?.folderId || stored.radarLocalSettings?.defaultFolderId || NO_FOLDER;
  if (!folderSelect.value) folderSelect.value = NO_FOLDER;
  document.getElementById("captureFolderLabel").classList.toggle("hidden", Boolean(existing));
  document.getElementById("captureStatus").classList.add("hidden");
  document.getElementById("captureForm").classList.remove("hidden");
  document.getElementById("cancelCapture").addEventListener("click", async () => { await chrome.storage.local.remove(pendingKey); window.close(); });
  document.getElementById("captureForm").addEventListener("submit", saveSelection);
}

async function saveSelection(event) {
  event.preventDefault();
  if (saving) return;
  const currency = document.getElementById("captureCurrency").value.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) return setStatus("Use o código da moeda com três letras, como BRL ou USD.");
  const parsed = RadarMoney.parse(document.getElementById("captureAmount").value, currency);
  if (!parsed) return setStatus("Informe um único valor válido, como 1.899,90.");
  const kind = document.getElementById("captureKind").value;
  const name = document.getElementById("captureName").value.trim();
  if (!name) return setStatus("Informe o nome do produto.");
  saving = true;
  const submit = document.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    await RadarData.update(data => {
      let item = data.items.find(row => RadarData.normalizedUrl(row.url) === RadarData.normalizedUrl(pending.url));
      if (initialItemId && item?.id !== initialItemId) throw new Error("A oferta foi removida ou substituída em outra janela. Abra uma nova captura para adicioná-la novamente.");
      if (item && !RadarData.equal(item.price, initialPrice)) { initialPrice = RadarData.clone(item.price); throw new Error("O preço foi alterado em outra janela. Confira o valor e clique novamente em Salvar para confirmar sua correção."); }
      if (kind === "regular" && item && !RadarData.equal(item.regularPrice, initialRegularPrice)) { initialRegularPrice = RadarData.clone(item.regularPrice); throw new Error("O preço normal mudou em outra janela. Confira o valor antes de salvar novamente."); }
      if (item && initialName !== undefined && item.name !== initialName) { initialName = item.name; document.getElementById("captureName").value = item.name; throw new Error("O nome do produto mudou em outra janela. O formulário foi atualizado; confira antes de salvar novamente."); }
      const checkedAt = new Date().toISOString();
      if (!item) {
        const productId = crypto.randomUUID(), folderId = document.getElementById("captureFolder").value;
        data.products.unshift({ id: productId, name, folderId, target: null, createdAt: checkedAt });
        item = { id: crypto.randomUUID(), productId, productGroupId: productId, offerLabel: new URL(pending.url).hostname, name, url: pending.url, folderId, target: null, selector: "", price: null, regularPrice: null, history: [] };
        data.items.unshift(item);
      }
      const product = data.products.find(row => row.id === item.productId); product.name = name;
      if (kind === "regular") { item.regularPrice = parsed; item.regularPriceObservedAt = checkedAt; }
      else {
        item.price = { ...parsed, currency: parsed.currency || item.price?.currency || "", checkedAt, source: "seleção manual", confidence: "confirmed" };
        item.history.push({ ...item.price }); item.history = item.history.slice(-300);
        delete item.pendingPriceCandidate; delete item.lastCheckError; delete item.lastCheckErrorAt;
      }
    });
    await chrome.storage.local.remove(pendingKey);
    document.getElementById("captureForm").classList.add("hidden");
    setStatus("Preço salvo no Radar. Você pode fechar esta aba.");
  } catch (error) { setStatus(error.message || "Não foi possível salvar. Seus dados anteriores foram mantidos."); }
  finally { saving = false; submit.disabled = false; }
}
function setStatus(message) { const status = document.getElementById("captureStatus"); status.textContent = message; status.classList.remove("hidden"); }
