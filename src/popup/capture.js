// Captura da página atual: leitura do preço na aba e cadastro do produto.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

async function inspectCurrentTab() {
  let tab;
  const params = new URLSearchParams(location.search);
  const sourceTab = Number(params.get("sourceTab"));
  const detached = floatingWindowMode || params.get("dashboard") === "1";
  if (detached && sourceTab > 0) tab = await chrome.tabs.get(sourceTab).catch(() => null);
  if (!tab && detached) {
    const tabs = await chrome.tabs.query({ windowType: "normal" });
    tab = tabs.filter(candidate => RadarData.url(candidate.url)).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  } else if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const button = document.getElementById("captureButton");
  if (!tab?.id || !RadarData.url(tab.url)) {
    currentPage = null; button.disabled = true;
    document.getElementById("pageSummary").textContent = "Abra uma página de produto no navegador para monitorar.";
    return;
  }
  button.disabled = false;
  currentPage = { title: tab.title || "", url: tab.url, tabId: tab.id, price: null };
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/shared/money.js", "src/shared/price-extractor.js"] });
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: selector => extractPageInfo(selector, {}), args: [getSiteProfile(tab.url)?.selector || ""] });
    currentPage = { ...result.result, url: tab.url, tabId: tab.id };
    document.getElementById("pageSummary").textContent = (currentPage.title || new URL(tab.url).hostname) + " · " + (currentPage.price ? formatPrice(currentPage.price.amount, currentPage.price.currency) : "preço não detectado");
  } catch {
    document.getElementById("pageSummary").textContent = (tab.title || new URL(tab.url).hostname) + " · conceda acesso para ler o preço ou informe-o manualmente.";
  }
}

async function onCaptureClick() {
  if (currentPage?.url && !currentPage.price) {
    const allowed = await chrome.permissions.request({ origins: [new URL(currentPage.url).origin + "/*"] });
    if (allowed) await inspectCurrentTab();
  }
  if (!currentPage) return showToast("Abra uma página de produto ou curso no Chrome.", true);
  document.getElementById("itemName").value = currentPage.title || "";
  document.getElementById("itemPrice").value = currentPage.price ? String(currentPage.price.amount).replace(".", ",") : "";
  document.getElementById("itemTarget").value = "";
  document.getElementById("itemSelector").value = "";
  const profile = getSiteProfile(currentPage.url);
  document.getElementById("itemSelector").placeholder = profile ? `Perfil de ${profile.host} disponível` : "Ex.: [itemprop='price']";
  fillFolderSelect(document.getElementById("itemFolder"), settings.defaultFolderId, true);
  document.getElementById("captureReview").classList.toggle("hidden", !currentPage.price?.requiresReview);
  document.getElementById("captureReviewConfirmed").checked = false;
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
  if (document.getElementById("itemPrice").value.trim() && (!price || price.amount <= 0)) return showToast("Informe um preço positivo válido ou deixe o campo vazio.", true);
  if (document.getElementById("itemTarget").value.trim() && !target) return showToast("Informe um preço-alvo válido ou deixe o campo vazio.", true);
  const detectedPrice = currentPage.price;
  const sameAsDetected = Boolean(price && detectedPrice && (!price.currency || price.currency === detectedPrice.currency) && Math.round(price.amount * 100) === Math.round(Number(detectedPrice.amount) * 100));
  if (sameAsDetected && detectedPrice.requiresReview && !document.getElementById("captureReviewConfirmed").checked) return showToast("Confira o preço, a variante e o pagamento no site e marque a confirmação antes de salvar.", true);
  const productId = crypto.randomUUID();
  const checkedAt = new Date().toISOString();
  const folderId = document.getElementById("itemFolder").value;
  const product = { id: productId, name, folderId, target: target?.amount ?? null, createdAt: new Date().toISOString() };
  const entry = {
    id: crypto.randomUUID(), productId, productGroupId: productId, offerLabel: getSiteHost(currentPage.url), name, url: RadarData.canonicalUrl(currentPage.url) || currentPage.url,
    faviconUrl: getSameOriginFaviconUrl(currentPage.url, currentPage.faviconUrl),
    regularPrice: currentPage.regularPrice || null,
    regularPriceObservedAt: currentPage.regularPrice && sameAsDetected ? checkedAt : null,
    folderId,
    target: target?.amount ?? null,
    selector: document.getElementById("itemSelector").value.trim(),
    ...(sameAsDetected && currentPage.locator && !document.getElementById("itemSelector").value.trim() ? { autoSelector: currentPage.locator, autoSelectorAt: checkedAt } : {}),
    availabilityMode: "auto",
    availabilityDetected: ["in-stock", "out-of-stock"].includes(currentPage.availability) ? currentPage.availability : "unknown",
    availability: ["in-stock", "out-of-stock"].includes(currentPage.availability) ? currentPage.availability : "unknown",
    price: sameAsDetected
      ? { ...detectedPrice, requiresReview: false, confidence: detectedPrice.requiresReview ? "confirmed" : detectedPrice.confidence, checkedAt }
      : price
        ? { ...price, currency: price.currency || detectedPrice?.currency || "", checkedAt, source: "entrada manual", confidence: "confirmed" }
        : null,
    history: []
  };
  if (entry.price) entry.history.push({ ...entry.price });
  data.products.unshift(product);
  data.items.unshift(entry);
  await persist();
  document.getElementById("addForm").classList.add("hidden");
  renderAll();
  showToast("Página adicionada localmente.");
}
