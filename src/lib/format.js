export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

export function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replaceAll(",", "").replace(/\s+/g, "").toLowerCase();
  const kkMatch = normalized.match(/^(-?\d+(?:\.\d+)?)kk$/);
  if (kkMatch) return Number(kkMatch[1]) * 1000;
  const kMatch = normalized.match(/^(-?\d+(?:\.\d+)?)k$/);
  if (kMatch) return Number(kMatch[1]);
  const numeric = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sum(list, selector) {
  return list.reduce((total, item) => total + Number(selector(item) || 0), 0);
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function timestampNow() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}
