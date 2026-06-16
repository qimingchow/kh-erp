import { SEED_STATE, USER_SEED } from "../data/seed.js";
import { clone, todayString } from "./format.js";

const STORAGE_KEY = "kunhe-semiconductor-erp-v2";
const USER_STORAGE_KEY = "kunhe-semiconductor-erp-user-v2";

let state = loadState();
let auth = loadAuth();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return clone(SEED_STATE);

  try {
    return migrateState(JSON.parse(raw));
  } catch {
    return clone(SEED_STATE);
  }
}

function normalizeInboundRecord(item, index = 0) {
  const toList = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return String(value)
      .split(/[、,，;；]/)
      .map((part) => part.trim())
      .filter(Boolean);
  };
  const isNewShape = Boolean(item.customerName || item.productSpec || item.orderDate);
  if (isNewShape) {
    return {
      id: item.id || `in-${index + 1}`,
      customerName: item.customerName || "",
      date: item.date || item.orderDate || todayString(),
      orderDate: item.orderDate || item.date || todayString(),
      orderNo: item.orderNo || "",
      productSpec: item.productSpec || "",
      orderQty: Number(item.orderQty || 0),
      unit: item.unit || "K",
      unitPrice: item.unitPrice ?? "",
      amount: item.amount ?? "",
      deliveryDate: item.deliveryDate || "",
      note: item.note || "",
      processes: toList(item.processes),
      shapes: toList(item.shapes),
      binOptions: toList(item.binOptions),
      binOther: item.binOther || "",
      electrodeOptions: toList(item.electrodeOptions),
      labelFormats: toList(item.labelFormats),
      labelSizes: toList(item.labelSizes),
      labelPositions: toList(item.labelPositions),
      defectOptions: toList(item.defectOptions),
      inspectionOptions: toList(item.inspectionOptions),
      inspectionNote: item.inspectionNote || "",
      testCurrent: item.testCurrent || "",
      vz: item.vz || "",
      vf3: item.vf3 || "",
      ir: item.ir || "",
      testOther: item.testOther || "",
      testStandardName: item.testStandardName || "",
      sortingVf1: item.sortingVf1 || extractSortingValue(item.sortingRequirement, "VF1"),
      sortingVf3: item.sortingVf3 || extractSortingValue(item.sortingRequirement, "VF3"),
      sortingLop: item.sortingLop || extractSortingValue(item.sortingRequirement, "LOP"),
      sortingWld: item.sortingWld || extractSortingValue(item.sortingRequirement, "WLD"),
      sortingIr: item.sortingIr || extractSortingValue(item.sortingRequirement, "IR"),
      sortingOther: item.sortingOther || sortingOtherFromRequirement(item.sortingRequirement),
      sortingRequirement: item.sortingRequirement || "",
      updatedAt: item.updatedAt || item.orderDate || todayString(),
    };
  }

  return {
    id: item.id || `legacy-in-${index + 1}`,
    customerName: item.supplier || item.customerName || "",
    date: item.date || item.orderDate || todayString(),
    orderDate: item.date || item.orderDate || todayString(),
    orderNo: item.batch || item.orderNo || "",
    productSpec: [item.item, item.spec].filter(Boolean).join(" / "),
    orderQty: Number(item.qty || item.orderQty || 0),
    unit: item.unit || "K",
    unitPrice: item.unitPrice ?? "",
    amount: item.amount ?? "",
    deliveryDate: item.deliveryDate || "",
    note: item.note || "",
    processes: toList(item.processes),
    shapes: toList(item.shapes),
    binOptions: toList(item.binOptions),
    binOther: item.binOther || "",
    electrodeOptions: toList(item.electrodeOptions),
    labelFormats: toList(item.labelFormats),
    labelSizes: toList(item.labelSizes),
    labelPositions: toList(item.labelPositions),
    defectOptions: toList(item.defectOptions),
    inspectionOptions: toList(item.inspectionOptions),
    inspectionNote: item.inspectionNote || "",
    testCurrent: item.testCurrent || "",
    vz: item.vz || "",
    vf3: item.vf3 || "",
    ir: item.ir || "",
    testOther: item.testOther || "",
    testStandardName: item.testStandardName || "",
    sortingVf1: item.sortingVf1 || extractSortingValue(item.sortingRequirement, "VF1"),
    sortingVf3: item.sortingVf3 || extractSortingValue(item.sortingRequirement, "VF3"),
    sortingLop: item.sortingLop || extractSortingValue(item.sortingRequirement, "LOP"),
    sortingWld: item.sortingWld || extractSortingValue(item.sortingRequirement, "WLD"),
    sortingIr: item.sortingIr || extractSortingValue(item.sortingRequirement, "IR"),
    sortingOther: item.sortingOther || sortingOtherFromRequirement(item.sortingRequirement),
    sortingRequirement: item.sortingRequirement || "",
    updatedAt: item.updatedAt || item.date || todayString(),
  };
}

function extractSortingValue(value, key) {
  if (!value) return "";
  const pattern = new RegExp(`${key}\\s*[:：]\\s*([^;；\\n]+)`, "i");
  const match = String(value).match(pattern);
  return match?.[1]?.trim() || "";
}

function sortingOtherFromRequirement(value) {
  if (!value) return "";
  const cleaned = String(value)
    .replace(/VF1\s*[:：]\s*[^;；\n]+[;；]?/gi, "")
    .replace(/VF3\s*[:：]\s*[^;；\n]+[;；]?/gi, "")
    .replace(/LOP\s*[:：]\s*[^;；\n]+[;；]?/gi, "")
    .replace(/WLD\s*[:：]\s*[^;；\n]+[;；]?/gi, "")
    .replace(/IR\s*[:：]\s*[^;；\n]+[;；]?/gi, "")
    .trim();
  return cleaned || "";
}

