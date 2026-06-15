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
      electrodeOptions: toList(item.electrodeOptions),
      labelFormats: toList(item.labelFormats),
      labelSizes: toList(item.labelSizes),
      labelPositions: toList(item.labelPositions),
      defectOptions: toList(item.defectOptions),
      testCurrent: item.testCurrent || "",
      vz: item.vz || "",
      vf3: item.vf3 || "",
      ir: item.ir || "",
      testStandardName: item.testStandardName || "",
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
    electrodeOptions: toList(item.electrodeOptions),
    labelFormats: toList(item.labelFormats),
    labelSizes: toList(item.labelSizes),
    labelPositions: toList(item.labelPositions),
    defectOptions: toList(item.defectOptions),
    testCurrent: item.testCurrent || "",
    vz: item.vz || "",
    vf3: item.vf3 || "",
    ir: item.ir || "",
    testStandardName: item.testStandardName || "",
    sortingRequirement: item.sortingRequirement || "",
    updatedAt: item.updatedAt || item.date || todayString(),
  };
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

function migrateState(raw) {
  const base = clone(SEED_STATE);
  const next = { ...base, ...raw };
  next.ui = { ...base.ui, ...(raw.ui || {}) };
  next.inbound = Array.isArray(raw.inbound) ? raw.inbound.map((item, index) => normalizeInboundRecord(item, index)) : base.inbound;
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
