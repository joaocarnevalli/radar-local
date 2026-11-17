// Cartão de oferta: preço, desconto, histórico, gráfico e revisão de preço candidato.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

function getDiscountPercent(item) {
  const current = Number(item.price?.amount);
  const regular = Number(item.regularPrice?.amount ?? item.regularPrice);
  const currentCurrency = item.price?.currency || "";
  const regularCurrency = item.regularPrice?.currency || "";
  if (!Number.isFinite(current) || !Number.isFinite(regular) || current <= 0 || regular <= current) return null;
  if (currentCurrency !== regularCurrency) return null;
  return Math.round((1 - current / regular) * 100);
}

function getHistoricalLow(item) {
  const points = Array.isArray(item.history) ? item.history : [];
  const current = item.price;
  if (!current || !Number.isFinite(Number(current.amount)) || Number(current.amount) <= 0 || points.length < 2) return null;
  const sameCurrency = points.filter(point => Number.isFinite(Number(point.amount)) && Number(point.amount) > 0 && (current.currency || "") === (point.currency || ""));
  if (!sameCurrency.length) return null;
  const minimum = Math.min(...sameCurrency.map(point => Number(point.amount)));
  const currentAmount = Number(current.amount);
  const isLow = currentAmount <= minimum * 1.000001;
  return { minimum, isLow, abovePercent: isLow ? 0 : Math.round((currentAmount / minimum - 1) * 100) };
}

function getIncreasePercent(item) {
  const current = item.price;
  if (!current || !Number.isFinite(Number(current.amount)) || Number(current.amount) <= 0) return null;
  const currentTime = Date.parse(current.checkedAt || "");
  const history = Array.isArray(item.history) ? item.history : [];
  let previous = null;
  if (Number.isFinite(currentTime)) {
    previous = [...history].reverse().find(point => {
      const pointTime = Date.parse(point.checkedAt || "");
      return Number.isFinite(pointTime) && pointTime < currentTime;
    }) || null;
  }
  if (!previous && history.length > 1) {
    const latest = history[history.length - 1];
    if (latest.checkedAt !== current.checkedAt || Number(latest.amount) !== Number(current.amount)) previous = latest;
    else previous = history[history.length - 2];
  }
  if (!previous || !Number.isFinite(Number(previous.amount)) || Number(previous.amount) <= 0) return null;
  if ((current.currency || "") !== (previous.currency || "")) return null;
  const difference = (Number(current.amount) / Number(previous.amount) - 1) * 100;
  return difference > 0.05 ? Math.round(difference * 10) / 10 : null;
}