function normalizeMachineRecord(item, index = 0) {
  if (item.type) return item;
  const groupIndex = Math.floor(index / 2) + 1;
  const isTest = index % 2 === 1;
  return {
    ...item,
    id: item.id || `m-${index + 1}`,
    type: isTest ? "测试机" : "分选机",
    name: isTest ? `测试机 T-${String(groupIndex).padStart(2, "0")}` : `分选机 S-${String(groupIndex).padStart(2, "0")}`,
    area: isTest ? "测试区" : "分选区",
  };
}

function normalizeInventoryRecord(item, index = 0) {
  const qty = Number(item.qty || 0);
  const safe = Number(item.safe || 0);
  const status = item.status === "冻结" ? "冻结" : qty <= safe ? "低库存" : item.status || "正常";
  return {
    id: item.id || `stock-${String(index + 1).padStart(3, "0")}`,
    code: item.code || `MAT-${String(index + 1).padStart(3, "0")}`,
    item: item.item || "",
    spec: item.spec || "",
    location: item.location || item.warehouse || "",
    qty,
    reserved: Number(item.reserved || 0),
    safe,
    unit: item.unit || "",
    status,
    cost: Number(item.cost || 0),
    note: item.note || "",
    lastUpdate: item.lastUpdate || item.date || todayString(),
  };
}

function normalizeOutboundRecord(item, index = 0, inventory = [], finance = []) {
  const matchedStock =
    (item.inventoryId && inventory.find((stock) => stock.id === item.inventoryId)) ||
    inventory.find(
      (stock) =>
        stock.item === item.item &&
        stock.spec === item.spec &&
        (stock.location === item.warehouse || stock.warehouse === item.warehouse),
    ) ||
    inventory.find((stock) => stock.item === item.item && stock.spec === item.spec) ||
    null;
  const orderNo = item.orderNo || "";
  const matchedFinance =
    (item.financeId && finance.find((record) => record.id === item.financeId)) ||
    (item.id && finance.find((record) => record.outboundId === item.id)) ||
    finance.find((record) => record.source === `出库单 ${orderNo}`) ||
    finance.find(
      (record) => orderNo && String(record.source || "").includes(orderNo) && (!item.customer || record.counterparty === item.customer),
    ) ||
    null;
  const qty = Number(item.qty || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const amount = item.amount !== undefined && item.amount !== "" ? Number(item.amount || 0) : Number((qty * unitPrice).toFixed(2));

  if (matchedFinance && item.id && !matchedFinance.outboundId) matchedFinance.outboundId = item.id;

  return {
    id: item.id || `out-${String(index + 1).padStart(3, "0")}`,
    inventoryId: item.inventoryId || matchedStock?.id || "",
    financeId: item.financeId || matchedFinance?.id || "",
    date: item.date || todayString(),
    customer: item.customer || item.counterparty || "",
    orderNo,
    item: item.item || matchedStock?.item || "",
    spec: item.spec || matchedStock?.spec || "",
    qty,
    unit: item.unit || matchedStock?.unit || "",
    unitPrice,
    amount,
    warehouse: item.warehouse || matchedStock?.location || "",
    logistics: item.logistics || "",
    settlement: item.settlement || matchedFinance?.status || "待收",
    note: item.note || "",
    updatedAt: item.updatedAt || item.date || todayString(),
  };
}

function migrateState(raw) {
  const base = clone(SEED_STATE);
  const next = { ...base, ...raw };
  next.ui = { ...base.ui, ...(raw.ui || {}) };
  next.inbound = Array.isArray(raw.inbound) ? raw.inbound.map((item, index) => normalizeInboundRecord(item, index)) : base.inbound;
  next.inventory = Array.isArray(raw.inventory) ? raw.inventory.map((item, index) => normalizeInventoryRecord(item, index)) : base.inventory;
  next.outbound = Array.isArray(raw.outbound)
    ? raw.outbound.map((item, index) => normalizeOutboundRecord(item, index, next.inventory, next.finance || []))
    : base.outbound;
  next.machines = Array.isArray(raw.machines) ? raw.machines.map((item, index) => normalizeMachineRecord(item, index)) : base.machines;
  return next;
}

function loadAuth() {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return clone(USER_SEED);
  try {
    return { ...clone(USER_SEED), ...JSON.parse(raw) };
  } catch {
    return clone(USER_SEED);
  }
}

export function getState() {
  return state;
}

export function getAuth() {
  return auth;
}

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth));
}

export function setActive(viewKey) {
  state.active = viewKey;
  saveState();
}

export function setUi(patch) {
  state.ui = { ...(state.ui || {}), ...patch };
  saveState();
}

export function clearUi(keys = []) {
  const next = { ...(state.ui || {}) };
  keys.forEach((key) => {
    next[key] = null;
  });
  state.ui = next;
  saveState();
}

export function mutateState(mutator) {
  const result = mutator(state) || { ok: true };
  if (result.ok === false) return result;
  saveState();
  return result;
}

export function restoreSeed() {
  state = clone(SEED_STATE);
  auth = clone(USER_SEED);
  saveState();
}

export function login(username, password) {
  const user = auth.users.find((item) => item.username === username && item.password === password);
  if (!user) return { ok: false, message: "账号或密码错误" };
  auth.activeUserId = user.id;
  saveState();
  return { ok: true, user };
}

export function logout() {
  auth.activeUserId = null;
  saveState();
}

export function getCurrentUser() {
  return auth.users.find((item) => item.id === auth.activeUserId) || null;
}

export function canEdit(user, resource) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return resource === "inbound";
}
