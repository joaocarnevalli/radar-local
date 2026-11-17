// Pastas: criação, seletor de pasta com cor e aba Pastas.
// Carregado como script clássico: compartilha o escopo global com popup.js (estado e init).

async function createFolder(event) {
  event.preventDefault();
  const input = document.getElementById("folderName");
  const name = input.value.trim();
  if (!name) return;
  if (data.folders.some(folder => folder.name.toLowerCase() === name.toLowerCase())) return showToast("Já existe uma pasta com esse nome.", true);
  data.folders.push({ id: crypto.randomUUID(), name, color: FOLDER_COLORS[0].value });
  input.value = "";
  await persist();

  renderAll();
  showToast("Pasta criada.");
}

function renderColorPicker(root, selected, onSelect, label) {
  root.replaceChildren();
  root.classList.add("color-picker");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", label);
  FOLDER_COLORS.forEach(color => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.style.setProperty("--swatch-color", color.value);
    swatch.title = color.name;
    swatch.setAttribute("aria-label", color.name);
    swatch.setAttribute("aria-pressed", String(selected === color.value));
    if (selected === color.value) swatch.classList.add("selected");
    swatch.addEventListener("click", () => onSelect(color.value));
    root.append(swatch);
  });
}

function getFolderColor(folder, index = 0) {
  return FOLDER_COLORS.find(color => color.value === folder?.color)?.value || FOLDER_COLORS[0].value;
}

function fillFolderSelect(select, selected, includeNoFolder = false) {
  if (!select) return;
  select.classList.add("folder-select");
  select.replaceChildren();
  if (includeNoFolder) addOption(select, NO_FOLDER, "Sem pasta");
  data.folders.forEach(folder => addOption(select, folder.id, folder.name, getFolderColor(folder)));
  select.value = [...select.options].some(option => option.value === selected) ? selected : (includeNoFolder ? NO_FOLDER : data.folders[0]?.id || NO_FOLDER);
  updateFolderSelectColor(select);
  if (select.dataset.folderColorHandler !== "bound") {
    select.addEventListener("change", () => {
      updateFolderSelectColor(select);
      updateFolderPickerSelection(select);
    });
    select.dataset.folderColorHandler = "bound";
  }
  syncFolderPicker(select);
}

function updateFolderSelectColor(select) {
  const folder = data.folders.find(row => row.id === select.value);
  if (!folder) {
    select.style.removeProperty("--folder-accent");
    return;
  }
  select.style.setProperty("--folder-accent", getFolderColor(folder));
}

function syncFolderPicker(select) {
  if (!select?.parentElement) return;
  let picker = select.nextElementSibling;
  if (!picker?.classList.contains("folder-picker")) {
    picker = document.createElement("details");
    picker.className = "folder-picker";
    const trigger = document.createElement("summary");
    trigger.className = "folder-picker-trigger";
    trigger.innerHTML = '<span class="folder-picker-current"><span class="folder-picker-dot" aria-hidden="true"></span><span class="folder-picker-name"></span></span><svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5"/></svg>';
    const menu = document.createElement("div");
    menu.className = "folder-picker-menu";
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "Escolher pasta");
    picker.append(trigger, menu);
    select.after(picker);
    picker.addEventListener("toggle", () => {
      if (picker.open) positionFolderPicker(picker);
    });
    picker.addEventListener("keydown", event => {
      if (event.key === "Escape" && picker.open) {
        picker.open = false;
        picker.querySelector("summary")?.focus();
      }
    });
    if (!document.documentElement.dataset.folderPickerOutsideHandler) {
      document.addEventListener("pointerdown", event => {
        document.querySelectorAll(".folder-picker[open]").forEach(openPicker => {
          if (!openPicker.contains(event.target)) openPicker.open = false;
        });
      }, true);
      document.documentElement.dataset.folderPickerOutsideHandler = "bound";
    }
    select.classList.add("folder-native-select");
  }

  const menu = picker.querySelector(".folder-picker-menu");
  menu.replaceChildren();
  [...select.options].forEach(option => {
    const folder = data.folders.find(row => row.id === option.value);
    const color = folder ? getFolderColor(folder) : "";
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "folder-picker-option";
    choice.setAttribute("aria-pressed", "false");
    choice.dataset.value = option.value;
    choice.innerHTML = '<span class="folder-picker-dot" aria-hidden="true"></span><span class="folder-picker-option-name"></span>';
    choice.querySelector(".folder-picker-option-name").textContent = option.textContent;
    if (color) choice.style.setProperty("--folder-accent", color);
    choice.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      picker.open = false;
    });
    menu.append(choice);
  });
  updateFolderPickerSelection(select);
}

