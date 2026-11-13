(() => {
  const params = new URLSearchParams(location.search);
  const dashboardMode = params.get("dashboard") === "1";
  const dashboardEmbed = params.get("embedded") === "1";
  document.documentElement.classList.toggle("dashboard-mode", dashboardMode);
  document.documentElement.classList.toggle("dashboard-embed", dashboardEmbed);
})();
