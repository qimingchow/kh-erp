import { SEED_STATE, USER_SEED } from "../data/seed.js";
import { clone, todayString } from "./format.js";

const STORAGE_KEY = "kunhe-semiconductor-erp-v2";
const USER_STORAGE_KEY = "kunhe-semiconductor-erp-user-v2";
const TOKEN_STORAGE_KEY = "kunhe-semiconductor-erp-token-v2";

let state = loadState();
let auth = loadAuth();
let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || "";
let remoteAuthMode = false;

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
  const groupIndex = Math.floor(index / 2) + 1;
  const isTest = index % 2 === 1;
  const defaultGroup = item.type === "测试机" || isTest ? "测试组" : "分选组";
  const existingGroup = item.group && item.group !== item.area ? item.group : "";
  if (item.type) {
    return {
      ...item,
      group: existingGroup || item.productionGroup || defaultGroup,
      status: item.status || "待机",
      job: item.job || "等待排产",
      progress: Math.max(0, Math.min(100, Number(item.progress || 0))),
      updatedAt: item.updatedAt || todayString(),
    };
  }
  return {
    ...item,
    id: item.id || `m-${index + 1}`,
    type: isTest ? "测试机" : "分选机",
    name: isTest ? `测试机 T-${String(groupIndex).padStart(2, "0")}` : `分选机 S-${String(groupIndex).padStart(2, "0")}`,
    area: isTest ? "测试区" : "分选区",
    group: item.group || item.productionGroup || `生产组 ${String(groupIndex).padStart(2, "0")}`,
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
  const settlement = item.settlement || matchedFinance?.status || "待收";
  const paidFromFinance = matchedFinance?.paidAmount;
  let paidAmount =
    item.paidAmount !== undefined
      ? Number(item.paidAmount || 0)
      : paidFromFinance !== undefined
        ? Number(paidFromFinance || 0)
        : settlement === "已收"
          ? amount
          : 0;
  if (settlement === "待收") paidAmount = 0;
  if (settlement === "已收") paidAmount = amount;
  paidAmount = Math.max(0, Math.min(amount, paidAmount));
  const remainingAmount =
    item.remainingAmount !== undefined ? Math.max(0, Number(item.remainingAmount || 0)) : Math.max(0, amount - paidAmount);

  if (matchedFinance && item.id && !matchedFinance.outboundId) matchedFinance.outboundId = item.id;
  if (matchedFinance) {
    matchedFinance.paidAmount = paidAmount;
    matchedFinance.remainingAmount = remainingAmount;
  }

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
    paidAmount,
    remainingAmount,
    warehouse: item.warehouse || matchedStock?.location || "",
    logistics: item.logistics || "",
    settlement,
    note: item.note || "",
    updatedAt: item.updatedAt || item.date || todayString(),
  };
}