function buildItemCard(item, folderColor = "#9b9b9b", options = {}) {
  const card = document.createElement("article"); card.className = "item-card" + (options.asOffer ? " offer-detail-card" : ""); card.style.setProperty("--folder-color", folderColor);
  const top = document.createElement("div"); top.className = "item-top";
  const name = document.createElement("div"); name.className = "item-name"; name.textContent = options.asOffer ? (item.offerLabel || getSiteHost(item.url)) : item.name; name.title = options.asOffer ? item.name : item.name;
  const priceBlock = document.createElement("div"); priceBlock.className = "price-block";
  const price = document.createElement("div"); price.className = "price"; price.textContent = item.price ? formatPrice(item.price.amount, item.price.currency) : "Sem preço";
  const correctPrice = document.createElement("button"); correctPrice.type = "button"; correctPrice.className = "price-correct"; correctPrice.textContent = "Corrigir"; correctPrice.title = "Corrigir o preço atual manualmente";
  correctPrice.addEventListener("click", async () => {
    const value = await radarPrompt("Corrigir preço atual", { message: "O valor fica registrado no histórico como correção manual.", value: item.price ? formatPrice(item.price.amount, item.price.currency) : "", placeholder: "Ex.: 1.899,90", inputMode: "decimal", validate: text => { const amount = parseUserPrice(text); return amount && amount.amount > 0 ? "" : "Informe um preço válido, como 1.899,90."; } });
    if (value === null) return;
    const parsed = parseUserPrice(value);
    if (!parsed || parsed.amount <= 0) return showToast("Informe um preço válido, como 1.899,90.", true);
    const checkedAt = new Date().toISOString();
    const currency = parsed.currency || item.price?.currency || "";
    if (item.price && Math.round(item.price.amount * 100) !== Math.round(parsed.amount * 100)) { delete item.autoSelector; delete item.autoSelectorAt; }
    item.price = { ...parsed, currency, checkedAt, source: "correção manual", confidence: "confirmed" };
    delete item.pendingPriceCandidate;
    delete item.lastCheckError; delete item.lastCheckErrorAt;
    refreshStates.delete(item.id);
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ amount: parsed.amount, currency, checkedAt, source: "correção manual", confidence: "confirmed" });
    if (item.history.length > 300) item.history = item.history.slice(-300);
    await persist(); renderItems(); showToast("Preço corrigido manualmente.");
  });
  const discountPercent = getDiscountPercent(item);
  priceBlock.append(price);
  if (discountPercent !== null) {
    const badge = document.createElement("span"); badge.className = "discount-badge"; badge.textContent = `${discountPercent}% ${item.regularPriceObservedAt === item.price?.checkedAt ? "OFF" : "vs. referência"}`;
    const observedAt = item.regularPriceObservedAt ? ` · detectado em ${formatDate(item.regularPriceObservedAt)}` : "";
    badge.title = item.regularPrice?.amount ? `Comparado ao último preço normal identificado: ${formatPrice(item.regularPrice.amount, item.regularPrice.currency || item.price?.currency)}${observedAt}` : "Desconto calculado sobre o preço normal";
    priceBlock.append(badge);
  }
  const historicalLow = getHistoricalLow(item);
  if (historicalLow) {
    const badge = document.createElement("span"); badge.className = historicalLow.isLow ? "low-price-badge" : "above-low-badge";
    badge.textContent = historicalLow.isLow ? "MENOR REGISTRADO" : `+${historicalLow.abovePercent}% do menor`;
    badge.title = `Comparação com o menor preço deste histórico local: ${formatPrice(historicalLow.minimum, item.price?.currency)}. Não representa desconto sobre o preço normal.`;
    priceBlock.append(badge);
  }
  const increasePercent = getIncreasePercent(item);
  if (increasePercent !== null) {
    const badge = document.createElement("span"); badge.className = "increase-badge"; badge.textContent = `↑ ${increasePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    const previousPoint = item.history?.filter(point => Number.isFinite(Number(point.amount))).slice(-2)[0];
    badge.title = previousPoint ? `Aumento em relação à verificação anterior: ${formatPrice(previousPoint.amount, previousPoint.currency || item.price?.currency)}` : "Aumento em relação ao registro anterior";
    priceBlock.append(badge);
  }
  priceBlock.append(correctPrice);
  top.append(name, priceBlock); card.append(top);
  const link = document.createElement("a"); link.className = "item-url"; link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = item.url; link.title = item.url; card.append(link);
  const meta = document.createElement("div"); meta.className = "item-meta";
  const last = item.price?.checkedAt ? `Verificado ${formatDate(item.price.checkedAt)}` : "Ainda não verificado";
  meta.textContent = `${last}${!options.asOffer && item.target != null ? ` · alvo ${formatPrice(item.target, item.price?.currency)}` : ""}`;
  if (item.target != null && item.price && item.price.amount <= item.target) meta.classList.add("drop");
  card.append(meta);
  if (settings.priceSourceEnabled && item.price?.source) {
    const provenance = document.createElement("div"); provenance.className = "price-provenance";
    const confidence = item.price.confidence === "corroborated" ? `corroborado por ${item.price.corroboratingSources?.length || 2} fontes` : item.price.confidence === "high" ? "alta" : item.price.confidence === "medium" ? "média" : item.price.confidence === "low" ? "baixa" : item.price.confidence === "confirmed" ? "confirmada manualmente" : "não informada";
    provenance.textContent = `Origem: ${item.price.source} · confiança ${confidence}`;
    card.append(provenance);
  }
  if (item.pendingPriceCandidate) {
    const candidate = item.pendingPriceCandidate;
    const review = document.createElement("div"); review.className = "price-review";
    const message = document.createElement("div"); message.textContent = `${candidate.reason || candidate.reviewReason || "Confirme esta leitura."} Candidato: ${formatPrice(candidate.amount, candidate.currency)}. O preço salvo foi mantido.`;
    const actions = document.createElement("div"); actions.className = "row-actions";
    const accept = document.createElement("button"); accept.className = "primary"; accept.type = "button"; accept.textContent = "Aceitar preço";
    accept.addEventListener("click", () => acceptPriceCandidate(item));
    const discard = document.createElement("button"); discard.className = "secondary"; discard.type = "button"; discard.textContent = "Descartar";
    discard.addEventListener("click", async () => { if (candidate.source === "elemento memorizado") { delete item.autoSelector; delete item.autoSelectorAt; } delete item.pendingPriceCandidate; await persist(); renderItems(); showToast("Preço candidato descartado."); });
    actions.append(accept, discard); review.append(message, actions); card.append(review);
  }
  if (item.lastCheckError) {
    const error = document.createElement("div"); error.className = "item-meta check-error";
    error.textContent = "Falha na verificação; último preço mantido.";
    error.title = `${item.lastCheckError}${item.lastCheckErrorAt ? ` · ${formatDate(item.lastCheckErrorAt)}` : ""}`;
    card.append(error);
  }
  const controls = document.createElement("div"); controls.className = "item-controls";
  let targetLabel = null, folderLabel = null;
  if (!options.asOffer) {
    targetLabel = document.createElement("label"); targetLabel.textContent = "Preço-alvo";
    const targetInput = document.createElement("input"); targetInput.inputMode = "decimal"; targetInput.placeholder = "Opcional"; targetInput.value = item.target ?? "";
    targetInput.addEventListener("change", async () => { const value = parseUserPrice(targetInput.value)?.amount ?? null; getProductSiblings(item).forEach(sibling => { sibling.target = value; }); await persist(); renderItems(); });
    targetLabel.append(targetInput);
    folderLabel = document.createElement("label"); folderLabel.textContent = "Pasta";
    const folderSelect = document.createElement("select"); fillFolderSelect(folderSelect, item.folderId || NO_FOLDER, true);
    folderSelect.addEventListener("change", async () => { getProductSiblings(item).forEach(sibling => { sibling.folderId = folderSelect.value; }); await persist(); renderAll(); }); folderLabel.append(folderSelect); syncFolderPicker(folderSelect);
  }
  const refresh = document.createElement("button"); refresh.className = (options.asOffer ? "secondary" : "primary") + " item-refresh" + (isBatchUpdating ? " is-loading" : ""); refresh.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 8A6.3 6.3 0 0 0 5.1 5.2L3.5 7M3.5 7V3.8M3.5 7h3.2M3.8 12A6.3 6.3 0 0 0 14.9 14.8l1.6-1.8m0 0v3.2m0-3.2h-3.2"/></svg>'; refresh.title = isBatchUpdating ? "Atualização em andamento" : "Atualizar preço"; refresh.setAttribute("aria-label", refresh.title); refresh.disabled = isBatchUpdating;
  refresh.addEventListener("click", () => refreshPrice(item, refresh));
  const remove = document.createElement("button"); remove.type = "button"; remove.className = `icon-action danger${options.asOffer ? " offer-remove-action" : ""}`; remove.textContent = "×"; remove.title = options.asOffer ? "Remover esta loja" : "Remover item"; remove.setAttribute("aria-label", `Remover ${item.offerLabel || getSiteHost(item.url)}`);
  remove.addEventListener("click", async event => { event.preventDefault(); event.stopPropagation(); if (!await radarConfirm("O histórico local desta loja também será apagado.", { title: `Remover “${item.offerLabel || getSiteHost(item.url)}”?`, confirmLabel: "Remover", danger: true })) return; data.items = data.items.filter(row => row.id !== item.id); await persist(); renderAll(); });
  if (targetLabel) controls.append(targetLabel, folderLabel);
  if (options.asOffer) {
    const preferences = document.createElement("div"); preferences.className = "offer-preferences";
    const stockLabel = document.createElement("label"); stockLabel.className = "stock-select-label"; stockLabel.append(document.createTextNode("Estoque"));
    const stock = document.createElement("select"); stock.className = "stock-select";
    const detected = item.availabilityDetected === "in-stock" ? "disponível" : item.availabilityDetected === "out-of-stock" ? "esgotado" : "sem informação";
    [["auto", `Automático (${detected})`], ["in-stock", "Disponível"], ["out-of-stock", "Esgotado"]].forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; stock.append(option); });
    stock.value = item.availabilityMode === "manual" && ["in-stock", "out-of-stock"].includes(item.availability) ? item.availability : "auto";
    stock.addEventListener("change", async () => {
      if (stock.value === "auto") { item.availabilityMode = "auto"; item.availability = item.availabilityDetected || "unknown"; }
      else { item.availabilityMode = "manual"; item.availability = stock.value; }
      await persist(); renderItems();
    });
    stockLabel.append(stock);
    const mute = document.createElement("label"); mute.className = "offer-mute-toggle";
    const muteInput = document.createElement("input"); muteInput.type = "checkbox"; muteInput.checked = item.alertsMuted === true; muteInput.addEventListener("change", async () => { item.alertsMuted = muteInput.checked; await persist(); });
    mute.title = "Silenciar alertas desta loja";
    mute.append(muteInput, document.createTextNode("Silenciar loja"));
    preferences.append(stockLabel, mute, refresh);
    preferences.append(remove);
    card.append(preferences);
  } else controls.append(refresh, remove);
  if (!options.asOffer) card.append(controls);
  const history = document.createElement("details"); history.className = "history";
  const summary = document.createElement("summary"); summary.textContent = `Histórico (${item.history?.length || 0} registros)`; history.append(summary);
  history.addEventListener("toggle", () => {
    if (!history.open || !settings.priceHistoryChartEnabled || history.querySelector(".history-chart")) return;
    const chart = buildHistoryChart(item);
    if (chart) history.insertBefore(chart, history.children[1] || null);
  });
  [...(item.history || [])].slice(-8).reverse().forEach(point => {
    const historyKey = RadarData.pointKey(point);
    const entry = document.createElement("div"); entry.className = "history-entry";
    const date = document.createElement("span"); date.className = "history-date"; date.textContent = formatDate(point.checkedAt);
    const value = document.createElement("span"); value.className = "history-value"; value.textContent = `${formatPrice(point.amount, point.currency)} · ${point.source || "página"}`;
    const removePoint = document.createElement("button"); removePoint.type = "button"; removePoint.className = "history-remove"; removePoint.textContent = "×"; removePoint.title = "Remover este registro"; removePoint.setAttribute("aria-label", "Remover este registro do histórico");
    removePoint.addEventListener("click", async () => { if (!await radarConfirm(`${formatPrice(point.amount, point.currency)} · ${formatDate(point.checkedAt)}`, { title: "Remover este registro do histórico?", confirmLabel: "Remover", danger: true })) return; item.history = item.history.filter(row => RadarData.pointKey(row) !== historyKey); await persist(); renderItems(); });
    entry.append(date, value, removePoint); history.append(entry);
  });
  card.append(history);
  const selectorDetails = document.createElement("details"); selectorDetails.className = "selector-disclosure"; selectorDetails.open = Boolean(item.selector);
  const selectorSummary = document.createElement("summary"); selectorSummary.textContent = "Seletor CSS (avançado)";
  const selectorLabel = document.createElement("label"); selectorLabel.className = "selector-label"; selectorLabel.textContent = "Seletor do preço atual";
  const selectorInput = document.createElement("input"); selectorInput.placeholder = "Ex.: [itemprop='price']"; selectorInput.value = item.selector || "";
  selectorInput.addEventListener("change", async () => { item.selector = selectorInput.value.trim(); await persist(); showToast("Seletor salvo."); });
  selectorLabel.append(selectorInput); selectorDetails.append(selectorSummary, selectorLabel);
  const profileHint = document.createElement("small"); profileHint.className = "selector-profile-hint";
  const siteProfile = getSiteProfile(item.url);
  profileHint.textContent = !item.selector && siteProfile ? `Usando perfil de ${siteProfile.host}.` : `Domínio: ${getSiteHost(item.url) || "desconhecido"}.`;
  const saveProfile = document.createElement("button"); saveProfile.type = "button"; saveProfile.className = "secondary save-profile-button"; saveProfile.textContent = "Salvar seletor como perfil do site";
  saveProfile.addEventListener("click", async () => {
    const selector = selectorInput.value.trim();
    if (!selector) return showToast("Informe primeiro um seletor CSS.", true);
    const host = getSiteHost(item.url);
    const profile = data.siteProfiles.find(row => row.host === host);
    if (profile) { profile.selector = selector; profile.updatedAt = new Date().toISOString(); }
    else data.siteProfiles.push({ host, selector, updatedAt: new Date().toISOString() });
    await persist(); renderSettings(); showToast(`Seletor salvo para ${host}; produtos podem reutilizá-lo.`);
  });
  selectorDetails.append(profileHint, saveProfile); card.append(selectorDetails);
  return card;
}

async function acceptPriceCandidate(item) {
  const candidate = item.pendingPriceCandidate;
  if (!candidate) return;
  const prior = item.price;
  const alert = evaluatePriceAlert(item, candidate, settings);
  item.price = { amount: candidate.amount, currency: candidate.currency || "", checkedAt: candidate.checkedAt, source: candidate.source, confidence: "confirmed", corroboratingSources: candidate.corroboratingSources || [] };
  if (candidate.regularPrice && Number(candidate.regularPrice.amount) > Number(candidate.amount) && (!candidate.regularPrice.currency || !candidate.currency || candidate.regularPrice.currency === candidate.currency)) {
    item.regularPrice = candidate.regularPrice;
    item.regularPriceObservedAt = candidate.checkedAt;
  }
  item.history = Array.isArray(item.history) ? item.history : [];
  item.history.push({ ...item.price });
  if (item.history.length > 300) item.history = item.history.slice(-300);
  if (candidate.locator && !item.selector) { item.autoSelector = candidate.locator; item.autoSelectorAt = candidate.checkedAt; }
  delete item.pendingPriceCandidate;
  delete item.lastCheckError;
  delete item.lastCheckErrorAt;
  await persist(); renderItems();
  if ((settings.priceAlertsEnabled || settings.priceAlertSoundEnabled) && alert) sendPriceAlert({ ...alert, itemId: item.id, itemName: item.name, price: formatPrice(candidate.amount, candidate.currency) });
  showToast(`Preço candidato aceito: ${formatPrice(candidate.amount, candidate.currency)}${prior ? ` (antes ${formatPrice(prior.amount, prior.currency)})` : ""}.`);
}

function buildHistoryChart(item) {
  const points = (item.history || []).filter(point => Number.isFinite(Number(point.amount)) && Number(point.amount) > 0 && (point.currency || "") === (item.price?.currency || "")).slice(-60);
  if (points.length < 2) return null;
  const wrap = document.createElement("div"); wrap.className = "history-chart";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 300 72"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `Histórico recente de ${item.name}`);
  const values = points.map(point => Number(point.amount));
  const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || Math.max(max * 0.05, 1);
  const coords = values.map((value, index) => ({ x: 5 + index * 290 / (values.length - 1), y: 62 - (value - min) / spread * 52 }));
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "));
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "var(--accent)"); path.setAttribute("stroke-width", "2"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  const last = coords.at(-1); const dot = document.createElementNS(svg.namespaceURI, "circle"); dot.setAttribute("cx", last.x); dot.setAttribute("cy", last.y); dot.setAttribute("r", "3"); dot.setAttribute("fill", "var(--accent)"); svg.append(dot);
  const caption = document.createElement("div"); caption.className = "chart-caption"; caption.textContent = `Menor nos pontos exibidos: ${formatPrice(min, points.find(point => Number(point.amount) === min)?.currency || item.price?.currency)} · ${points.length} registros recentes`;
  wrap.append(svg, caption); return wrap;
}
