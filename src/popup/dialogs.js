// Diálogos da própria interface, no lugar de prompt()/confirm() do navegador.
// Funções declaradas com "function" para ficarem disponíveis globalmente no popup e no painel.

function radarDialog({ title = "", message = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, input = null } = {}) {
  return new Promise(resolve => {
    document.querySelector("dialog.radar-dialog")?.close();
    const dialog = document.createElement("dialog");
    dialog.className = "radar-dialog";
    dialog.setAttribute("aria-labelledby", "radarDialogTitle");
    const form = document.createElement("form");
    form.method = "dialog";
    const heading = document.createElement("strong");
    heading.id = "radarDialogTitle";
    heading.className = "radar-dialog-title";
    heading.textContent = title || message;
    form.append(heading);
    if (title && message) {
      const text = document.createElement("p");
      text.className = "radar-dialog-message";
      text.textContent = message;
      form.append(text);
    }
    let field = null, error = null;
    if (input) {
      field = document.createElement("input");
      field.className = "radar-dialog-input";
      field.value = input.value ?? "";
      field.placeholder = input.placeholder || "";
      field.setAttribute("aria-label", input.label || title || message);
      if (input.inputMode) field.inputMode = input.inputMode;
      error = document.createElement("small");
      error.className = "radar-dialog-error";
      error.setAttribute("role", "alert");
      form.append(field, error);
    }
    const actions = document.createElement("div");
    actions.className = "radar-dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = cancelLabel;
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.className = danger ? "radar-dialog-danger" : "primary";
    confirm.textContent = confirmLabel;
    actions.append(cancel, confirm);
    form.append(actions);
    dialog.append(form);
    document.body.append(dialog);

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => finish(input ? null : false));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(input ? null : false); });
    dialog.addEventListener("click", event => { if (event.target === dialog) finish(input ? null : false); });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!input) return finish(true);
      const value = field.value.trim();
      const problem = typeof input.validate === "function" ? input.validate(value) : "";
      if (problem) { error.textContent = problem; field.focus(); field.select(); return; }
      finish(value);
    });
    dialog.showModal();
    if (field) { field.focus(); field.select(); }
    else (danger ? cancel : confirm).focus();
  });
}

function radarConfirm(message, options = {}) {
  return radarDialog({ ...options, message: options.title ? message : "", title: options.title || message });
}

function radarPrompt(title, options = {}) {
  return radarDialog({ title, message: options.message || "", confirmLabel: options.confirmLabel || "Salvar", input: { value: options.value, placeholder: options.placeholder, inputMode: options.inputMode, validate: options.validate } });
}
