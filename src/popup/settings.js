// Configurações: leitura, normalização, gravação e controles da aba Configurações.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

async function loadSettings() {
  const saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  return normalizeSettings(saved);
}

function normalizeSettings(saved = {}) {
  const pace = Number(saved.startupRefreshPaceMinutes);
  const savedStaleMinutes = Number(saved.startupRefreshStaleMinutes);
  const staleHours = Number(saved.startupRefreshStaleHours);
  const staleUnit = ["minutes", "hours", "days"].includes(saved.startupRefreshStaleUnit) ? saved.startupRefreshStaleUnit : (!saved.startupRefreshStaleUnit && staleHours === 168 ? "days" : "hours");
  const staleMinutes = Number.isFinite(savedStaleMinutes) ? savedStaleMinutes : Number.isFinite(staleHours) ? staleHours * 60 : 1440;
  const accentColor = /^#[0-9a-f]{6}$/i.test(saved.accentColor || "") ? saved.accentColor : DEFAULT_ACCENT_COLOR;
  return {
    startupRefreshEnabled: saved.startupRefreshEnabled === true,
    periodicRefreshEnabled: saved.periodicRefreshEnabled === true,
    periodicRefreshHours: [1, 2, 3, 6, 12, 24].includes(Number(saved.periodicRefreshHours)) ? Number(saved.periodicRefreshHours) : 6,
    startupRefreshPaceMinutes: Number.isFinite(pace) ? Math.min(60, Math.max(0.5, Math.round(pace * 2) / 2)) : 5,
    startupRefreshStaleMinutes: Math.min(525600, Math.max(1, Math.round(staleMinutes))),
    startupRefreshStaleUnit: staleUnit,
    defaultFolderId: typeof saved.defaultFolderId === "string" ? saved.defaultFolderId : NO_FOLDER,
    priceAlertsEnabled: saved.priceAlertsEnabled === true,
    priceAlertSoundEnabled: saved.priceAlertSoundEnabled === true,
    priceAlertVolume: Math.min(100, Math.max(0, Number.isFinite(Number(saved.priceAlertVolume)) ? Number(saved.priceAlertVolume) : 35)),
    priceAlertCooldownMinutes: Math.min(1440, Math.max(0, Number.isFinite(Number(saved.priceAlertCooldownMinutes)) ? Number(saved.priceAlertCooldownMinutes) : 15)),
    priceAlertSoundStyle: ["radar", "chime", "double", "rise", "calm", "bell", "down", "pulse"].includes(saved.priceAlertSoundStyle) ? saved.priceAlertSoundStyle : "radar",
    priceAlertMinDropPercent: Math.min(99, Math.max(0, Number.isFinite(Number(saved.priceAlertMinDropPercent)) ? Number(saved.priceAlertMinDropPercent) : 0)),
    priceAlertNewLowEnabled: saved.priceAlertNewLowEnabled === true,
    quietHoursEnabled: saved.quietHoursEnabled === true,
    quietHoursStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.quietHoursStart || "") ? saved.quietHoursStart : "22:00",
    quietHoursEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.quietHoursEnd || "") ? saved.quietHoursEnd : "08:00",
    priceAnomalyGuardEnabled: saved.priceAnomalyGuardEnabled !== false,
    priceAnomalyThresholdPercent: Math.min(95, Math.max(10, Number.isFinite(Number(saved.priceAnomalyThresholdPercent)) ? Number(saved.priceAnomalyThresholdPercent) : 50)),
    priceSourceEnabled: saved.priceSourceEnabled !== false,
    priceHistoryChartEnabled: saved.priceHistoryChartEnabled !== false,
    contextMenuEnabled: saved.contextMenuEnabled === true,
    accentColor
  };
}

async function persistSettings() {
  const snapshot = normalizeSettings(settings);
  const before = settingsBaseline;
  settingsBaseline = RadarData.clone(snapshot);
  pendingSettingsWrites += 1;
  try { await RadarData.saveSettings(before, snapshot); }
  finally {
    pendingSettingsWrites -= 1;
    if (!pendingSettingsWrites) { settings = await loadSettings(); settingsBaseline = RadarData.clone(settings); await renderSettings(); }
  }
}

function normalizePace(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(60, Math.max(0.5, Math.round(number * 2) / 2));
}

function previewPace(value) {
  const pace = normalizePace(value);
  if (pace == null) return;
  document.getElementById("startupRefreshPaceMinutes").value = String(pace);
  document.getElementById("startupRefreshPaceSlider").value = String(pace);
  updatePaceWarning(pace);
}

