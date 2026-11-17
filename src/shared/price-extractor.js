// Funções declaradas com "function" para permitir reinjeção do arquivo na mesma página.
function radarSiteRules() {
  // Regras embutidas para lojas cujo layout confunde a detecção genérica.
  return [{
    name: "Amazon",
    host: /(^|\.)amazon\.(?:com|com\.br|com\.mx|ca|co\.uk|de|fr|es|it|co\.jp|in)$/,
    exclude: ".a-text-price, [data-a-strike], .pricePerUnit, [class*='pricePerUnit'], #sns-base-price, .a-carousel-container, [data-a-carousel-options], #similarities_feature_div, #sims-consolidated-1_feature_div",
    price: [
      "#corePriceDisplay_desktop_feature_div .priceToPay",
      "#corePrice_desktop .apexPriceToPay",
      "#apex_desktop .apexPriceToPay",
      "#apex_offerDisplay_desktop .apexPriceToPay",
      "#corePrice_feature_div .a-price",
      "#tp_price_block_total_price_ww .a-price",
      "#corePriceDisplay_mobile_feature_div .priceToPay",
      "#price_inside_buybox", "#newBuyBoxPrice", "#priceblock_dealprice", "#priceblock_ourprice", "#kindle-price"
    ],
    availability: "#availability",
    regular: [
      "#corePriceDisplay_desktop_feature_div .basisPrice .a-text-price",
      "#corePriceDisplay_desktop_feature_div .a-text-price[data-a-strike]",
      "#corePrice_desktop .a-text-price[data-a-strike]",
      "#listPrice", "#priceblock_listprice"
    ]
  }];
}

