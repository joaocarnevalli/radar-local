var RadarMoney = (() => {
  function parse(value, currencyHint = "", allowZero = false) {
    if (value == null || typeof value === "object") return null;
    if (typeof value === "number") {
      const amount = Math.round((value + Number.EPSILON) * 100) / 100;
      return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && amount < 100000000 ? { amount, currency: /^[A-Z]{3}$/.test(currencyHint) ? currencyHint : "" } : null;
    }
    const raw = String(value).trim().replace(/\u00a0/g, " ");
    if (!raw || /%|\d\s*[x×]|parcela|frete|shipping/i.test(raw)) return null;
    const symbols = raw.match(/R\$|US\$|\bBRL\b|\bUSD\b|€|£|\$/gi) || [];
    if (symbols.length > 1) return null;
    const inferred = /R\$|\bBRL\b/i.test(raw) ? "BRL" : /US\$|\bUSD\b/i.test(raw) ? "USD" : raw.includes("€") ? "EUR" : raw.includes("£") ? "GBP" : "";
    const currency = inferred || (/^[A-Z]{3}$/.test(currencyHint) ? currencyHint : "");
    let number = raw.replace(/R\$|US\$|\bBRL\b|\bUSD\b|€|£|\$/gi, "").trim();
    if (!/^[\d.,]+$/.test(number)) return null;
    const dot = number.lastIndexOf("."), comma = number.lastIndexOf(",");
    if (dot >= 0 && comma >= 0) {
      const decimal = dot > comma ? "." : ",";
      const groups = number.split(decimal);
      if (groups.length !== 2 || !/^\d{1,2}$/.test(groups[1])) return null;
      const integer = groups[0], separator = decimal === "." ? "," : ".";
      if (!new RegExp(`^\\d{1,3}(?:\\${separator}\\d{3})+$`).test(integer)) return null;
      number = integer.split(separator).join("") + "." + groups[1];
    } else if (dot >= 0 || comma >= 0) {
      const separator = dot >= 0 ? "." : ",";
      const groups = number.split(separator);
      if (groups.length === 2 && /^\d{1,2}$/.test(groups[1])) number = groups.join(".");
      else if (/^\d{1,3}$/.test(groups[0]) && groups.slice(1).every(group => /^\d{3}$/.test(group))) number = groups.join("");
      else return null;
    }
    const amount = Math.round((Number(number) + Number.EPSILON) * 100) / 100;
    return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && amount < 100000000 ? { amount, currency } : null;
  }
  return { parse };
})();
if (typeof module !== "undefined") module.exports = RadarMoney;