function updatePaceWarning(value) {
  const warning = document.getElementById("startupPaceWarning");
  const pace = Number(value);
  warning.classList.toggle("hidden", !Number.isFinite(pace) || pace >= 1);
}

async function savePace(value) {
  const pace = normalizePace(value);
  if (pace == null) {
    document.getElementById("startupRefreshPaceMinutes").value = String(settings.startupRefreshPaceMinutes);
    return updatePaceWarning(settings.startupRefreshPaceMinutes);
  }
  settings.startupRefreshPaceMinutes = pace;
  document.getElementById("startupRefreshPaceMinutes").value = String(pace);
  document.getElementById("startupRefreshPaceSlider").value = String(pace);
  updatePaceWarning(pace);
  await persistSettings();
  showToast(`Intervalo salvo: ${formatPace(pace)} entre páginas.`);
}

function formatPace(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)} segundos`;
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

function staleValueFromMinutes(minutes = settings.startupRefreshStaleMinutes, unit = settings.startupRefreshStaleUnit) {
  if (unit === "days") return Math.ceil(minutes / 1440);
  if (unit === "hours") return Math.ceil(minutes / 60);
  return Math.min(59, Math.max(1, minutes));
}

function syncStaleControls() {
  const slider = document.getElementById("startupRefreshStaleSlider");
  const input = document.getElementById("startupRefreshStaleValue");
  const unit = document.getElementById("startupRefreshStaleUnit");
  const unitName = settings.startupRefreshStaleUnit;
  const min = 1;
  const max = unitName === "days" ? 365 : unitName === "hours" ? 8760 : 59;
  const value = Math.min(max, Math.max(min, staleValueFromMinutes()));
  slider.min = input.min = String(min);
  slider.max = input.max = String(max);
  slider.step = input.step = "1";
  slider.value = input.value = String(value);
  unit.value = settings.startupRefreshStaleUnit;
}

function previewStaleThreshold(value) {
  const unit = settings.startupRefreshStaleUnit;
  const max = unit === "days" ? 365 : unit === "hours" ? 8760 : 59;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const normalized = Math.min(max, Math.max(1, Math.round(parsed)));
  document.getElementById("startupRefreshStaleValue").value = String(normalized);
  document.getElementById("startupRefreshStaleSlider").value = String(normalized);
}

function updateStaleSlider(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const max = settings.startupRefreshStaleUnit === "days" ? 365 : settings.startupRefreshStaleUnit === "hours" ? 8760 : 59;
  document.getElementById("startupRefreshStaleSlider").value = String(Math.min(max, Math.max(1, Math.round(parsed))));
}

async function saveStaleThreshold(value) {
  const unit = settings.startupRefreshStaleUnit;
  const max = unit === "days" ? 365 : unit === "hours" ? 8760 : 59;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return syncStaleControls();
  const normalized = Math.min(max, Math.max(1, Math.round(parsed)));
  const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
  settings.startupRefreshStaleMinutes = normalized * multiplier;
  syncStaleControls();
  await persistSettings();
  renderItems();
  showToast(`Itens verificados há mais de ${formatStaleThreshold()} entrarão na fila.`);
}

async function onStaleUnitChange(event) {
  settings.startupRefreshStaleUnit = ["minutes", "hours", "days"].includes(event.target.value) ? event.target.value : "hours";
  const value = staleValueFromMinutes(settings.startupRefreshStaleMinutes, settings.startupRefreshStaleUnit);
  const multiplier = settings.startupRefreshStaleUnit === "days" ? 1440 : settings.startupRefreshStaleUnit === "hours" ? 60 : 1;
  settings.startupRefreshStaleMinutes = value * multiplier;
  syncStaleControls();
  await persistSettings();
  renderItems();
}

function formatStaleThreshold() {
  const value = staleValueFromMinutes();
  const unit = settings.startupRefreshStaleUnit;
  const label = unit === "days" ? (value === 1 ? "dia" : "dias") : unit === "hours" ? (value === 1 ? "hora" : "horas") : (value === 1 ? "minuto" : "minutos");
  return `${value} ${label}`;
}

function updateAccentPreview(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  document.documentElement.style.setProperty("--accent", color);
  document.getElementById("accentColorValue").textContent = color.toUpperCase();
}

async function onAccentColorChange(event) {
  settings.accentColor = event.target.value.toLowerCase();
  updateAccentPreview(settings.accentColor);
  await persistSettings();
}

async function resetAccentColor() {
  settings.accentColor = DEFAULT_ACCENT_COLOR;
  document.getElementById("accentColor").value = DEFAULT_ACCENT_COLOR;
  updateAccentPreview(DEFAULT_ACCENT_COLOR);
  await persistSettings();
  showToast("A cor padrão do Radar Local foi restaurada.");
}

async function onPriceAlertsToggle(event) {
  const enabled = event.target.checked;
  if (enabled) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ["notifications"] }); } catch {}
    if (!granted) {
      event.target.checked = false;
      showToast("Permissão de notificações não concedida; alertas continuam desligados.", true);
      return;
    }
  }
  settings.priceAlertsEnabled = enabled;
  await persistSettings();
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Radar Local" });
  }
  showToast(enabled ? "Alertas de preço ativados." : "Alertas de preço desativados.");
}

async function onPriceAlertSoundToggle(event) {
  if (event.target.checked) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ["offscreen"] }); } catch {}
    if (!granted) {
      event.target.checked = false;
      showToast("Permissão de áudio em segundo plano não concedida; som continua desligado.", true);
      return;
    }
  }
  settings.priceAlertSoundEnabled = event.target.checked;
  await persistSettings();
  showToast(settings.priceAlertSoundEnabled ? "Som de alerta ativado." : "Som de alerta desativado.");
}

function onPriceAlertVolumeInput(event) {
  const volume = Math.min(100, Math.max(0, Math.round(Number(event.target.value) || 0)));
  document.getElementById("priceAlertVolumeValue").value = String(volume);
  document.getElementById("priceAlertVolume").style.setProperty("--range-progress", `${volume}%`);
}

function onPriceAlertVolumeValueInput(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) return;
  const volume = Math.round(value);
  document.getElementById("priceAlertVolume").value = String(volume);
  document.getElementById("priceAlertVolume").style.setProperty("--range-progress", `${volume}%`);
}

async function onPriceAlertVolumeChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) { event.target.value = String(settings.priceAlertVolume); return; }
  settings.priceAlertVolume = Math.min(100, Math.max(0, Math.round(value)));
  document.getElementById("priceAlertVolume").value = String(settings.priceAlertVolume);
  document.getElementById("priceAlertVolumeValue").value = String(settings.priceAlertVolume);
  document.getElementById("priceAlertVolume").style.setProperty("--range-progress", `${settings.priceAlertVolume}%`);
  await persistSettings();
}

async function onSoundCooldownChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) { event.target.value = String(settings.priceAlertCooldownMinutes); return; }
  settings.priceAlertCooldownMinutes = Math.min(1440, Math.max(0, Math.round(value)));
  event.target.value = String(settings.priceAlertCooldownMinutes);
  await persistSettings();
  showToast(settings.priceAlertCooldownMinutes ? `Novo beep do mesmo item após ${settings.priceAlertCooldownMinutes} min.` : "Beep permitido em todo novo alerta.");
}

async function testAlertSound() {
  const button = document.getElementById("testAlertSound");
  const status = document.getElementById("soundTestStatus");
  button.disabled = true;
  status.textContent = "Preparando áudio…";
  try {
    const granted = await chrome.permissions.request({ permissions: ["offscreen"] });
    if (!granted) throw new Error("Permissão de áudio não concedida.");
    settings.priceAlertVolume = Number(document.getElementById("priceAlertVolumeValue").value);
    await persistSettings();
    const response = await chrome.runtime.sendMessage({ type: "radar:test-sound", volume: settings.priceAlertVolume, style: settings.priceAlertSoundStyle });
    if (!response?.ok) throw new Error(response?.error || "O áudio não confirmou a reprodução.");
    status.textContent = settings.priceAlertVolume === 0 ? "Volume em 0%; aumente a barra para ouvir." : "Som reproduzido. Ajuste o volume e teste novamente.";
  } catch (error) {
    status.textContent = error.message || "Não foi possível tocar o som.";
  } finally {
    button.disabled = false;
  }
}

async function renderSettings() {
  const enabled = document.getElementById("startupRefreshEnabled");
  if (!enabled) return;
  enabled.checked = settings.startupRefreshEnabled;
  document.getElementById("periodicRefreshEnabled").checked = settings.periodicRefreshEnabled;
  document.getElementById("periodicRefreshHours").value = String(settings.periodicRefreshHours);
  document.getElementById("periodicRefreshHours").disabled = !settings.periodicRefreshEnabled;
  document.getElementById("startupRefreshPaceMinutes").value = String(settings.startupRefreshPaceMinutes);
  document.getElementById("startupRefreshPaceSlider").value = String(settings.startupRefreshPaceMinutes);
  updatePaceWarning(settings.startupRefreshPaceMinutes);
  syncStaleControls();
  renderSiteProfiles();
  let alertPreferencesChanged = false;
  if (settings.priceAlertsEnabled && !await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false)) {
    settings.priceAlertsEnabled = false;
    alertPreferencesChanged = true;
  }
  if (settings.priceAlertSoundEnabled && !await chrome.permissions.contains({ permissions: ["offscreen"] }).catch(() => false)) {
    settings.priceAlertSoundEnabled = false;
    alertPreferencesChanged = true;
  }
  if (settings.contextMenuEnabled && !await chrome.permissions.contains({ permissions: ["contextMenus"] }).catch(() => false)) {
    settings.contextMenuEnabled = false;
    alertPreferencesChanged = true;
  }
  if (alertPreferencesChanged) { const next = RadarData.clone(settings); await RadarData.saveSettings(settingsBaseline, next); settingsBaseline = next; }
  document.getElementById("priceAlertsEnabled").checked = settings.priceAlertsEnabled;
  const soundToggle = document.getElementById("priceAlertSoundEnabled");
  soundToggle.checked = settings.priceAlertSoundEnabled;
  const volume = document.getElementById("priceAlertVolume");
  volume.value = String(settings.priceAlertVolume);
  volume.style.setProperty("--range-progress", `${settings.priceAlertVolume}%`);
  document.getElementById("priceAlertVolumeValue").value = String(settings.priceAlertVolume);
  document.getElementById("priceAlertCooldownMinutes").value = String(settings.priceAlertCooldownMinutes);
  document.getElementById("priceAlertMinDropPercent").value = String(settings.priceAlertMinDropPercent);
  document.getElementById("priceAnomalyThresholdPercent").value = String(settings.priceAnomalyThresholdPercent);
  document.getElementById("priceAnomalyThresholdPercent").disabled = !settings.priceAnomalyGuardEnabled;
  document.getElementById("priceAlertNewLowEnabled").checked = settings.priceAlertNewLowEnabled;
  document.getElementById("quietHoursEnabled").checked = settings.quietHoursEnabled;
  document.getElementById("quietHoursStart").value = settings.quietHoursStart;
  document.getElementById("quietHoursEnd").value = settings.quietHoursEnd;
  document.getElementById("priceAnomalyGuardEnabled").checked = settings.priceAnomalyGuardEnabled;
  document.getElementById("priceSourceEnabled").checked = settings.priceSourceEnabled;
  document.getElementById("priceHistoryChartEnabled").checked = settings.priceHistoryChartEnabled;
  document.getElementById("contextMenuEnabled").checked = settings.contextMenuEnabled;
  document.getElementById("priceAlertSoundStyle").value = settings.priceAlertSoundStyle;
  document.getElementById("accentColor").value = settings.accentColor;
  updateAccentPreview(settings.accentColor);
  const folderSelect = document.getElementById("defaultFolder");
  fillFolderSelect(folderSelect, settings.defaultFolderId, true);
  settings.defaultFolderId = folderSelect.value;
  const status = document.getElementById("startupRefreshStatus");
  const stored = (await chrome.storage.local.get(AUTO_STATUS_KEY))[AUTO_STATUS_KEY];
  const queue = (await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue;
  const queueControls = document.getElementById("startupQueueControls");
  queueControls.classList.toggle("hidden", !queue?.ids?.length);
  document.getElementById("pauseStartupQueue").textContent = queue?.paused ? "Retomar fila" : "Pausar fila";
  const bytesInUse = await chrome.storage.local.getBytesInUse(null).catch(() => 0);
  const unlimitedStorage = chrome.runtime.getManifest().permissions?.includes("unlimitedStorage");
  document.getElementById("storageUsage").textContent = unlimitedStorage ? `Dados locais: ${formatBytes(bytesInUse)} usados neste navegador.` : `Dados locais: ${formatBytes(bytesInUse)} usados (limite padrão do Chrome: 10 MB).`;
  if (!settings.startupRefreshEnabled) {
    status.textContent = "Desativada. Nenhuma página será aberta automaticamente.";
    return;
  }
  if (queue?.ids?.length) {
    status.textContent = `${queue.paused ? "Fila pausada" : "Fila em andamento"}: ${queue.updated || 0} atualizado(s), ${queue.review || 0} para revisar, ${queue.ids.length} restante(s).`;
  } else if (stored?.lastRun) {
    const when = formatDate(stored.lastRun);
    status.textContent = `Última execução: ${when} · ${stored.updated || 0} atualizados${stored.review ? ` · ${stored.review} para revisar` : ""}${stored.skipped ? ` · ${stored.skipped} ignorados` : ""}.`;
  } else {
    status.textContent = `Ativa para o próximo início: fila de itens sem atualização há ${formatStaleThreshold()}, com intervalo de ${formatPace(settings.startupRefreshPaceMinutes)} entre páginas.`;
  }
}
