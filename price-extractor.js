function extractPageInfo(selector) {
  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeKey = value => cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const parse = (value, currencyHint = "") => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (raw.includes("%")) return null;
    const currency = currencyHint || (raw.includes("R$") ? "BRL" : /\bBRL\b/i.test(raw) ? "BRL" : /€/.test(raw) ? "EUR" : /£/.test(raw) ? "GBP" : /\bUSD\b/i.test(raw) ? "USD" : "");
    let number = raw.replace(/[^\d,.-]/g, "");
    if (!number) return null;
    if (number.includes(",") && number.includes(".")) {
      number = number.lastIndexOf(",") > number.lastIndexOf(".") ? number.replace(/\./g, "").replace(",", ".") : number.replace(/,/g, "");
    } else if (number.includes(",")) {
      const decimals = number.length - number.lastIndexOf(",") - 1;
      number = decimals === 3 ? number.replace(/,/g, "") : number.replace(",", ".");
    } else if (number.includes(".")) {
      const groups = number.split(".");
      if (groups.length > 2) {
        const decimalDigits = groups[groups.length - 1].length;
        number = decimalDigits === 2 ? `${groups.slice(0, -1).join("")}.${groups.at(-1)}` : groups.join("");
      } else if (groups[1]?.length === 3) number = groups.join("");
    }
    const amount = Number(number);
    const roundedAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
    return Number.isFinite(roundedAmount) && roundedAmount > 0 && roundedAmount < 100000000 ? { amount: roundedAmount, currency } : null;
  };

  const headingNode = document.querySelector("h1");
  const hostname = location.hostname.toLowerCase();
  const isMercadoLivre = /(^|\.)mercadolivre\.com\.br$/.test(hostname) || /(^|\.)mercadolibre\./.test(hostname);
  const heading = cleanText(headingNode?.innerText || document.querySelector('meta[property="og:title"]')?.content || document.title);
  const title = cleanText(document.querySelector('meta[property="og:title"]')?.content || heading || document.title);
  const iconNode = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  let faviconUrl = `${location.origin}/favicon.ico`;
  try { if (iconNode?.href) faviconUrl = new URL(iconNode.href, location.href).href; } catch {}
  const candidates = [];
  const add = (value, currency, source, confidence) => {
    const price = parse(value, currency);
    if (price) candidates.push({ ...price, source, confidence });
  };

  if (selector) {
    try {
      const node = document.querySelector(selector);
      if (node) add(node.getAttribute("content") || node.getAttribute("data-price") || node.innerText || node.textContent, node.getAttribute("currency") || "", "CSS selector", "high");
    } catch {}
  }

  const products = [];
  const collectProducts = (value, visited = new Set()) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach(entry => collectProducts(entry, visited)); return; }
    const type = value["@type"];
    if ((Array.isArray(type) ? type : [type]).includes("Product")) products.push(value);
    Object.values(value).forEach(entry => collectProducts(entry, visited));
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => { try { collectProducts(JSON.parse(script.textContent)); } catch {} });

  const headingTokens = new Set(normalizeKey(heading).split(" ").filter(token => token.length > 2));
  const productScore = product => {
    const productName = normalizeKey(product.name || product.alternateName || "");
    let score = 0;
    if (productName && headingTokens.size) {
      const productTokens = new Set(productName.split(" ").filter(token => token.length > 2));
      const overlap = [...headingTokens].filter(token => productTokens.has(token)).length;
      const coverage = overlap / Math.max(headingTokens.size, productTokens.size || 1);
      if (productName === normalizeKey(heading)) score = 110;
      else if (coverage >= 0.7) score = 75 + Math.round(coverage * 20);
    }
    const pagePath = new URL(location.href).pathname.replace(/\/$/, "");
    const urls = [product.url, product.offers?.url, ...(Array.isArray(product.offers) ? product.offers.map(offer => offer?.url) : [])].filter(Boolean);
    for (const value of urls) {
      try { const url = new URL(value, location.href); if (url.hostname === location.hostname && url.pathname.replace(/\/$/, "") === pagePath) score = Math.max(score, 120); } catch {}
    }
    return score;
  };
  const matchedProducts = products.map(product => ({ product, score: productScore(product) })).filter(entry => entry.score >= 75).sort((a, b) => b.score - a.score);
  for (const { product } of matchedProducts) {
    const offerValue = product.offers ?? product;
    for (const offer of (Array.isArray(offerValue) ? offerValue : [offerValue])) {
      if (!offer || typeof offer !== "object") continue;
      add(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price ?? product.price ?? product.lowPrice,
        offer.priceCurrency || offer.priceSpecification?.priceCurrency || product.priceCurrency || "", "JSON-LD", "high");
    }
  }

  const productScopeSelector = '[class*="product__info"], [class*="product-info"], [class*="product__details"], [class*="product-details"], [id*="product-info"], [id*="product-details"]';
  let productScope = headingNode?.closest(productScopeSelector) || null;
  if (!productScope && headingNode) {
    let ancestor = headingNode.parentElement;
    for (let depth = 0; ancestor && ancestor !== document.body && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      const text = ancestor.innerText || "";
      if (text.length < 5000 && /(?:R\$|US\$|USD|€|£)\s*[\d.,]+/i.test(text)) { productScope = ancestor; break; }
    }
  }

  const visiblePriceCandidates = [];
  const regularLabelPriceCandidates = [];
  const mercadoLivrePriceNodes = new Set();
  if (isMercadoLivre) {
    const selectors = [
      ".ui-pdp-price__second-line .andes-money-amount",
      ".ui-pdp-price__main-container .andes-money-amount",
      '[class*="ui-pdp-price__second-line"] [class*="money-amount"]'
    ];
    selectors.forEach(selector => document.querySelectorAll(selector).forEach(node => mercadoLivrePriceNodes.add(node)));
    mercadoLivrePriceNodes.forEach(node => {
      if (!node.getClientRects().length || node.closest("s, del, [class*='original-value'], [class*='price--original'], [class*='old-price']")) return;
      const fraction = node.querySelector(".andes-money-amount__fraction")?.textContent;
      const cents = node.querySelector(".andes-money-amount__cents")?.textContent;
      const raw = fraction ? `R$ ${fraction}${cents ? `,${cents}` : ""}` : node.innerText || node.textContent || "";
      const parsed = parse(raw, "BRL");
      if (!parsed) return;
      const inSecondLine = Boolean(node.closest(".ui-pdp-price__second-line, [class*='ui-pdp-price__second-line']"));
      visiblePriceCandidates.push({ ...parsed, source: "preço visível", confidence: "high", score: inSecondLine ? 280 : 240, isPix: false });
    });
  }
  const priceNodes = document.querySelectorAll('[class*="price"], [id*="price"], [class*="money"], [class*="pix"], [data-testid*="price"], ins, [itemprop="price"], [data-price]');
  priceNodes.forEach(node => {
    if (mercadoLivrePriceNodes.has(node) || !node.getClientRects().length || node.closest("s, del")) return;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.textDecorationLine.includes("line-through")) return;
    const raw = node.getAttribute("content") || node.getAttribute("data-price") || node.innerText || node.textContent || "";
    if (String(raw).includes("%")) return;
    const money = String(raw).match(/(?:R\$|US\$|USD|BRL|€|£)\s*[\d.,]+/gi) || [];
    if (money.length > 1) return;
    const parsed = parse(raw, node.getAttribute("currency") || "");
    if (!parsed) return;
    const marker = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""} ${node.getAttribute("aria-label") || ""}`.toLowerCase();
    const nearbyTexts = [];
    for (let ancestor = node; ancestor && nearbyTexts.length < 4; ancestor = ancestor.parentElement) {
      const text = cleanText(ancestor.innerText || ancestor.textContent);
      if (text.length > 240) break;
      nearbyTexts.push(text);
    }
    const context = nearbyTexts.find(text => /\b(?:pix|normal|original|parcel|parcelado|cart[aã]o|cupom)\b/i.test(text)) || "";
    const isPix = (/\bpix\b/i.test(context) || /\bpix\b/i.test(marker)) && !/cupom|primeira compra|clube|assinante|m[eê]mbro/i.test(context);
    const isRegular = !isPix && /pre[cç]o\s+(?:anunciado\s+)?normal|pre[cç]o\s+original|\bde\s*R\$/i.test(context);
    const isInstallment = /\b\d{1,2}x\b|parcela|parcelado|mensal|ao m[eê]s|frete|shipping/i.test(context);
    if (/install|parcel|payment|shipping|freight|compare|original|old-price|was-price/.test(marker)) return;
    if (isRegular) { regularLabelPriceCandidates.push(parsed); return; }
    if (isInstallment && !isPix) return;
    let score = productScope?.contains(node) ? 70 : 0;
    if (/sale|current|final|special|promotional|promo|discount/.test(marker) || node.matches("ins")) score += 100;
    else if (/price|money/.test(marker)) score += 25;
    if (/regular|list-price/.test(marker)) score -= 30;
    if (node.matches('[itemprop="price"], [data-price]')) score += 10;
    if (isPix) score += 160;
    visiblePriceCandidates.push({ ...parsed, source: isPix ? "preço Pix visível" : "preço visível", confidence: "high", score, isPix });
  });
  visiblePriceCandidates.sort((a, b) => b.score - a.score);

  const regularPriceCandidates = [...regularLabelPriceCandidates];
  if (productScope) {
    productScope.querySelectorAll('s, del, [class*="compare-at"], [class*="compare_at"], [class*="old-price"], [class*="was-price"], [class*="price-item--regular"], [class*="regular-price"], [class*="price--regular"]').forEach(node => {
      if (!node.getClientRects().length) return;
      const raw = node.getAttribute("content") || node.getAttribute("data-price") || node.innerText || node.textContent || "";
      if (String(raw).includes("%")) return;
      const money = String(raw).match(/(?:R\$|US\$|USD|BRL|€|£)\s*[\d.,]+/gi) || [];
      if (money.length !== 1) return;
      const parsed = parse(raw, node.getAttribute("currency") || "");
      if (parsed) regularPriceCandidates.push(parsed);
    });
  }

  const metas = [
    ['meta[property="product:price:amount"]', 'meta[property="product:price:currency"]'],
    ['meta[property="og:price:amount"]', 'meta[property="og:price:currency"]'],
    ['meta[itemprop="price"]', 'meta[itemprop="priceCurrency"]'],
    ['meta[name="price"]', 'meta[name="currency"]']
  ];
  metas.forEach(([priceSelector, currencySelector]) => {
    const node = document.querySelector(priceSelector);
    if (node) add(node.content || node.getAttribute("content") || node.textContent, document.querySelector(currencySelector)?.content || "", "metadata", "high");
  });
  document.querySelectorAll('[itemprop="price"], [data-price]').forEach(node => {
    if (candidates.length > 30) return;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return;
    add(node.getAttribute("content") || node.getAttribute("data-price") || node.textContent, node.closest('[itemtype*="Offer"]')?.querySelector('[itemprop="priceCurrency"]')?.content || "", "page markup", "medium");
  });

  const bestVisiblePrice = visiblePriceCandidates.find(candidate => candidate.isPix && candidate.score >= 160)
    || visiblePriceCandidates.find(candidate => candidate.score >= 60);
  const chosen = candidates.find(candidate => candidate.source === "CSS selector")
    || (bestVisiblePrice && { amount: bestVisiblePrice.amount, currency: bestVisiblePrice.currency, source: bestVisiblePrice.source, confidence: bestVisiblePrice.confidence })
    || candidates.find(candidate => candidate.source === "JSON-LD")
    || candidates.find(candidate => candidate.source === "metadata")
    || candidates.find(candidate => candidate.source === "page markup")
    || (() => {
      const text = document.body?.innerText?.slice(0, 180000) || "";
      const patterns = [/R\$\s?[\d.]+,\d{2}/g, /(?:US\$|USD\s?)\s?[\d,]+(?:\.\d{2})?/g, /€\s?[\d.,]+/g, /£\s?[\d.,]+/g];
      for (const pattern of patterns) { const match = text.match(pattern)?.[0]; const price = parse(match); if (price) return { ...price, source: "texto visível", confidence: "low" }; }
      return null;
    })();
  const regularPrice = chosen ? regularPriceCandidates.filter(value => value.amount > chosen.amount && (!value.currency || !chosen.currency || value.currency === chosen.currency)).sort((a, b) => a.amount - b.amount)[0] || null : null;
  const corroboratingSources = chosen ? [...new Set([...candidates, ...visiblePriceCandidates]
    .filter(candidate => candidate.amount === chosen.amount && (!candidate.currency || !chosen.currency || candidate.currency === chosen.currency))
    .map(candidate => candidate.source))] : [];
  const price = chosen ? { ...chosen, corroboratingSources, confidence: corroboratingSources.length > 1 ? "corroborated" : chosen.confidence || "unknown" } : null;
  return { title, price, regularPrice, faviconUrl };
}

function evaluatePriceAlert(item, current, settings = {}) {
  const previous = Number(item?.price?.amount);
  const amount = Number(current?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currencyMatches = !item?.price?.currency || !current?.currency || item.price.currency === current.currency;
  const targetCrossed = item?.target != null && amount <= Number(item.target) && (!Number.isFinite(previous) || previous > Number(item.target));
  const dropPercent = Number.isFinite(previous) && previous > 0 && currencyMatches && amount < previous ? (previous - amount) / previous * 100 : 0;
  const minimumDrop = Math.min(99, Math.max(0, Number(settings.priceAlertMinDropPercent) || 0));
  const dropQualified = dropPercent > 0 && dropPercent >= minimumDrop;
  const oldPrices = (Array.isArray(item?.history) ? item.history : []).filter(point =>
    Number.isFinite(Number(point.amount)) && Number(point.amount) > 0 &&
    (!point.currency || !current.currency || point.currency === current.currency));
  const previousLow = oldPrices.length ? Math.min(...oldPrices.map(point => Number(point.amount))) : currencyMatches ? previous : NaN;
  const newLow = Number.isFinite(previousLow) && previousLow > 0 && amount < previousLow;
  if (targetCrossed) return { kind: "target", dropPercent, newLow };
  if (dropQualified) return { kind: "drop", dropPercent, newLow };
  if (settings.priceAlertNewLowEnabled === true && newLow) return { kind: "new-low", dropPercent, newLow };
  return null;
}

function isSuspiciousPriceChange(previous, candidate, thresholdPercent = 50) {
  const oldAmount = Number(previous?.amount);
  const newAmount = Number(candidate?.amount);
  if (!Number.isFinite(oldAmount) || oldAmount <= 0 || !Number.isFinite(newAmount) || newAmount <= 0) return null;
  if (previous.currency && candidate.currency && previous.currency !== candidate.currency) return null;
  const changePercent = Math.abs((newAmount / oldAmount - 1) * 100);
  return changePercent > thresholdPercent ? { changePercent, direction: newAmount < oldAmount ? "drop" : "increase" } : null;
}
