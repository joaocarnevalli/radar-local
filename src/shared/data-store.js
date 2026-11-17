var RadarData = (() => {
  const KEY = "radarLocalData";
  const SETTINGS = "radarLocalSettings";
  const NO_FOLDER = "__no_folder__";
  const COLLECTIONS = { folders: "id", products: "id", items: "id", siteProfiles: "host" };
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const text = (value, max = 240) => typeof value === "string" ? value.slice(0, max) : "";
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const id = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
  const pointKey = point => JSON.stringify([point.checkedAt, point.amount, point.currency || "", point.source || ""]);
  function url(value) {
    try {
      const parsed = new URL(value);
      return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password && parsed.href.length <= 8192 ? parsed.href : "";
    } catch { return ""; }
  }
  // Forma curta e estável do endereço de um produto (Amazon: /dp/ASIN). Outros sites ficam como estão.
  function canonicalUrl(value) {
    const valid = url(value);
    if (!valid) return "";
    const parsed = new URL(valid);
    if (/(^|\.)amazon\.[a-z.]+$/i.test(parsed.hostname)) {
      const asin = parsed.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1];
      if (asin) return `${parsed.origin}/dp/${asin.toUpperCase()}`;
    }
    return valid;
  }
  function normalizedUrl(value) {
    const valid = canonicalUrl(value);
    if (!valid) return "";
    const parsed = new URL(valid);
    const mercadoLivre = /(^|\.)mercadoli[vb]re\.com(?:\.[a-z]{2})?$/i.test(parsed.hostname) && parsed.pathname.match(/^\/(M[LC][A-Z])-?(\d{6,})/i);
    if (mercadoLivre) return `https://produto.mercadolivre/${mercadoLivre[1].toUpperCase()}${mercadoLivre[2]}`;
    parsed.hash = "";
    [...parsed.searchParams.keys()].forEach(key => { if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) parsed.searchParams.delete(key); });
    parsed.searchParams.sort();
    return parsed.href;
  }
  function price(value) {
    if (value == null) return null;
    if (!object(value) || typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0 || value.amount >= 100000000) throw new Error("Preço inválido nos dados. Nenhuma alteração foi salva.");
    if (Math.round((value.amount + Number.EPSILON) * 100) <= 0) throw new Error("O preço precisa ser de pelo menos 0,01.");
    return {
      amount: Math.round((value.amount + Number.EPSILON) * 100) / 100,
      currency: /^[A-Z]{3}$/.test(value.currency || "") ? value.currency : "",
      ...(date(value.checkedAt) ? { checkedAt: date(value.checkedAt) } : {}),
      source: text(value.source, 80),
      confidence: ["high", "medium", "low", "corroborated", "confirmed", "unknown"].includes(value.confidence) ? value.confidence : "unknown",
      ...(Array.isArray(value.corroboratingSources) ? { corroboratingSources: value.corroboratingSources.filter(v => typeof v === "string").slice(0, 10).map(v => v.slice(0, 80)) } : {}),
      ...(value.requiresReview === true ? { requiresReview: true } : {}),
      ...(value.reviewReason ? { reviewReason: text(value.reviewReason, 400) } : {})
    };
  }
  function target(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 100000000 ? Math.round(value * 100) / 100 : null;
  }
  function icons(value) {
    const output = {}; let bytes = 0;
    if (!object(value)) return output;
    for (const [host, icon] of Object.entries(value)) {
      if (!/^[a-z0-9.-]+$/i.test(host) || !id(host) || typeof icon !== "string" || !/^data:image\/(?:png|jpe?g|webp|gif|avif|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i.test(icon)) continue;
      const size = Math.ceil(icon.length * 0.75);
      if (size > 24576 || bytes + size > 524288) continue;
      output[host] = icon; bytes += size;
    }
    return output;
  }
  function normalize(raw) {
    if (raw == null) return { folders: [], products: [], items: [], siteProfiles: [], favicons: {} };
    if (!object(raw) || !Array.isArray(raw.folders) || !Array.isArray(raw.items)) throw new Error("Estrutura de dados inválida. Importe um backup válido para recuperar.");
    if ((raw.products != null && !Array.isArray(raw.products)) || (raw.siteProfiles != null && !Array.isArray(raw.siteProfiles))) throw new Error("Lista de produtos ou perfis inválida no arquivo.");
    if (raw.items.length > 5000 || raw.folders.length > 1000 || (raw.products?.length || 0) > 5000) throw new Error("O arquivo ultrapassa o limite de produtos ou pastas.");
    const folders = raw.folders.map(row => {
      if (!object(row) || !id(row.id) || !text(row.name).trim()) throw new Error("Pasta inválida no arquivo.");
      return { id: row.id, name: text(row.name).trim(), color: /^#[a-f0-9]{6}$/i.test(row.color || "") ? row.color : "#c6c6c6" };
    });
    const folderId = value => folders.some(folder => folder.id === value) ? value : NO_FOLDER;
    const products = (Array.isArray(raw.products) ? raw.products : []).map(row => {
      if (!object(row) || !id(row.id) || !text(row.name).trim()) throw new Error("Produto inválido no arquivo.");
      return { id: row.id, name: text(row.name).trim(), folderId: folderId(row.folderId), target: target(row.target), createdAt: date(row.createdAt), archived: row.archived === true, alertsMuted: row.alertsMuted === true, archiveReason: row.archiveReason === "purchased" ? "purchased" : "", archivedAt: date(row.archivedAt) };
    });
    const items = raw.items.map(row => {
      if (!object(row) || !id(row.id) || !url(row.url)) throw new Error("Oferta inválida: use uma URL HTTP/HTTPS sem credenciais e um identificador válido.");
      const productId = row.productId || row.productGroupId || row.id;
      if (!id(productId)) throw new Error("Identificador de produto inválido.");
      let product = products.find(p => p.id === productId);
      if (!product) {
        product = { id: productId, name: text(row.name).trim() || "Produto sem nome", folderId: folderId(row.folderId), target: target(row.target), createdAt: date(row.createdAt), archived: false, alertsMuted: false, archiveReason: "", archivedAt: null };
        products.push(product);
      }
      if (row.history != null && !Array.isArray(row.history)) throw new Error("Histórico inválido no arquivo.");
      const history = (row.history || []).slice(-300).map(point => {
        const clean = price(point);
        if (!clean || !clean.checkedAt) throw new Error("Registro de histórico sem preço ou data válida.");
        return clean;
      }).sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
      const item = { id: row.id, productId, productGroupId: productId, name: product.name, folderId: product.folderId, target: product.target,
        url: url(row.url), offerLabel: text(row.offerLabel, 80) || new URL(row.url).hostname, selector: text(row.selector, 1000),
        price: price(row.price), regularPrice: price(typeof row.regularPrice === "number" ? { amount: row.regularPrice } : row.regularPrice),
        regularPriceObservedAt: date(row.regularPriceObservedAt), history, alertsMuted: row.alertsMuted === true,
        availability: ["in-stock", "out-of-stock"].includes(row.availability) ? row.availability : "unknown",
        // Itens antigos com estoque marcado à mão continuam manuais; os demais acompanham a leitura.
        availabilityMode: row.availabilityMode === "manual" || (row.availabilityMode == null && ["in-stock", "out-of-stock"].includes(row.availability)) ? "manual" : "auto",
        availabilityDetected: ["in-stock", "out-of-stock"].includes(row.availabilityDetected) ? row.availabilityDetected : "unknown" };
      if (text(row.autoSelector, 1000).trim()) {
        item.autoSelector = text(row.autoSelector, 1000).trim(); item.autoSelectorAt = date(row.autoSelectorAt);
        const misses = Number(row.autoSelectorMisses);
        if (Number.isInteger(misses) && misses > 0) item.autoSelectorMisses = Math.min(misses, 999);
      }
      if (row.faviconUrl && url(row.faviconUrl) && new URL(row.faviconUrl).origin === new URL(row.url).origin) item.faviconUrl = url(row.faviconUrl);
      if (row.lastCheckError) { item.lastCheckError = text(row.lastCheckError, 500); item.lastCheckErrorAt = date(row.lastCheckErrorAt); }
      if (row.pendingPriceCandidate) {
        item.pendingPriceCandidate = { ...price(row.pendingPriceCandidate), regularPrice: price(row.pendingPriceCandidate.regularPrice), reason: text(row.pendingPriceCandidate.reason || row.pendingPriceCandidate.reviewReason, 400), changePercent: Number.isFinite(row.pendingPriceCandidate.changePercent) ? row.pendingPriceCandidate.changePercent : null, direction: row.pendingPriceCandidate.direction === "drop" ? "drop" : "increase", locator: text(row.pendingPriceCandidate.locator, 1000) };
      }
      return item;
    });
    const siteProfiles = (Array.isArray(raw.siteProfiles) ? raw.siteProfiles : []).map(row => {
      if (!object(row) || typeof row.host !== "string" || !/^[a-z0-9.-]+$/i.test(row.host) || !text(row.selector, 1000)) throw new Error("Perfil de leitura inválido.");
      return { host: row.host.toLowerCase(), selector: text(row.selector, 1000), updatedAt: date(row.updatedAt) };
    });
    const result = { folders, products, items, siteProfiles, favicons: icons(raw.favicons) };
    for (const [collection, key] of Object.entries(COLLECTIONS)) {
      if (new Set(result[collection].map(row => row[key])).size !== result[collection].length) throw new Error("Há identificadores repetidos no arquivo.");
    }
    return result;
  }
  function changes(base, next) {
    const patch = [];
    for (const [collection, key] of Object.entries(COLLECTIONS)) {
      const before = new Map((base[collection] || []).map(row => [row[key], row]));
      const after = new Map((next[collection] || []).map(row => [row[key], row]));
      for (const [rowId, row] of before) if (!after.has(rowId)) patch.push({ collection, id: rowId, remove: true, before: row });
      for (const [rowId, row] of after) {
        if (!before.has(rowId)) { patch.push({ collection, id: rowId, add: clone(row) }); continue; }
        const previous = before.get(rowId);
        for (const field of new Set([...Object.keys(previous), ...Object.keys(row)])) {
          if (!equal(previous[field], row[field])) patch.push({ collection, id: rowId, field, before: clone(previous[field]), after: clone(row[field]) });
        }
      }
    }
    for (const host of new Set([...Object.keys(base.favicons || {}), ...Object.keys(next.favicons || {})])) {
      if (!equal(base.favicons?.[host], next.favicons?.[host])) patch.push({ collection: "favicons", id: host, before: base.favicons?.[host], after: next.favicons?.[host] });
    }
    return patch;
  }
  function apply(current, patch, strict = true) {
    const result = clone(current);
    const conflict = () => { throw new Error("Este dado mudou em outra janela ou atualização. A versão mais recente foi preservada; repita a alteração."); };
    for (const op of patch) {
      if (op.collection === "favicons") { if (op.after === undefined) delete result.favicons[op.id]; else Object.defineProperty(result.favicons, op.id, { value: op.after, enumerable: true, configurable: true, writable: true }); continue; }
      const key = COLLECTIONS[op.collection];
      if (!key || !id(op.id) || ["__proto__", "constructor", "prototype"].includes(op.field)) throw new Error("Alteração inválida.");
      const list = result[op.collection];
      const index = list.findIndex(row => row[key] === op.id);
      if (op.add) { if (index < 0) list.unshift(clone(op.add)); else if (strict && !equal(list[index], op.add)) conflict(); continue; }
      if (op.remove) { if (index >= 0) list.splice(index, 1); continue; }
      if (index < 0) { if (strict) conflict(); else continue; }
      const row = list[index];
      if (op.field === "history") {
        const before = new Map((op.before || []).map(point => [pointKey(point), point]));
        const after = new Map((op.after || []).map(point => [pointKey(point), point]));
        const points = new Map((row.history || []).map(point => [pointKey(point), point]));
        for (const point of before.keys()) if (!after.has(point)) points.delete(point);
        for (const [point, value] of after) if (!before.has(point)) points.set(point, clone(value));
        row.history = [...points.values()].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt)).slice(-300);
      } else {
        if (strict && !equal(row[op.field], op.before) && !equal(row[op.field], op.after)) conflict();
        if (op.after === undefined) delete row[op.field]; else row[op.field] = clone(op.after);
      }
    }
    return result;
  }
  async function write(values) {
    const keys = Object.keys(values);
    const [total, replaced] = await Promise.all([chrome.storage.local.getBytesInUse(null), chrome.storage.local.getBytesInUse(keys)]);
    const bytes = new TextEncoder().encode(JSON.stringify(values)).length;
    // Com unlimitedStorage o navegador não impõe o teto de 10 MB; sem ele, a gravação é recusada antes de estourar.
    const unlimited = Boolean(globalThis.chrome?.runtime?.getManifest?.().permissions?.includes("unlimitedStorage"));
    if (!unlimited && total - replaced + bytes > (chrome.storage.local.QUOTA_BYTES || 10485760) - 65536) throw new Error("Armazenamento local cheio. Exporte um backup e remova registros antigos antes de salvar. Os dados anteriores foram mantidos.");
    await chrome.storage.local.set(values);
  }
  function locked(task) { return navigator.locks.request("radar-local-storage", task); }
  async function read() { return normalize((await chrome.storage.local.get(KEY))[KEY]); }
  async function update(mutator) {
    return locked(async () => {
      const latest = await read();
      const output = await mutator(latest);
      const clean = normalize(latest);
      await write({ [KEY]: clean });
      return { data: clean, output };
    });
  }
  async function commit(patch) {
    return locked(async () => {
      const current = await read();
      for (const op of patch) if (op.collection === "items" && op.add && current.items.some(item => item.id !== op.id && normalizedUrl(item.url) === normalizedUrl(op.add.url))) throw new Error("Esta URL já foi adicionada em outra janela. A oferta existente foi preservada.");
      const applied = apply(current, patch);
      const removedProducts = new Set(patch.filter(op => op.collection === "products" && op.remove).map(op => op.id));
      applied.items = applied.items.filter(item => !removedProducts.has(item.productId));
      const clean = normalize(applied);
      await write({ [KEY]: clean });
      return clean;
    });
  }
  async function saveSettings(base, next) {
    return locked(async () => {
      const stored = (await chrome.storage.local.get(SETTINGS))[SETTINGS] || {};
      for (const key of Object.keys(next)) {
        if (!equal(base[key], next[key])) stored[key] = clone(next[key]);
      }
      await write({ [SETTINGS]: stored });
      return stored;
    });
  }
  async function replace(expected, next, settings, rawSnapshot = false) {
    return locked(async () => {
      const current = rawSnapshot ? (await chrome.storage.local.get(KEY))[KEY] : await read();
      if (!equal(current, expected)) throw new Error("Os dados mudaram desde a abertura do backup. Atualize a tela e tente importar novamente.");
      const values = { [KEY]: normalize(next) };
      if (settings) values[SETTINGS] = settings;
      await write(values);
      return values[KEY];
    });
  }
  function reconcile(targetObject, source) {
    for (const key of Object.keys(targetObject)) if (!(key in source)) delete targetObject[key];
    for (const [key, value] of Object.entries(source)) {
      if (COLLECTIONS[key] && Array.isArray(targetObject[key])) {
        const keyField = COLLECTIONS[key], old = new Map(targetObject[key].map(row => [row[keyField], row]));
        targetObject[key] = value.map(row => { const existing = old.get(row[keyField]); if (existing) { reconcile(existing, row); return existing; } return clone(row); });
      } else targetObject[key] = clone(value);
    }
    return targetObject;
  }
  return { KEY, SETTINGS, normalize, price, url, canonicalUrl, normalizedUrl, icons, changes, apply, read, update, commit, write, saveSettings, replace, reconcile, equal, clone, pointKey };
})();
if (typeof module !== "undefined") module.exports = RadarData;
