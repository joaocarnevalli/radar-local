// Backup: exportação JSON/CSV, importação e mesclagem.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

async function exportBackup() {
  const snapshot = await RadarData.read();
  const savedSettings = await loadSettings();
  const payload = { app: "Radar Local", schemaVersion: 3, exportedAt: new Date().toISOString(), ...snapshot, settings: savedSettings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `radar-local-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Backup JSON exportado.");
}

async function exportCsv() {
  const snapshot = await RadarData.read();
  const escapeCell = value => {
    let text = String(value ?? "");
    if (typeof value === "string" && (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [["Produto", "Status do produto", "Loja", "URL", "Preço registrado", "Moeda", "Preço-alvo", "Data da verificação", "Origem", "Confiança", "Disponibilidade", "Pasta", "Erro da última verificação"]];
  for (const item of snapshot.items) {
    const history = (item.history || []).filter(point => Number.isFinite(Number(point.amount)) && Number(point.amount) > 0);
    if (!history.length && item.price) history.push(item.price);
    const product = snapshot.products.find(row => row.id === (item.productId || item.productGroupId));
    const folder = snapshot.folders.find(row => row.id === item.folderId)?.name || "Sem pasta";
    const availability = item.availability === "in-stock" ? "Disponível" : item.availability === "out-of-stock" ? "Esgotado" : "Não informada";
    for (const point of history) rows.push([item.name, product?.archived ? (product.archiveReason === "purchased" ? "Comprado/arquivado" : "Arquivado") : "Ativo", item.offerLabel || getSiteHost(item.url), item.url, point.amount, point.currency || "", item.target ?? "", point.checkedAt || "", point.source || "", point.confidence || "", availability, folder, item.lastCheckError || ""]);
    if (!history.length) rows.push([item.name, product?.archived ? "Arquivado" : "Ativo", item.offerLabel || getSiteHost(item.url), item.url, "", "", item.target ?? "", "", "", "", availability, folder, item.lastCheckError || ""]);
  }
  const csv = "\uFEFF" + rows.map(row => row.map(escapeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `radar-local-itens-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Lista e histórico exportados para CSV.");
}

async function importBackup(event) {
  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
  try {
    if (file.size > 9 * 1024 * 1024) throw new Error("O backup excede 9 MB. Divida ou reduza o histórico antes de importar.");
    const parsed = JSON.parse(await file.text());
    if (parsed.schemaVersion != null && (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion > 3 || parsed.schemaVersion < 1)) throw new Error("Versão de backup não suportada por esta extensão.");
    const incoming = RadarData.normalize(parsed);
    const mode = document.getElementById("backupImportMode").value;
    if (!await (mode === "merge" ? radarConfirm("Itens com a mesma URL são combinados e os históricos preservados.", { title: "Mesclar este backup com os dados atuais?", confirmLabel: "Mesclar" }) : radarConfirm("Exporte uma cópia antes para poder voltar.", { title: "Substituir todos os dados e preferências pelo backup?", confirmLabel: "Substituir", danger: true }))) return;
    const before = await RadarData.read();
    let nextSettings = null;
    const next = mode === "merge" ? mergeBackupData(incoming, before) : incoming;
    if (mode !== "merge" && parsed.settings && typeof parsed.settings === "object") nextSettings = normalizeSettings(parsed.settings);
    await RadarData.replace(before, next, nextSettings);
    if (nextSettings) { settings = nextSettings; settingsBaseline = RadarData.clone(settings); }
    await synchronizeData();
    await chrome.runtime.sendMessage({ type: "radar:context-menu" });
    showToast("Backup importado com sucesso.");
  } catch (error) { showOperationError(error); }
}
function mergeBackupData(parsed, current = data) {
  const merged = RadarData.clone(current), incoming = RadarData.normalize(parsed);
  const folderMap = new Map();
  for (const folder of incoming.folders) {
    let match = merged.folders.find(row => row.name.toLowerCase() === folder.name.toLowerCase());
    if (!match) { match = { ...folder, id: merged.folders.some(row => row.id === folder.id) ? crypto.randomUUID() : folder.id }; merged.folders.push(match); }
    folderMap.set(folder.id, match.id);
  }
  const productMap = new Map();
  for (const product of incoming.products) {
    const matches = new Set(incoming.items.filter(item => item.productId === product.id).map(item => merged.items.find(row => normalizeItemUrl(row.url) === normalizeItemUrl(item.url))?.productId).filter(Boolean));
    if (matches.size > 1) throw new Error("O backup reúne URLs que estão em produtos diferentes. Organize esses produtos antes de mesclar.");
    let match = merged.products.find(row => matches.has(row.id));
    if (!match) { match = { ...product, id: merged.products.some(row => row.id === product.id) ? crypto.randomUUID() : product.id, folderId: folderMap.get(product.folderId) || NO_FOLDER }; merged.products.push(match); }
    productMap.set(product.id, match.id);
  }
  for (const item of incoming.items) {
    const existing = merged.items.find(row => normalizeItemUrl(row.url) === normalizeItemUrl(item.url));
    if (!existing) { merged.items.push({ ...item, id: merged.items.some(row => row.id === item.id) ? crypto.randomUUID() : item.id, productId: productMap.get(item.productId), productGroupId: productMap.get(item.productId) }); continue; }
    const history = new Map([...existing.history, ...item.history].map(point => [RadarData.pointKey(point), point]));
    existing.history = [...history.values()].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt)).slice(-300);
    if ((Date.parse(item.price?.checkedAt || "") || 0) > (Date.parse(existing.price?.checkedAt || "") || 0)) existing.price = item.price;
    if (item.regularPrice && (Date.parse(item.regularPriceObservedAt || "") || 0) > (Date.parse(existing.regularPriceObservedAt || "") || 0)) { existing.regularPrice = item.regularPrice; existing.regularPriceObservedAt = item.regularPriceObservedAt; }
  }
  for (const profile of incoming.siteProfiles) if (!merged.siteProfiles.some(row => row.host === profile.host)) merged.siteProfiles.push(profile);
  merged.favicons = { ...incoming.favicons, ...merged.favicons };
  return RadarData.normalize(merged);
}
