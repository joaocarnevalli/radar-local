// Lista de produtos: filtros, cartões de produto, ofertas e criação de produto.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

function renderItems() {
  const root = document.getElementById("itemsList");
  root.replaceChildren();
  const activeProducts = data.products.filter(product => !product.archived);
  const archivedProducts = data.products.filter(product => product.archived);
  const search = document.getElementById("productSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filter = document.getElementById("productFilter").value;
  const sort = document.getElementById("productSort").value;
  const offersByProduct = new Map();
  data.items.forEach(item => {
    const productId = item.productId || item.productGroupId;
    if (!offersByProduct.has(productId)) offersByProduct.set(productId, []);
    offersByProduct.get(productId).push(item);
  });
  const productOffers = product => offersByProduct.get(product.id) || [];
  const textMatches = product => {
    if (!search) return true;
    return [product.name, ...productOffers(product).flatMap(item => [item.offerLabel, item.url, getSiteHost(item.url)])]
      .some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(search));
  };
  const filterMatches = product => {
    const offers = productOffers(product);
    if (filter === "stale") return offers.some(item => item.lastCheckError || isItemStale(item));
    if (filter === "target") return offers.some(item => item.target != null && item.price && Number(item.price.amount) <= Number(item.target));
    if (filter === "available") return offers.some(item => item.availability === "in-stock");
    if (filter === "out") return offers.some(item => item.availability === "out-of-stock");
    return true;
  };
  const visibleProducts = activeProducts.filter(product => textMatches(product) && filterMatches(product));
  const visibleArchived = filter === "all" ? archivedProducts.filter(textMatches) : [];
  const activeIds = new Set(visibleProducts.map(product => product.id));
  const total = data.items.filter(item => activeIds.has(item.productId || item.productGroupId)).length;
  const productCount = visibleProducts.length;
  const summary = document.getElementById("itemsSummary");
  const activeControls = Boolean(search || filter !== "all");
  summary.textContent = activeControls
    ? `${productCount} de ${activeProducts.length} produtos · ${total} ${total === 1 ? "URL" : "URLs"}`
    : `${productCount} ${productCount === 1 ? "produto" : "produtos"} · ${total} ${total === 1 ? "URL" : "URLs"} · ${data.folders.length} ${data.folders.length === 1 ? "pasta" : "pastas"}`;
  const emptyState = document.getElementById("emptyState");
  emptyState.textContent = activeControls ? "Nenhum produto corresponde à busca ou aos filtros." : "Nenhum produto ainda. Adicione uma página ou crie um produto para começar.";
  const hasVisibleFolder = !activeControls && data.folders.length > 0;
  emptyState.classList.toggle("hidden", productCount > 0 || visibleArchived.length > 0 || hasVisibleFolder);
  if (!productCount && !hasVisibleFolder && !visibleArchived.length) { updateRefreshAllButton(); return; }

  const groups = data.folders.map((folder, index) => ({ id: folder.id, name: folder.name, color: getFolderColor(folder, index), products: visibleProducts.filter(product => (product.folderId || NO_FOLDER) === folder.id) }));
  const unfiled = visibleProducts.filter(product => (product.folderId || NO_FOLDER) === NO_FOLDER || !data.folders.some(folder => folder.id === product.folderId));
  if (unfiled.length) groups.push({ id: NO_FOLDER, name: "Sem pasta", color: "#9b9b9b", products: unfiled });

  const getComparablePrice = product => {
    const offers = productOffers(product).filter(item => item.availability !== "out-of-stock" && Number(item.price?.amount) > 0);
    const currency = offers.find(item => item.price?.currency)?.price.currency || "";
    const comparable = offers.filter(item => (item.price.currency || "") === currency);
    return comparable.length ? Math.min(...comparable.map(item => Number(item.price.amount))) : Infinity;
  };
  const latestCheck = product => Math.max(0, ...productOffers(product).map(item => Date.parse(item.price?.checkedAt || "") || 0));
  const productSort = (a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    if (sort === "price") return getComparablePrice(a) - getComparablePrice(b) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    if (sort === "updated") return latestCheck(b) - latestCheck(a) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    if (sort === "target") return (a.target == null ? Infinity : Number(a.target)) - (b.target == null ? Infinity : Number(b.target)) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  };
  groups.forEach(group => group.products.sort(productSort));
  groups.sort((a, b) => {
    if (sort === "folder") return b.products.length - a.products.length || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    if (!a.products.length || !b.products.length) return a.products.length ? -1 : b.products.length ? 1 : a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    return productSort(a.products[0], b.products[0]);
  });
  if (activeControls) {
    for (let index = groups.length - 1; index >= 0; index -= 1) if (!groups[index].products.length) groups.splice(index, 1);
  }

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
      .sort(productSort)
      .forEach(product => cards.append(buildProductCard(product, productOffers(product), groupData.color)));
    else { const empty = document.createElement("div"); empty.className = "folder-empty"; empty.textContent = "Nenhum item nesta pasta ainda."; cards.append(empty); }
    section.append(cards); root.append(section);
  });
  if (visibleArchived.length) {
    const archive = document.createElement("details"); archive.className = "archive-section";
    const heading = document.createElement("summary"); heading.textContent = "Arquivados (" + visibleArchived.length + ")";
    const cards = document.createElement("div"); cards.className = "archive-list";
    [...visibleArchived].sort(productSort).forEach(product => cards.append(buildProductCard(product, productOffers(product), "#777777", true)));
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
  const mixedCurrencies = new Set(offers.filter(item => item.price).map(item => item.price.currency || "")).size > 1;
  const comparable = mixedCurrencies ? [] : priced.filter(item => (item.price.currency || "") === firstCurrency);
  comparable.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
  const best = comparable[0];
  const known = offers.filter(item => item.price && Number(item.price.amount) > 0 && item.availability !== "out-of-stock").sort((a, b) => (Date.parse(b.price.checkedAt) || 0) - (Date.parse(a.price.checkedAt) || 0))[0];
  const summaryOffer = best || known;
  const source = document.createElement("span"); source.className = "product-best-source";
  if (summaryOffer) {
    const sourceName = summaryOffer.offerLabel || getSiteHost(summaryOffer.url);
    source.append(document.createTextNode(offers.length + (offers.length === 1 ? " loja · " : " lojas · ") + (mixedCurrencies ? "moedas diferentes · " : best ? "menor atual " : "último preço conhecido ")));
    const sourceLink = document.createElement("a"); sourceLink.href = summaryOffer.url; sourceLink.target = "_blank"; sourceLink.rel = "noopener noreferrer"; sourceLink.className = "best-source-link"; sourceLink.title = `Abrir oferta em ${sourceName}`;
    sourceLink.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); chrome.tabs.create({ url: summaryOffer.url }); });
    appendStoreIcon(sourceLink, summaryOffer);
    sourceLink.append(document.createTextNode(sourceName));
    source.append(sourceLink);
  } else source.textContent = `${offers.length} ${offers.length === 1 ? "loja" : "lojas"} · ${offers.length ? "preço ainda não lido" : "adicione a primeira URL"}`;
  const priceWrap = document.createElement("span"); priceWrap.className = "product-summary-price-wrap";
  const price = document.createElement("span"); price.className = "product-summary-price"; price.textContent = summaryOffer ? formatPrice(summaryOffer.price.amount, summaryOffer.price.currency) : "—"; priceWrap.append(price);
  if (summaryOffer) {
    const checkState = itemRefreshState(summaryOffer);
    if (checkState || !isItemFresh(summaryOffer)) {
      const status = document.createElement("small");
      status.className = "freshness-badge " + (checkState?.state === "error" || summaryOffer.lastCheckError ? "failed" : checkState?.state === "review" || !best ? "stale" : "fresh");
      status.textContent = checkState?.state === "loading" ? "atualizando…"
        : checkState?.state === "review" ? "revisar preço"
          : checkState?.state === "success" ? "atualizado agora"
            : summaryOffer.lastCheckError ? "falha recente"
              : "desatualizado";
      priceWrap.append(status);
    }
  }
  const historyCompare = best ? getHistoricalLow(best) : null;
  if (historyCompare) {
    const badge = document.createElement("small"); badge.className = historyCompare.isLow ? "product-low-badge" : "product-above-low-badge";
    badge.textContent = historyCompare.isLow ? "MENOR HISTÓRICO" : `+${historyCompare.abovePercent}% do menor`;
    badge.title = `Comparação com o menor registrado nesta loja (${best.offerLabel || getSiteHost(best.url)}): ${formatPrice(historyCompare.minimum, best.price.currency)}.`;
    priceWrap.append(badge);
  }
  identity.append(titleWrap, source);
  summary.append(arrow, identity, priceWrap);
  card.append(summary);
  card.addEventListener("toggle", () => {
    if (card.open) { expandedProducts.add(product.id); void cacheFavicons(offers); }
    else expandedProducts.delete(product.id);
  });

  const body = document.createElement("div"); body.className = "product-card-body";
  body.append(buildProductSettings(product, offers, archived));
  if (offers.length > 1 && !archived) {
    const refreshRow = document.createElement("div"); refreshRow.className = "product-refresh-row";
    const refreshLabel = document.createElement("span"); refreshLabel.textContent = `${offers.length} lojas neste produto`;
    const refreshOffers = document.createElement("button");
    refreshOffers.type = "button";
    refreshOffers.className = "icon-button product-refresh-all" + (productRefreshStates.has(product.id) ? " is-loading" : "");
    refreshOffers.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 8A6.3 6.3 0 0 0 5.1 5.2L3.5 7M3.5 7V3.8M3.5 7h3.2M3.8 12A6.3 6.3 0 0 0 14.9 14.8l1.6-1.8m0 0v3.2m0-3.2h-3.2"/></svg>';
    refreshOffers.title = `Atualizar as ${offers.length} lojas deste produto`;
    refreshOffers.setAttribute("aria-label", refreshOffers.title);
    refreshOffers.disabled = isBatchUpdating || productRefreshStates.has(product.id);
    refreshOffers.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void refreshProductOffers(product, offers);
    });
    refreshRow.append(refreshLabel, refreshOffers);
    body.append(refreshRow);
  }
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
    const parsed = parseUserPrice(target.value);
    if (target.value.trim() && !parsed) { target.value = product.target ?? ""; return showToast("Preço-alvo inválido. O valor anterior foi mantido.", true); }
    product.target = parsed?.amount ?? null;
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
  folderLabel.append(folder); syncFolderPicker(folder);
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "icon-action danger delete-product"; remove.textContent = "×"; remove.title = "Excluir produto"; remove.setAttribute("aria-label", "Excluir produto");
  remove.addEventListener("click", async () => {
    const offerCount = offers.length ? `${offers.length} ${offers.length === 1 ? "URL" : "URLs"}` : "nenhuma URL";
    if (!await radarConfirm(`${offerCount[0].toUpperCase() + offerCount.slice(1)} e os históricos associados também serão apagados.`, { title: `Excluir “${product.name}”?`, confirmLabel: "Excluir", danger: true })) return;
    data.products = data.products.filter(row => row.id !== product.id);
    data.items = data.items.filter(item => (item.productId || item.productGroupId) !== product.id);
    expandedProducts.delete(product.id); await persist(); renderAll();
  });
  const mute = document.createElement("label"); mute.className = "product-mute-toggle";
  const muteInput = document.createElement("input"); muteInput.type = "checkbox"; muteInput.checked = product.alertsMuted === true;
  muteInput.addEventListener("change", async () => { product.alertsMuted = muteInput.checked; await persist(); });
  mute.append(muteInput, document.createTextNode("Silenciar alertas deste produto"));
  const archiveButton = document.createElement("button"); archiveButton.type = "button"; archiveButton.className = "secondary archive-product"; archiveButton.textContent = archived ? "Restaurar" : "✓ Comprado"; archiveButton.title = archived ? "Restaurar produto aos monitorados" : "Marcar como comprado e arquivar";
  archiveButton.addEventListener("click", async () => {
    const previous = { archived: product.archived, archiveReason: product.archiveReason, archivedAt: product.archivedAt };
    product.archived = !archived;
    product.archiveReason = archived ? "" : "purchased";
    product.archivedAt = archived ? null : new Date().toISOString();
    await persist();
    renderItems();
    showToast(archived ? "Produto restaurado." : "Produto marcado como comprado e arquivado.", false, {
      label: "Desfazer",
      run: async () => {
        const current = data.products.find(row => row.id === product.id);
        if (!current) return;
        Object.assign(current, previous);
        await persist();
        renderItems();
      }
    });
  });
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
  details.dataset.itemId = item.id;
  const summary = document.createElement("summary"); summary.className = "offer-summary";
  const arrow = document.createElement("span"); arrow.className = "offer-arrow"; arrow.setAttribute("aria-hidden", "true");
  const offerCard = buildItemCard(item, folderColor, { asOffer: true });
  const store = document.createElement("strong"); store.className = "offer-store"; store.textContent = item.offerLabel || getSiteHost(item.url);
  const renameStore = document.createElement("button"); renameStore.type = "button"; renameStore.className = "product-edit-button offer-edit-button"; renameStore.title = "Editar nome desta loja"; renameStore.setAttribute("aria-label", "Editar nome desta loja");
  renameStore.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 2.1 3 3M2 14l3.2-.7L13.7 4.8a1.6 1.6 0 0 0-2.3-2.3L2.9 11 2 14Z"/></svg>';
  renameStore.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); startOfferRename(store.parentElement, item); });
  const price = document.createElement("strong"); price.className = "offer-price"; price.textContent = item.price ? formatPrice(item.price.amount, item.price.currency) : "Sem preço";
  const priceWrap = document.createElement("span"); priceWrap.className = "offer-summary-price-wrap"; priceWrap.append(price);
  const correctPrice = document.createElement("button"); correctPrice.type = "button"; correctPrice.className = "offer-price-edit"; correctPrice.title = "Corrigir preço manualmente"; correctPrice.setAttribute("aria-label", correctPrice.title);
  correctPrice.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 2.1 3 3M2 14l3.2-.7L13.7 4.8a1.6 1.6 0 0 0-2.3-2.3L2.9 11 2 14Z"/></svg>';
  correctPrice.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); details.querySelector(".price-correct")?.click(); });
  const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = "offer-open-link"; link.textContent = "↗"; link.title = `Abrir ${item.offerLabel || getSiteHost(item.url)}`; link.setAttribute("aria-label", link.title);
  link.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); chrome.tabs.create({ url: item.url }); });
  const left = document.createElement("span"); left.className = "offer-summary-copy";
  const storeLine = document.createElement("span"); storeLine.className = "offer-summary-storeline"; appendStoreIcon(storeLine, item); storeLine.append(store, renameStore);
  const checkState = itemRefreshState(item);
  const freshness = document.createElement("small");
  freshness.className = "freshness-badge " + (checkState?.state === "error" || item.lastCheckError ? "failed" : checkState?.state === "review" ? "stale" : checkState?.state === "success" ? "fresh" : isItemStale(item) ? "stale" : item.price ? "fresh" : "unknown");
  freshness.textContent = checkState?.state === "loading" ? "atualizando preço…"
    : checkState?.state === "review" ? "preço precisa de revisão"
      : checkState?.state === "success" ? "atualizado agora"
        : item.lastCheckError ? "falha · último preço mantido"
          : isItemStale(item) ? (item.price ? "preço desatualizado" : "sem preço verificado") : "preço recente";
  left.append(storeLine, freshness);
  details.addEventListener("toggle", () => { if (details.open) expandedOffers.add(item.id); else expandedOffers.delete(item.id); });
  if (["in-stock", "out-of-stock"].includes(item.availability)) { const stock = document.createElement("small"); stock.className = "stock-badge " + (item.availability === "out-of-stock" ? "out" : "in"); stock.textContent = item.availability === "out-of-stock" ? "esgotado" : "disponível"; stock.title = item.availabilityMode === "manual" ? "Marcado manualmente" : "Detectado na última leitura"; priceWrap.append(stock); }
  summary.append(arrow, left, priceWrap, correctPrice, link); details.append(summary, offerCard); return details;
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
      name: product.name, url: RadarData.canonicalUrl(normalizedUrl.href) || normalizedUrl.href, folderId: product.folderId || NO_FOLDER,
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
  button.title = isBatchUpdating ? "Atualização em lote em andamento" : eligible.length ? `Atualizar as ${eligible.length} URLs ativas` : "Adicione um item para habilitar a atualização";
  button.setAttribute("aria-label", button.title);
}