function normalizeProductionRecord(item, index = 0) {
  let progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
  let status = item.status || "待排产";
  if (status === "已完成" || progress >= 100) {
    status = "已完成";
    progress = 100;
  } else if (progress <= 0) {
    status = "待排产";
    progress = 0;
  } else if (status === "待排产") {
    status = "进行中";
  }

  return {
    id: item.id || `plan-${String(index + 1).padStart(3, "0")}`,
    planNo: item.planNo || "",
    orderNo: item.orderNo || "",
    item: item.item || "",
    qty: Number(item.qty || 0),
    unit: item.unit || "K",
    unitPrice: item.unitPrice ?? "",
    amount: item.amount ?? "",
    startDate: item.startDate || item.orderDate || item.createdAt || item.dueDate || todayString(),
    dueDate: item.dueDate || todayString(),
    machineGroup: item.machineGroup || item.group || "",
    machineId: item.machineId || "",
    priority: item.priority || "标准",
    status,
    progress,
    note: item.note || "",
    inventoryId: item.inventoryId || "",
    stockedQty: Number(item.stockedQty || 0),
    stockedAt: item.stockedAt || "",
    updatedAt: item.updatedAt || item.dueDate || todayString(),
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
  next.production = Array.isArray(raw.production)
    ? raw.production.map((item, index) => normalizeProductionRecord(item, index))
    : base.production;
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

export function getAuthToken() {
  return authToken;
}

export function setAuthToken(token = "") {
  authToken = token || "";
  if (authToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function applyServerBootstrap(payload) {
  remoteAuthMode = Boolean(payload?.serverMode);
  if (payload?.state) {
    const previousActive = state.active;
    const previousUi = state.ui || {};
    const incoming = migrateState(payload.state);
    state = {
      ...incoming,
      active: previousActive || incoming.active,
      ui: {
        ...(previousUi || {}),
        ...(incoming.ui || {}),
      },
    };
  }
  if (payload?.auth) {
    auth = {
      activeUserId: payload.auth.activeUserId || payload.currentUser?.id || null,
      users: Array.isArray(payload.auth.users) ? payload.auth.users : payload.currentUser ? [payload.currentUser] : [],
    };
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "token")) setAuthToken(payload.token || "");
  saveState();
}

export function saveState() {
  if (remoteAuthMode) return;
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
  remoteAuthMode = false;
  setAuthToken("");
  saveState();
}

export function login(username, password) {
  const user = auth.users.find((item) => item.username === username && item.password === password && item.active !== false);
  if (!user) return { ok: false, message: "账号或密码错误" };
  auth.activeUserId = user.id;
  saveState();
  return { ok: true, user };
}

export function logout() {
  auth.activeUserId = null;
  setAuthToken("");
  saveState();
}

export function getCurrentUser() {
  return auth.users.find((item) => item.id === auth.activeUserId && item.active !== false) || null;
}

export function canEdit(user, resource) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (Array.isArray(user.editableResources)) return user.editableResources.includes(resource);
  return resource === "inbound";
}

function localId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function saveUserLocal(payload) {
  const id = String(payload.id || "").trim();
  const username = String(payload.username || "").trim();
  const name = String(payload.name || "").trim();
  const role = payload.role === "admin" ? "admin" : "clerk";
  const editableResources = role === "admin" ? ["inbound", "inventory", "outbound", "production", "machine", "finance"] : payload.editableResources || ["inbound"];
  const active = payload.active !== false && payload.active !== "false";

  if (!username) return { ok: false, message: "请填写账号。" };
  if (!name) return { ok: false, message: "请填写姓名。" };
  if (auth.users.some((item) => item.username === username && item.id !== id)) {
    return { ok: false, message: "账号已存在。" };
  }

  if (id) {
    const existing = auth.users.find((item) => item.id === id);
    if (!existing) return { ok: false, message: "用户不存在。" };
    if (existing.id === auth.activeUserId && !active) return { ok: false, message: "不能停用当前登录账号。" };
    if (existing.id === auth.activeUserId && existing.role === "admin" && role !== "admin") {
      return { ok: false, message: "不能把当前管理员账号改成录单人员。" };
    }
    Object.assign(existing, {
      username,
      name,
      role,
      active,
      editableResources,
      updatedAt: todayString(),
    });
    if (payload.password) existing.password = String(payload.password);
    saveState();
    return { ok: true, user: existing };
  }

  if (!payload.password) return { ok: false, message: "新建用户需要填写初始密码。" };
  const user = {
    id: localId("u"),
    username,
    password: String(payload.password),
    name,
    role,
    active,
    editableResources,
    createdAt: todayString(),
    updatedAt: todayString(),
  };
  auth.users.push(user);
  saveState();
  return { ok: true, user };
}

export function deleteUserLocal(id) {
  if (id === auth.activeUserId) return { ok: false, message: "不能删除当前登录账号。" };
  const index = auth.users.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "用户不存在。" };
  auth.users.splice(index, 1);
  saveState();
  return { ok: true };
}