function updateFolderPickerSelection(select) {
  const picker = select?.nextElementSibling;
  if (!picker?.classList.contains("folder-picker")) return;
  const option = [...select.options].find(row => row.value === select.value);
  const folder = data.folders.find(row => row.id === select.value);
  const color = folder ? getFolderColor(folder) : "";
  const dot = picker.querySelector(".folder-picker-current .folder-picker-dot");
  const name = picker.querySelector(".folder-picker-name");
  name.textContent = option?.textContent || "Selecionar pasta";
  picker.querySelector(".folder-picker-trigger")?.setAttribute("aria-label", `Pasta: ${name.textContent}`);
  dot.style.setProperty("--folder-accent", color || "transparent");
  picker.style.setProperty("--folder-accent", color || "transparent");
  picker.querySelectorAll(".folder-picker-option").forEach(choice => {
    choice.setAttribute("aria-pressed", String(choice.dataset.value === select.value));
  });
}

function positionFolderPicker(picker) {
  const trigger = picker.querySelector(".folder-picker-trigger");
  const menu = picker.querySelector(".folder-picker-menu");
  const bounds = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(bounds.left, window.innerWidth - bounds.width - 6))}px`;
  menu.style.width = `${bounds.width}px`;
  menu.style.top = `${bounds.bottom + 4}px`;
  requestAnimationFrame(() => {
    const menuBounds = menu.getBoundingClientRect();
    if (menuBounds.bottom > window.innerHeight - 6) {
      menu.style.top = `${Math.max(6, bounds.top - menuBounds.height - 4)}px`;
    }
  });
}

function addOption(select, value, text, color = "") {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  if (color) {
    option.dataset.folderColor = "true";
    option.style.setProperty("--option-folder-color", color);
    option.style.color = color;
  }
  select.append(option);
}

function renderFolders() {
  const root = document.getElementById("foldersList"); root.replaceChildren();
  data.folders.forEach((folder, index) => {
    const row = document.createElement("div"); row.className = "folder-row"; row.style.setProperty("--folder-color", getFolderColor(folder, index));
    const label = document.createElement("div"); label.className = "folder-label"; label.textContent = folder.name;
    const count = document.createElement("span"); count.className = "folder-count"; count.textContent = `${data.products.filter(product => product.folderId === folder.id).length} produtos`; label.append(count);
    const actions = document.createElement("div"); actions.className = "folder-actions";
    const rename = document.createElement("button"); rename.className = "icon-action"; rename.textContent = "Renomear";
    rename.addEventListener("click", async () => { const value = await radarPrompt("Renomear pasta", { value: folder.name, placeholder: "Nome da pasta", validate: text => text ? "" : "Informe um nome." }); if (!value || value === folder.name) return; if (data.folders.some(other => other.id !== folder.id && other.name.toLowerCase() === value.toLowerCase())) return showToast("Já existe uma pasta com esse nome.", true); folder.name = value; await persist(); renderAll(); });
    const del = document.createElement("button"); del.className = "icon-action danger"; del.textContent = "Apagar";
    del.addEventListener("click", async () => { if (!await radarConfirm("Os produtos serão mantidos em “Sem pasta”.", { title: `Apagar a pasta “${folder.name}”?`, confirmLabel: "Apagar", danger: true })) return; data.products.forEach(product => { if (product.folderId === folder.id) product.folderId = NO_FOLDER; }); data.items.forEach(item => { if (item.folderId === folder.id) item.folderId = NO_FOLDER; }); data.folders = data.folders.filter(other => other.id !== folder.id); collapsedGroups.delete(folder.id); await persist(); renderAll(); });
    actions.append(rename, del);
    const colorLabel = document.createElement("span"); colorLabel.className = "folder-color-caption"; colorLabel.textContent = "Cor de identificação";
    const palette = document.createElement("div");
    renderColorPicker(palette, getFolderColor(folder, index), async color => { folder.color = color; await persist(); renderAll(); }, `Cor da pasta ${folder.name}`);
    row.append(label, actions, colorLabel, palette); root.append(row);
  });
  if (!data.folders.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "Crie pastas como Certificados, Cursos ou Jogos."; root.append(empty); }
}
