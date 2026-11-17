// Leitura de preços por site: sites travados, elementos memorizados e regras embutidas.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

function siteLockButton(label, onClick) {
  const button = document.createElement("button"); button.type = "button"; button.className = "secondary"; button.textContent = label;
  button.addEventListener("click", () => { void Promise.resolve(onClick()).catch(showOperationError); });
  return button;
}

function siteLockEmpty(root, text) {
  const empty = document.createElement("div"); empty.className = "profile-empty"; empty.textContent = text; root.append(empty);
}

function normalizeSiteHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try { return new URL(/^https?:\/\//.test(raw) ? raw : "https://" + raw).hostname; } catch { return ""; }
}

async function upsertSiteProfile(host, selector) {
  const updatedAt = new Date().toISOString();
  const profile = data.siteProfiles.find(row => row.host === host);
  if (profile) Object.assign(profile, { selector, updatedAt });
  else data.siteProfiles.push({ host, selector, updatedAt });
  await persist(); renderSettings();
}

async function startPricePicker() {
  if (!currentPage?.url || !currentPage.tabId) return showToast("Abra a página de um produto para travar o preço.", true);
  const origin = new URL(currentPage.url).origin + "/*";
  if (!await chrome.permissions.contains({ origins: [origin] }) && !await chrome.permissions.request({ origins: [origin] })) return showToast("Sem acesso a este site, o Radar não consegue ler o preço.", true);
  const response = await chrome.runtime.sendMessage({ type: "radar:start-picker", tabId: currentPage.tabId });
  if (!response?.ok) return showToast(response?.error || "Não foi possível abrir o seletor na página.", true);
  showToast(`Clique no preço em ${response.result.host}.`);
}

async function addSiteProfileFromForm(event) {
  event.preventDefault();
  const host = normalizeSiteHost(document.getElementById("siteProfileHost").value);
  const selector = document.getElementById("siteProfileSelector").value.trim();
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return showToast("Informe um site válido, como www.loja.com.br.", true);
  if (!selector) return showToast("Informe o seletor CSS ou use “Travar preço nesta página”.", true);
  try { document.createDocumentFragment().querySelector(selector); } catch { return showToast("O seletor CSS é inválido.", true); }
  await upsertSiteProfile(host, selector);
  document.getElementById("siteProfileForm").reset();
  showToast(`${host} adicionado aos sites travados.`);
}

function renderSiteProfiles() {
  const root = document.getElementById("siteProfilesList");
  if (!root) return;
  const pickButton = document.getElementById("pickPriceButton");
  const pickHint = document.getElementById("pickPriceHint");
  const pageHost = currentPage?.url ? getSiteHost(currentPage.url) : "";
  if (pickButton) pickButton.disabled = !pageHost;
  if (pickHint) pickHint.textContent = pageHost ? `Página atual: ${pageHost}. Clique no botão e depois no preço.` : "Abra a página de um produto para usar o seletor visual.";

  root.replaceChildren();
  const profiles = [...(data.siteProfiles || [])].sort((a, b) => a.host.localeCompare(b.host));
  if (!profiles.length) siteLockEmpty(root, "Nenhum site travado. Use o seletor visual ou adicione um site com o seletor CSS.");
  profiles.forEach(profile => {
    const row = document.createElement("div"); row.className = "site-profile-row";
    const heading = document.createElement("strong"); heading.className = "site-profile-host"; heading.textContent = profile.host;
    const offers = data.items.filter(item => getSiteHost(item.url) === profile.host).length;
    const meta = document.createElement("small"); meta.className = "site-profile-meta"; meta.textContent = offers ? `${offers} oferta(s) usam este site` : "Nenhuma oferta deste site ainda";
    const selector = document.createElement("input"); selector.value = profile.selector || ""; selector.placeholder = "Seletor CSS"; selector.setAttribute("aria-label", `Seletor CSS para ${profile.host}`);
    const actions = document.createElement("div"); actions.className = "row-actions";
    actions.append(
      siteLockButton("Salvar", async () => {
        const value = selector.value.trim();
        if (!value) return showToast("Informe um seletor CSS.", true);
        await upsertSiteProfile(profile.host, value); showToast(`Seletor de ${profile.host} salvo.`);
      }),
      siteLockButton("Remover", async () => { data.siteProfiles = data.siteProfiles.filter(row => row.host !== profile.host); await persist(); renderSettings(); showToast(`${profile.host} removido dos sites travados.`); })
    );
    row.append(heading, meta, selector, actions); root.append(row);
  });

  const autoRoot = document.getElementById("autoSelectorsList");
  if (autoRoot) {
    autoRoot.replaceChildren();
    const learned = data.items.filter(item => item.autoSelector && !item.selector);
    if (!learned.length) siteLockEmpty(autoRoot, "Nada memorizado ainda. O Radar guarda o elemento quando uma leitura é confirmada.");
    learned.sort((a, b) => getSiteHost(a.url).localeCompare(getSiteHost(b.url)) || a.name.localeCompare(b.name)).forEach(item => {
      const host = getSiteHost(item.url);
      const profiled = Boolean(getSiteProfile(item.url));
      const row = document.createElement("div"); row.className = "site-profile-row";
      const heading = document.createElement("strong"); heading.className = "site-profile-host"; heading.textContent = item.name;
      const meta = document.createElement("small"); meta.className = "site-profile-meta";
      const misses = item.autoSelectorMisses || 0;
      meta.textContent = `${item.offerLabel || host}${profiled ? " · o site travado tem prioridade" : ""}${misses >= 2 ? ` · não encontrado nas últimas ${misses} leituras; o site pode ter mudado` : ""}`;
      if (misses >= 2) row.classList.add("lock-stale");
      const code = document.createElement("code"); code.className = "site-profile-code"; code.textContent = item.autoSelector;
      const actions = document.createElement("div"); actions.className = "row-actions";
      actions.append(
        siteLockButton("Usar no site todo", async () => { await upsertSiteProfile(host, item.autoSelector); showToast(`${host} travado com este elemento.`); }),
        siteLockButton("Esquecer", async () => { delete item.autoSelector; delete item.autoSelectorAt; await persist(); renderSettings(); showToast("Elemento esquecido. A próxima leitura usa a detecção normal."); })
      );
      row.append(heading, meta, code, actions); autoRoot.append(row);
    });
  }

  const rulesRoot = document.getElementById("builtinRulesList");
  if (rulesRoot) {
    rulesRoot.replaceChildren();
    for (const rule of radarSiteRules()) {
      const row = document.createElement("div"); row.className = "site-profile-row";
      const heading = document.createElement("strong"); heading.className = "site-profile-host"; heading.textContent = rule.name;
      const meta = document.createElement("small"); meta.className = "site-profile-meta"; meta.textContent = "Ativa automaticamente. Ignora preço “De”, preço por unidade, outros vendedores e recomendações. Um site travado por você tem prioridade.";
      row.append(heading, meta); rulesRoot.append(row);
    }
  }
}
