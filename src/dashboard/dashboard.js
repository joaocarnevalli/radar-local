const frame = document.getElementById("radarApp");
const sourceTab = Number(new URLSearchParams(location.search).get("sourceTab"));
if (sourceTab > 0) frame.src = "popup.html?dashboard=1&embedded=1&sourceTab=" + sourceTab;
const navButtons = [...document.querySelectorAll(".side-nav-link")];
const activeViewTitle = document.getElementById("activeViewTitle");
let selectedView = "itemsView";

function selectView(button, send = true) {
  selectedView = button.dataset.view;
  navButtons.forEach(nav => {
    const active = nav === button;
    nav.classList.toggle("active", active);
    if (active) nav.setAttribute("aria-current", "page");
    else nav.removeAttribute("aria-current");
  });
  activeViewTitle.textContent = button.dataset.title;
  if (send && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: "radar:navigate", view: selectedView }, location.origin);
  }
}

navButtons.forEach(button => button.addEventListener("click", () => selectView(button)));
document.querySelector(".brand-lockup")?.addEventListener("click", event => {
  event.preventDefault();
  if (navButtons[0]) selectView(navButtons[0]);
});
frame.addEventListener("load", () => {
  document.getElementById("dashboardExport").disabled = false;
  document.getElementById("dashboardFloating").disabled = false;
  const selected = navButtons.find(button => button.dataset.view === selectedView) || navButtons[0];
  selectView(selected);
});

document.getElementById("dashboardExport").addEventListener("click", () => {
  frame.contentWindow?.exportBackup?.();
});
document.getElementById("dashboardFloating").addEventListener("click", () => {
  frame.contentWindow?.openFloatingWindow?.();
});