// Converte valores de disponibilidade (schema.org, metadados ou texto da loja) em "in-stock" / "out-of-stock".
function radarAvailability(value) {
  const text = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = text.replace(/^https?:\/\/schema\.org\//, "").replace(/[\s_-]+/g, "");
  if (/^(?:outofstock|soldout|discontinued|oos)$/.test(key)) return "out-of-stock";
  if (/^(?:instock|limitedavailability|instoreonly|onlineonly|preorder|presale|backorder)$/.test(key)) return "in-stock";
  if (/nao disponivel|indisponivel|esgotado|fora de estoque|sem estoque|currently unavailable|out of stock|sold out/.test(text)) return "out-of-stock";
  if (/em estoque|in stock|disponivel|restam apenas|only \d+ left|apenas \d+ em estoque/.test(text)) return "in-stock";
  return "";
}

function radarIsVisible(node) {
  try { return typeof node.checkVisibility === "function" ? node.checkVisibility() : node.getClientRects().length > 0; } catch { return false; }
}

// Lê o valor de um elemento, incluindo formatos divididos em partes (Amazon, Mercado Livre).
function radarReadNode(node) {
  if (!node) return "";
  const attribute = node.getAttribute("content") || node.getAttribute("data-price");
  if (attribute) return attribute;
  // Componente NumberFlow (KaBuM e outros): os dígitos ficam no shadow DOM; o valor completo vem no atributo data.
  const flow = node.matches("number-flow-react, number-flow") ? node : node.children.length <= 3 ? node.querySelector(":scope > number-flow-react, :scope > number-flow") : null;
  if (flow) {
    try {
      const parsed = JSON.parse(flow.getAttribute("data") || "{}");
      if (typeof parsed.valueAsString === "string" && /\d/.test(parsed.valueAsString)) return parsed.valueAsString;
    } catch {}
    const label = flow.getAttribute("aria-label");
    if (label && /\d/.test(label)) return label;
  }
  const amazon = node.matches(".a-price") ? node : node.matches(".a-offscreen") ? node.closest(".a-price") || node : node.querySelector(".a-price");
  if (amazon) {
    const offscreen = (amazon.matches(".a-offscreen") ? amazon : amazon.querySelector(".a-offscreen"))?.textContent?.trim() || "";
    if (/\d/.test(offscreen)) return offscreen;
    const whole = amazon.querySelector(".a-price-whole")?.textContent || "";
    if (/\d/.test(whole)) {
      const decimal = amazon.querySelector(".a-price-decimal")?.textContent?.trim() || "";
      const fraction = amazon.querySelector(".a-price-fraction")?.textContent?.trim() || "";
      const symbol = amazon.querySelector(".a-price-symbol")?.textContent?.trim() || "";
      const integer = whole.replace(/\s/g, "").replace(/[.,]$/, "");
      return `${symbol} ${integer}${fraction ? (decimal || ",") + fraction : ""}`.trim();
    }
  }
  const andes = node.matches(".andes-money-amount") ? node : node.querySelector(".andes-money-amount");
  const fraction = andes?.querySelector(".andes-money-amount__fraction")?.textContent;
  if (fraction) {
    const cents = andes.querySelector(".andes-money-amount__cents")?.textContent;
    const symbol = andes.querySelector(".andes-money-amount__currency-symbol")?.textContent?.trim() || "R$";
    return `${symbol} ${fraction}${cents ? `,${cents}` : ""}`;
  }
  return node.innerText || node.textContent || "";
}

function radarStableToken(value) {
  if (!value || value.length > 48) return false;
  // Ids do React (":R6a62ml6:", "«r1»"), classes geradas e trechos com cara de hash mudam entre carregamentos.
  if (/[:«»\[\]!/@()]/.test(value) || /\d{3,}/.test(value) || /^(?:css|sc|jsx|emotion|svelte|tw)-/i.test(value)) return false;
  if (/[_-][a-z0-9]*\d[a-z0-9]*$/i.test(value) || /[A-Z].*[A-Z].*\d|\d.*[A-Z]/.test(value)) return false;
  return !value.split(/[-_]+/).some(segment => segment.length >= 4 && /\d/.test(segment) && /[a-z]/i.test(segment));
}

// Gera um seletor curto e estável que encontra só aquele elemento entre os visíveis.
function radarBuildLocator(target) {
  if (!target || target === document.body) return "";
  const escape = value => (globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"));
  const part = element => {
    if (element.id && radarStableToken(element.id) && document.querySelectorAll("#" + escape(element.id)).length === 1) return "#" + escape(element.id);
    let token = element.tagName.toLowerCase();
    for (const attribute of ["itemprop", "data-testid", "data-test", "data-qa", "data-component"]) {
      const value = element.getAttribute(attribute);
      if (value && radarStableToken(value)) { token += `[${attribute}="${value.replace(/["\\]/g, "\\$&")}"]`; break; }
    }
    return token + [...element.classList].filter(radarStableToken).slice(0, 3).map(name => "." + escape(name)).join("");
  };
  const unique = query => { try { const matches = [...document.querySelectorAll(query)].filter(radarIsVisible); return matches.length === 1 && matches[0] === target; } catch { return false; } };
  const parts = [];
  for (let element = target, depth = 0; element && element !== document.body && element !== document.documentElement && depth < 6; element = element.parentElement, depth += 1) {
    const token = part(element);
    parts.unshift(token);
    const query = parts.join(" ");
    if (unique(query)) return query.length <= 400 ? query : "";
    if (token.startsWith("#")) break;
  }
  return "";
}

// Seletor visual: a pessoa clica no preço e o Radar trava o elemento para o site.
function radarStartPricePicker(token) {
  window.__radarPicker?.cancel();
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .box{position:fixed;border:2px solid #f5f5f5;background:#ffffff1a;border-radius:4px;box-shadow:0 0 0 1px #000;transition:all .06s;display:none}
    .bar{position:fixed;left:50%;top:16px;transform:translateX(-50%);max-width:min(560px,92vw);padding:10px 14px;border:1px solid #ffffff26;border-radius:8px;background:linear-gradient(180deg,#111,#000);color:#f5f5f5;font:500 13px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px #0008}
    .bar b{font-weight:650}.bar small{display:block;color:#a3a3a3;font-size:11px;margin-top:2px}
  </style><div class="box"></div><div class="bar"><b>Radar Local</b> · clique no preço do produto<small>Esc cancela</small></div>`;
  document.documentElement.append(host);
  const box = root.querySelector(".box"), bar = root.querySelector(".bar");
  let current = null, done = false;
  const priceNodeAt = (x, y) => {
    for (let node = document.elementFromPoint(x, y), depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
      if (host.contains(node)) return null;
      const target = node.closest(".a-price") || node.closest(".andes-money-amount") || node;
      const value = RadarMoney.parse(String(radarReadNode(target)).replace(/\s+/g, " ").trim());
      if (value) return { node: target, value };
    }
    return null;
  };
  const say = (title, detail) => { bar.innerHTML = ""; const b = document.createElement("b"); b.textContent = title; const small = document.createElement("small"); small.textContent = detail; bar.append(b, small); };
  const move = event => {
    if (done) return;
    current = priceNodeAt(event.clientX, event.clientY);
    if (!current) { box.style.display = "none"; return; }
    const rect = current.node.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: rect.left - 3 + "px", top: rect.top - 3 + "px", width: rect.width + 6 + "px", height: rect.height + 6 + "px" });
  };
  const stop = () => { done = true; removeEventListener("mousemove", move, true); removeEventListener("click", click, true); removeEventListener("keydown", key, true); delete window.__radarPicker; };
  const finish = delayMs => { stop(); setTimeout(() => host.remove(), delayMs); };
  const click = async event => {
    if (done) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const picked = priceNodeAt(event.clientX, event.clientY);
    if (!picked) return say("Nenhum preço nesse ponto", "Aponte para o valor do produto. Esc cancela.");
    const locator = radarBuildLocator(picked.node);
    if (!locator) return say("Não consegui travar esse elemento", "A página não tem uma marcação estável para ele. Tente o valor principal ou use a caneta de correção.");
    done = true;
    say("Salvando…", locator);
    try {
      const response = await chrome.runtime.sendMessage({ type: "radar:picker-result", token, locator });
      if (!response?.ok) throw new Error(response?.error || "Falha ao salvar.");
      const formatted = picked.value.currency ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: picked.value.currency }).format(picked.value.amount) : picked.value.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      say(`Preço travado para ${location.hostname}`, `${formatted} · as próximas leituras deste site usam este elemento.`);
      finish(3200);
    } catch (error) { say("Não foi possível salvar", error.message); finish(4000); }
  };
  const key = event => { if (event.key === "Escape") { event.preventDefault(); say("Seleção cancelada", ""); finish(900); } };
  addEventListener("mousemove", move, true); addEventListener("click", click, true); addEventListener("keydown", key, true);
  window.__radarPicker = { cancel: () => { stop(); host.remove(); } };
}

function extractPageInfo(selector, options = {}) {
  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeKey = value => cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const parse = (value, currencyHint = "") => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (raw.includes("%")) return null;
    if (/\d\s*[x×]|parcela|frete|shipping/i.test(raw)) return null;
    const matches = raw.match(/(?:R\$|US\$|USD|BRL|€|£|\$)\s*[\d.,]+/gi) || [];
    if (matches.length > 1) return null;
    return RadarMoney.parse(matches[0] || value, currencyHint);
  };
  const isVisible = radarIsVisible;
  const readNode = radarReadNode;
  // Resolve um seletor para um único preço: ignora cópias escondidas e aceita duplicatas com o mesmo valor.
  const pickUnique = (query, exclude = "") => {
    let nodes;
    try { nodes = [...document.querySelectorAll(query)]; } catch { return { error: "invalid" }; }
    if (exclude) nodes = nodes.filter(node => !node.closest(exclude));
    const visible = nodes.filter(isVisible);
    const pool = visible.length ? visible : nodes;
    if (!pool.length) return { error: "missing" };
    const readings = pool.map(node => ({ node, price: parse(readNode(node), node.getAttribute("currency") || "") }));
    if (readings.some(reading => !reading.price)) return { error: "unreadable" };
    if (new Set(readings.map(({ price }) => `${price.currency}:${price.amount}`)).size !== 1) return { error: "ambiguous" };
    return readings[0];
  };
  const buildLocator = radarBuildLocator;

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
    const picked = pickUnique(selector);
    if (picked.error === "invalid") return { title, price: null, regularPrice: null, faviconUrl, error: "O seletor CSS salvo é inválido." };
    if (picked.error === "ambiguous") return { title, price: null, regularPrice: null, faviconUrl, error: "O seletor encontrou valores diferentes. Ele precisa apontar para um único preço." };
    if (picked.error) return { title, price: null, regularPrice: null, faviconUrl, error: "O seletor salvo não encontrou um preço único. Revise o seletor desta oferta." };
    candidates.push({ ...picked.price, source: "CSS selector", confidence: "high" });
  }

  // Elemento memorizado da oferta: usado primeiro; se sumir, a leitura volta à detecção normal.
  let lockedLocator = "";
  const locked = !selector && options?.lockedSelector ? pickUnique(options.lockedSelector) : null;
  if (locked?.price) { candidates.push({ ...locked.price, source: "elemento memorizado", confidence: "high" }); lockedLocator = options.lockedSelector; }

  // Regras embutidas para lojas cujo layout confunde a detecção genérica.
  const siteRule = radarSiteRules().find(rule => rule.host.test(hostname));
  let ruleLocator = "";
  const ruleRegularPrices = [];
  if (siteRule) {
    for (const query of siteRule.price) {
      const picked = pickUnique(query, siteRule.exclude);
      if (picked.price) { candidates.push({ ...picked.price, source: "regra da loja", confidence: "high" }); ruleLocator = query; break; }
    }
    for (const query of siteRule.regular) {
      const picked = pickUnique(query);
      if (picked.price) { ruleRegularPrices.push(picked.price); break; }
    }
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
  const structuredAvailability = [];
  for (const { product } of matchedProducts) {
    const offerValue = product.offers ?? product;
    for (const offer of (Array.isArray(offerValue) ? offerValue : [offerValue])) {
      if (!offer || typeof offer !== "object") continue;
      const state = radarAvailability(offer.availability || product.availability);
      if (state) structuredAvailability.push(state);
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
      visiblePriceCandidates.push({ ...parsed, source: "preço visível", confidence: "high", score: inSecondLine ? 280 : 240, isPix: false, node });
    });
  }
  const priceNodes = document.querySelectorAll('[class*="price"], [id*="price"], [class*="money"], [class*="pix"], [data-testid*="price"], ins, [itemprop="price"], [data-price], number-flow-react, number-flow');
  const headingTop = headingNode && isVisible(headingNode) ? headingNode.getBoundingClientRect().top + scrollY : null;
  const otherProducts = 'header, footer, nav, aside[class*="recommend"], [class*="recommend"], [class*="related"], [class*="carousel"], [class*="cross-sell"], [class*="product-card"], [class*="swiper"], [class*="slick-"], [class*="splide"], [data-testid*="product-card"], [data-testid*="carousel"], [data-testid*="recommend"], [data-testid*="showcase"], [data-testid*="shelf"], [aria-roledescription="carousel"], [aria-roledescription="slide"]';
  priceNodes.forEach(node => {
    if (mercadoLivrePriceNodes.has(node) || !node.getClientRects().length || node.closest("s, del")) return;
    if (productScope && !productScope.contains(node)) return;
    if (node.closest(otherProducts)) return;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.textDecorationLine.includes("line-through")) return;
    const raw = node.matches("number-flow-react, number-flow") ? readNode(node) : node.getAttribute("content") || node.getAttribute("data-price") || node.innerText || node.textContent || "";
    if (String(raw).includes("%")) return;
    const money = String(raw).match(/(?:R\$|US\$|USD|BRL|€|£)\s*[\d.,]+/gi) || [];
    if (money.length > 1) return;
    if (!money.length && !node.matches('[itemprop="price"], [data-price]')) return;
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
    if (/cupom|primeira compra|clube|assinante|m[eê]mbro/i.test(context)) return;
    let score = productScope?.contains(node) ? 70 : 0;
    if (/sale|current|final|special|promotional|promo|discount/.test(marker) || node.matches("ins")) score += 100;
    else if (/price|money/.test(marker)) score += 25;
    if (/regular|list-price/.test(marker)) score -= 30;
    if (node.matches('[itemprop="price"], [data-price]')) score += 10;
    if (isPix) score += 160;
    // O preço principal fica perto do nome do produto; vitrines e recomendações ficam bem abaixo.
    if (headingTop != null) {
      const distance = Math.abs(node.getBoundingClientRect().top + scrollY - headingTop);
      if (distance <= 700) score += 40;
      else if (distance > 1400) score -= 60;
    }
    visiblePriceCandidates.push({ ...parsed, source: isPix ? "preço Pix visível" : "preço visível", confidence: "high", score, isPix, node });
  });
  visiblePriceCandidates.sort((a, b) => b.score - a.score);

  const regularPriceCandidates = [...regularLabelPriceCandidates, ...ruleRegularPrices];
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
  (productScope || document.querySelector("main") || document).querySelectorAll('[itemprop="price"], [data-price]').forEach(node => {
    if (candidates.length > 30) return;
    if (node.closest('s, del, [class*="recommend"], [class*="related"], [class*="product-card"]')) return;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return;
    add(node.getAttribute("content") || node.getAttribute("data-price") || node.textContent, node.closest('[itemtype*="Offer"]')?.querySelector('[itemprop="priceCurrency"]')?.content || "", "page markup", "medium");
  });

  const bestVisiblePrice = visiblePriceCandidates.find(candidate => candidate.score >= 60);
  const chosen = candidates.find(candidate => candidate.source === "CSS selector")
    || candidates.find(candidate => candidate.source === "elemento memorizado")
    || candidates.find(candidate => candidate.source === "regra da loja")
    || (bestVisiblePrice && { amount: bestVisiblePrice.amount, currency: bestVisiblePrice.currency, source: bestVisiblePrice.source, confidence: bestVisiblePrice.confidence })
    || candidates.find(candidate => candidate.source === "JSON-LD")
    || candidates.find(candidate => candidate.source === "metadata")
    || candidates.find(candidate => candidate.source === "page markup")
    || (() => {
      const text = (productScope || document.querySelector("main"))?.innerText?.slice(0, 50000) || "";
      const patterns = [/R\$\s?[\d.]+,\d{2}/g, /(?:US\$|USD\s?)\s?[\d,]+(?:\.\d{2})?/g, /€\s?[\d.,]+/g, /£\s?[\d.,]+/g];
      const unique = new Map();
      for (const pattern of patterns) for (const match of text.match(pattern) || []) { const value = parse(match); if (value) unique.set(`${value.currency}:${value.amount}`, value); }
      return unique.size === 1 ? { ...unique.values().next().value, source: "texto visível", confidence: "low", requiresReview: true, reviewReason: "Valor encontrado em texto, sem identificação segura do preço do produto." } : null;
    })();
  const regularPrice = chosen ? regularPriceCandidates.filter(value => value.amount > chosen.amount && (!value.currency || !chosen.currency || value.currency === chosen.currency)).sort((a, b) => a.amount - b.amount)[0] || null : null;
  const corroboratingSources = chosen ? [...new Set([...candidates, ...visiblePriceCandidates]
    .filter(candidate => candidate.amount === chosen.amount && (!candidate.currency || !chosen.currency || candidate.currency === chosen.currency))
    .map(candidate => candidate.source))] : [];
  const price = chosen ? { ...chosen, corroboratingSources, confidence: corroboratingSources.length > 1 && !chosen.requiresReview ? "corroborated" : chosen.confidence || "unknown" } : null;
  if (price && bestVisiblePrice && ["preço visível", "preço Pix visível"].includes(price.source) && visiblePriceCandidates.some(candidate => candidate.score === bestVisiblePrice.score && (candidate.amount !== bestVisiblePrice.amount || candidate.currency !== bestVisiblePrice.currency))) {
    price.requiresReview = true;
    price.reviewReason = "A página mostra mais de um preço com a mesma prioridade. Confira a variante e a condição de pagamento.";
  }
  if (price && !["CSS selector", "elemento memorizado", "regra da loja", "preço visível", "preço Pix visível"].includes(price.source)) {
    price.requiresReview = true;
    price.reviewReason ||= "Preço obtido de dados estruturados ou texto; confirme a oferta, a variante e a condição de pagamento.";
  }
  let availability = "", availabilitySource = "";
  const ruleAvailabilityNode = siteRule?.availability ? document.querySelector(siteRule.availability) : null;
  const ruleAvailability = ruleAvailabilityNode && isVisible(ruleAvailabilityNode) ? radarAvailability(ruleAvailabilityNode.innerText) : "";
  const metaAvailability = radarAvailability(document.querySelector('meta[property="product:availability"], meta[property="og:availability"], meta[itemprop="availability"], link[itemprop="availability"]')?.getAttribute("content") || document.querySelector('link[itemprop="availability"]')?.getAttribute("href"));
  if (ruleAvailability) { availability = ruleAvailability; availabilitySource = "regra da loja"; }
  else if (structuredAvailability.length) { availability = structuredAvailability.includes("in-stock") ? "in-stock" : "out-of-stock"; availabilitySource = "JSON-LD"; }
  else if (metaAvailability) { availability = metaAvailability; availabilitySource = "metadata"; }
  const locator = !price || price.requiresReview ? ""
    : price.source === "elemento memorizado" ? lockedLocator
    : price.source === "regra da loja" ? ruleLocator
    : ["preço visível", "preço Pix visível"].includes(price.source) ? buildLocator(bestVisiblePrice?.node)
    : "";
  return { title, price, regularPrice, faviconUrl, locator, availability, availabilitySource, lockMissed: Boolean(options?.lockedSelector && !lockedLocator && !selector) };
}

function priceReviewReason(previous, candidate, settings = {}) {
  if (candidate?.requiresReview || ["low", "medium", "unknown"].includes(candidate?.confidence)) return candidate.reviewReason || "A leitura não tem confiança suficiente para substituir o preço salvo.";
  if (previous?.currency && previous.currency !== candidate?.currency) return "A moeda mudou ou não foi identificada. Confira o valor antes de aceitar.";
  const anomaly = settings.priceAnomalyGuardEnabled !== false ? isSuspiciousPriceChange(previous, candidate, Number(settings.priceAnomalyThresholdPercent) || 50) : null;
  return anomaly ? `Variação de ${anomaly.changePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em relação ao preço salvo.` : "";
}

function evaluatePriceAlert(item, current, settings = {}) {
  const previous = Number(item?.price?.amount);
  const amount = Number(current?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currencyMatches = !item?.price || (item.price.currency || "") === (current?.currency || "");
  const targetCrossed = currencyMatches && item?.target != null && amount <= Number(item.target) && (!Number.isFinite(previous) || previous > Number(item.target));
  const dropPercent = Number.isFinite(previous) && previous > 0 && currencyMatches && amount < previous ? (previous - amount) / previous * 100 : 0;
  const minimumDrop = Math.min(99, Math.max(0, Number(settings.priceAlertMinDropPercent) || 0));
  const dropQualified = dropPercent > 0 && dropPercent >= minimumDrop;
  const oldPrices = (Array.isArray(item?.history) ? item.history : []).filter(point =>
    Number.isFinite(Number(point.amount)) && Number(point.amount) > 0 &&
    (point.currency || "") === (current.currency || ""));
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
