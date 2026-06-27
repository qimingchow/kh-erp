import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBootstrap,
  canEdit,
  createSession,
  currentUserFromToken,
  deleteUser,
  makeId,
  readDb,
  removeSession,
  resetBusinessState,
  sanitizeUsers,
  saveUser,
  upsertRecord,
  verifyPassword,
  writeDb,
} from "./database.js";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SERVER_DIR, "..");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("请求内容过大。"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求 JSON 格式不正确。"));
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function requireUser(req, res, db) {
  const token = getToken(req);
  const user = currentUserFromToken(db, token);
  if (!user) {
    sendError(res, 401, "请先登录。");
    return null;
  }
  return { token, user };
}

function requireAdmin(req, res, db) {
  const context = requireUser(req, res, db);
  if (!context) return null;
  if (context.user.role !== "admin") {
    sendError(res, 403, "当前账号没有管理员权限。");
    return null;
  }
  return context;
}

function normalizeInventory(record) {
  const qty = parseNumber(record.qty);
  const safe = parseNumber(record.safe);
  const status = record.status === "冻结" ? "冻结" : qty <= safe ? "低库存" : "正常";
  return {
    ...record,
    id: record.id || makeId("stock"),
    qty,
    reserved: parseNumber(record.reserved),
    safe,
    cost: parseNumber(record.cost),
    status,
    lastUpdate: record.lastUpdate || new Date().toISOString().slice(0, 10),
  };
}

function normalizeInventoryStatus(record) {
  if ((record.status || "") === "冻结") return "冻结";
  return Number(record.qty || 0) <= Number(record.safe || 0) ? "低库存" : "正常";
}

function productParts(value = "") {
  const [item = "", ...rest] = String(value || "").split("/");
  return {
    item: item.trim() || String(value || "").trim() || "生产成品",
    spec: rest.join("/").trim(),
  };
}

function upsertInventoryRecord(list, record) {
  const index = list.findIndex((item) => item.id === record.id || (!record.id && record.code && item.code === record.code));
  const next = {
    ...record,
    id: record.id || list[index]?.id || makeId("stock"),
  };
  if (index >= 0) {
    list[index] = { ...list[index], ...next };
  } else {
    list.unshift(next);
  }
  return next;
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function timestampText() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function parseNumber(value) {
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

function normalizeInboundPayload(payload = {}) {
  const orderQty = parseNumber(payload.orderQty);
  const unitPrice = parseNumber(payload.unitPrice);
  const manualAmount = parseNumber(payload.amount);
  return {
    ...payload,
    orderQty,
    unit: payload.unit || "K",
    unitPrice: payload.unitPrice !== undefined && payload.unitPrice !== "" ? unitPrice : "",
    amount: payload.amount !== undefined && payload.amount !== "" ? manualAmount : unitPrice ? Number((orderQty * unitPrice).toFixed(2)) : "",
  };
}

function findInventoryForOutbound(state, record) {
  if (!record) return null;
  if (record.inventoryId) {
    const exact = state.inventory.find((item) => item.id === record.inventoryId);
    if (exact) return exact;
  }

  return (
    state.inventory.find(
      (item) => item.item === record.item && item.spec === record.spec && item.location === record.warehouse,
    ) ||
    state.inventory.find((item) => item.item === record.item && item.spec === record.spec) ||
    null
  );
}

function findFinanceForOutbound(state, record) {
  if (!record) return null;
  if (record.financeId) {
    const exact = state.finance.find((item) => item.id === record.financeId);
    if (exact) return exact;
  }

  return (
    state.finance.find((item) => item.outboundId === record.id) ||
    state.finance.find((item) => item.source === `出库单 ${record.orderNo || ""}`) ||
    null
  );
}

function normalizeSettlementAmounts(amount, settlement = "待收", paidValue = 0) {
  const total = Number(amount || 0);
  let nextSettlement = settlement || "待收";
  let paidAmount = parseNumber(paidValue);

  if (nextSettlement === "已收") {
    paidAmount = total;
  } else if (nextSettlement === "待收") {
    paidAmount = 0;
  } else if (nextSettlement === "部分收款") {
    paidAmount = Math.max(0, Math.min(total, paidAmount));
    if (paidAmount <= 0) nextSettlement = "待收";
    if (total > 0 && paidAmount >= total) nextSettlement = "已收";
  }

  const remainingAmount = Math.max(0, total - paidAmount);
  return {
    settlement: nextSettlement,
    paidAmount: Number(paidAmount.toFixed(2)),
    remainingAmount: Number(remainingAmount.toFixed(2)),
  };
}

function buildOutboundFinance(record, financeId) {
  return {
    id: financeId || makeId("fin"),
    outboundId: record.id,
    date: record.date,
    type: "应收",
    source: `出库单 ${record.orderNo}`,
    counterparty: record.customer,
    amount: record.amount,
    paidAmount: record.paidAmount,
    remainingAmount: record.remainingAmount,
    status: record.settlement,
    method: record.settlement === "已收" ? "转账" : "月结",
    note: `由出库自动生成；数量 ${record.qty}${record.unit || ""}，单价 ${record.unitPrice}`,
    updatedAt: timestampText(),
  };
}

function normalizeProductionProgressStatus(status = "待排产", progress = 0) {
  let nextStatus = status || "待排产";
  let nextProgress = Math.max(0, Math.min(100, Number(progress || 0)));

  if (nextStatus === "已完成" || nextProgress >= 100) {
    nextStatus = "已完成";
    nextProgress = 100;
  } else if (nextProgress <= 0) {
    nextStatus = "待排产";
    nextProgress = 0;
  } else if (nextStatus === "待排产") {
    nextStatus = "进行中";
  }

  return { status: nextStatus, progress: nextProgress };
}

function saveOutboundRecord(state, payload) {
  const id = String(payload.id || "").trim();
  const inventoryId = String(payload.inventoryId || "").trim();
  const stock = state.inventory.find((item) => item.id === inventoryId);
  if (!stock) return { ok: false, message: "请选择一个库存物料。" };

  const qty = parseNumber(payload.qty);
  const unitPrice = parseNumber(payload.unitPrice);
  const existing = id ? state.outbound.find((item) => item.id === id) : null;
  const previousStock = existing ? findInventoryForOutbound(state, existing) : null;
  if (existing && !previousStock) return { ok: false, message: "原出库关联库存不存在，无法自动回滚。" };

  const availableQty = Number(stock.qty || 0) + (previousStock?.id === stock.id ? Number(existing.qty || 0) : 0);
  if (!qty || qty > availableQty) return { ok: false, message: "出库数量不能大于可用库存。" };

  const record = {
    id: existing?.id || makeId("out"),
    inventoryId,
    financeId: existing?.financeId || "",
    date: payload.date || todayText(),
    customer: String(payload.customer || "").trim(),
    orderNo: String(payload.orderNo || "").trim(),
    item: stock.item,
    spec: stock.spec,
    qty,
    unit: stock.unit,
    unitPrice,
    amount: Number((qty * unitPrice).toFixed(2)),
    warehouse: stock.location,
    logistics: String(payload.logistics || "").trim(),
    settlement: payload.settlement || "待收",
    note: String(payload.note || "").trim(),
    updatedAt: timestampText(),
  };
  const settlementAmounts = normalizeSettlementAmounts(record.amount, record.settlement, payload.paidAmount);
  Object.assign(record, settlementAmounts);

  if (!record.customer) return { ok: false, message: "请填写客户。" };
  if (!record.orderNo) return { ok: false, message: "请填写销售单号。" };

  if (previousStock) {
    previousStock.qty += Number(existing.qty || 0);
    previousStock.lastUpdate = record.date;
    previousStock.status = normalizeInventoryStatus(previousStock);
  }

  stock.qty -= qty;
  stock.lastUpdate = record.date;
  stock.status = normalizeInventoryStatus(stock);

  const linkedFinance = existing ? findFinanceForOutbound(state, existing) : null;
  const financeRecord = buildOutboundFinance(record, linkedFinance?.id || record.financeId);
  record.financeId = financeRecord.id;

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.outbound.unshift(record);
  }

  if (linkedFinance) {
    Object.assign(linkedFinance, financeRecord);
  } else {
    state.finance.unshift(financeRecord);
  }

  state.ui = { ...(state.ui || {}), outboundViewingId: record.id, outboundEditingId: null };
  return { ok: true, record };
}

function deleteOutboundRecord(state, id) {
  const index = state.outbound.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "出库记录不存在。" };

  const record = state.outbound[index];
  const stock = findInventoryForOutbound(state, record);
  if (!stock) return { ok: false, message: "原出库关联库存不存在，无法自动回滚。" };

  stock.qty += Number(record.qty || 0);
  stock.lastUpdate = todayText();
  stock.status = normalizeInventoryStatus(stock);

  const finance = findFinanceForOutbound(state, record);
  if (finance) {
    state.finance = state.finance.filter((item) => item.id !== finance.id);
  }

  state.outbound.splice(index, 1);
  if (state.ui?.outboundViewingId === id) state.ui.outboundViewingId = null;
  if (state.ui?.outboundEditingId === id) state.ui.outboundEditingId = null;
  return { ok: true };
}

function assignMachineToPlan(state, plan) {
  if (!plan.machineId) return;
  const machine = state.machines.find((item) => item.id === plan.machineId);
  if (!machine) return;

  machine.job = `${plan.item} / ${plan.planNo}`;
  machine.status = plan.status === "已完成" ? "待机" : "运行";
  machine.progress = Number(plan.progress || 0);
  machine.updatedAt = timestampText();
}

function saveProductionRecord(state, payload) {
  const id = String(payload.id || "").trim();
  const existing = id ? state.production.find((item) => item.id === id) : null;
  const progressStatus = normalizeProductionProgressStatus(payload.status, payload.progress);
  const record = {
    id: existing?.id || makeId("plan"),
    planNo: String(payload.planNo || "").trim(),
    orderNo: String(payload.orderNo || "").trim(),
    item: String(payload.item || "").trim(),
    qty: parseNumber(payload.qty),
    unit: payload.unit || "K",
    unitPrice: payload.unitPrice !== undefined && payload.unitPrice !== "" ? parseNumber(payload.unitPrice) : "",
    amount:
      payload.amount !== undefined && payload.amount !== ""
        ? parseNumber(payload.amount)
        : payload.unitPrice
          ? Number((parseNumber(payload.qty) * parseNumber(payload.unitPrice)).toFixed(2))
          : "",
    startDate: payload.startDate || payload.orderDate || payload.dueDate || todayText(),
    dueDate: payload.dueDate || todayText(),
    machineGroup: String(payload.machineGroup || payload.group || "").trim(),
    machineId: String(payload.machineId || "").trim(),
    priority: payload.priority || "标准",
    status: progressStatus.status,
    progress: progressStatus.progress,
    note: String(payload.note || "").trim(),
    inventoryId: existing?.inventoryId || String(payload.inventoryId || "").trim(),
    stockedQty: Number(existing?.stockedQty || payload.stockedQty || 0),
    stockedAt: existing?.stockedAt || payload.stockedAt || "",
    updatedAt: timestampText(),
  };

  if (!record.planNo) return { ok: false, message: "请填写计划编号。" };
  if (!record.item) return { ok: false, message: "请填写生产物料。" };
  if (!record.qty) return { ok: false, message: "请填写计划数量。" };

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.production.unshift(record);
  }
  assignMachineToPlan(state, record);
  state.ui = { ...(state.ui || {}), productionViewingId: record.id, productionEditingId: null };
  return { ok: true, record };
}

function productionToInventoryRecord(state, planId) {
  const plan = state.production.find((item) => item.id === planId);
  if (!plan) return { ok: false, message: "生产计划不存在。" };
  if (plan.inventoryId) return { ok: false, message: "该生产计划已经转入库存，不能重复入库。" };
  if (plan.status !== "已完成" || Number(plan.progress || 0) < 100) {
    return { ok: false, message: "请先将生产计划状态改为已完成，且进度为 100%。" };
  }

  const { item, spec } = productParts(plan.item);
  const existing = state.inventory.find(
    (stock) => stock.item === item && stock.spec === spec && String(stock.note || "").includes(plan.planNo),
  );
  const stockedAt = todayText();
  const qty = Number(plan.qty || 0);
  const stock = existing || {
    id: makeId("stock"),
    code: `FG-${String(state.inventory.length + 1).padStart(3, "0")}`,
    item,
    spec,
    location: "成品仓-待定",
    qty: 0,
    reserved: 0,
    safe: 0,
    unit: plan.unit || "K",
    status: "正常",
    cost: Number(plan.unitPrice || 0),
    note: `由生产计划 ${plan.planNo} 入库，订单 ${plan.orderNo || "-"}`,
    lastUpdate: stockedAt,
  };

  stock.qty = Number(stock.qty || 0) + qty;
  stock.lastUpdate = stockedAt;
  stock.status = normalizeInventoryStatus(stock);
  if (!existing) state.inventory.unshift(stock);

  Object.assign(plan, {
    inventoryId: stock.id,
    stockedQty: qty,
    stockedAt,
    updatedAt: timestampText(),
  });
  state.ui = { ...(state.ui || {}), inventoryViewingId: stock.id, productionViewingId: plan.id };

  return { ok: true, record: stock };
}

function deleteProductionRecord(state, id) {
  const index = state.production.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "生产计划不存在。" };

  const plan = state.production[index];
  const machine = state.machines.find((item) => item.id === plan.machineId);
  if (machine && String(machine.job || "").includes(plan.planNo)) {
    Object.assign(machine, {
      job: "等待排产",
      status: "待机",
      progress: 0,
      updatedAt: timestampText(),
    });
  }

  state.production.splice(index, 1);
  if (state.ui?.productionViewingId === id) state.ui.productionViewingId = null;
  if (state.ui?.productionEditingId === id) state.ui.productionEditingId = null;
  return { ok: true };
}

function updateMachineRecord(state, machineId, patch) {
  const machine = state.machines.find((item) => item.id === machineId);
  if (!machine) return { ok: false, message: "机台不存在。" };

  Object.assign(machine, {
    ...patch,
    progress: patch.progress === undefined ? machine.progress : Math.max(0, Math.min(100, Number(patch.progress || 0))),
    updatedAt: timestampText(),
  });

  const plan = state.production.find((item) => item.machineId === machine.id && item.status !== "已完成");
  if (plan) {
    plan.progress = machine.progress;
    plan.status = machine.progress >= 100 ? "已完成" : machine.status === "运行" ? "进行中" : plan.status;
    plan.updatedAt = timestampText();
  }

  return { ok: true, record: machine };
}

function deleteMachineRecord(state, machineId) {
  const index = state.machines.findIndex((item) => item.id === machineId);
  if (index < 0) return { ok: false, message: "机台不存在。" };

  state.machines.splice(index, 1);
  state.production.forEach((plan) => {
    if (plan.machineId !== machineId) return;
    plan.machineId = "";
    plan.note = plan.note
      ? `${plan.note}；原绑定机台已删除，请重新分配。`
      : "原绑定机台已删除，请重新分配生产组和机台。";
    plan.updatedAt = timestampText();
  });
  return { ok: true };
}

function normalizeMachineImportRecord(record, index = 0) {
  const type = record.type === "测试机" ? "测试机" : "分选机";
  const fallbackPrefix = type === "测试机" ? "T" : "S";
  const fallbackNo = String(index + 1).padStart(3, "0");
  return {
    id: String(record.id || `${type === "测试机" ? "test" : "sorter"}-${fallbackNo}`).trim(),
    type,
    name: String(record.name || `${type} ${fallbackPrefix}-${fallbackNo}`).trim(),
    area: String(record.area || (type === "测试机" ? "测试区" : "分选区")).trim(),
    group: String(record.group || record.productionGroup || (type === "测试机" ? "测试组" : "分选组")).trim(),
    status: ["运行", "待机", "维护", "故障", "异常"].includes(record.status) ? record.status : "待机",
    job: String(record.job || "等待排产").trim(),
    operator: String(record.operator || "").trim(),
    shift: String(record.shift || "").trim(),
    progress: Math.max(0, Math.min(100, Number(record.progress || 0))),
    updatedAt: String(record.updatedAt || timestampText()).trim(),
  };
}

function importMachineRecords(state, records) {
  if (!Array.isArray(records) || !records.length) {
    return { ok: false, message: "没有可导入的机台记录。" };
  }

  records.forEach((item, index) => {
    const record = normalizeMachineImportRecord(item, index);
    const existingIndex = state.machines.findIndex((machine) => machine.id === record.id);
    if (existingIndex >= 0) {
      state.machines[existingIndex] = { ...state.machines[existingIndex], ...record };
    } else {
      state.machines.push(record);
    }
  });

  return { ok: true, count: records.length };
}

function saveFinanceRecord(state, payload) {
  const id = String(payload.id || "").trim();
  const existing = id ? state.finance.find((item) => item.id === id) : null;
  const amount = parseNumber(payload.amount);
  const paidInfo = normalizeSettlementAmounts(
    amount,
    payload.status === "已付" ? "已收" : payload.status === "待付" ? "待收" : payload.status,
    payload.paidAmount,
  );
  const paidAmount = payload.type === "付款" || payload.status === "已付" ? amount : payload.type === "应付" && payload.status === "待付" ? 0 : paidInfo.paidAmount;
  const remainingAmount = Math.max(0, amount - paidAmount);
  const normalizedStatus = payload.type === "应收" ? paidInfo.settlement : payload.status || "待收";
  const record = {
    id: existing?.id || makeId("fin"),
    outboundId: existing?.outboundId || payload.outboundId || "",
    date: payload.date || todayText(),
    type: payload.type || "应收",
    source: String(payload.source || "").trim(),
    counterparty: String(payload.counterparty || "").trim(),
    amount,
    paidAmount: Number(paidAmount.toFixed(2)),
    remainingAmount: Number(remainingAmount.toFixed(2)),
    status: normalizedStatus,
    method: payload.method || "月结",
    note: String(payload.note || "").trim(),
    updatedAt: timestampText(),
  };

  if (!record.source) return { ok: false, message: "请填写来源单据。" };
  if (!record.counterparty) return { ok: false, message: "请填写往来单位。" };

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.finance.unshift(record);
  }

  if (record.outboundId) {
    const outbound = state.outbound.find((item) => item.id === record.outboundId);
    if (outbound) {
      const settlementStatus =
        record.status === "已收" ? "已收" : record.status === "部分收款" ? "部分收款" : "待收";
      const settlementAmounts = normalizeSettlementAmounts(outbound.amount, settlementStatus, record.paidAmount);
      outbound.settlement = settlementAmounts.settlement;
      outbound.paidAmount = settlementAmounts.paidAmount;
      outbound.remainingAmount = settlementAmounts.remainingAmount;
    }
  }

  state.ui = { ...(state.ui || {}), financeViewingId: record.id, financeEditingId: null };
  return { ok: true, record };
}

function deleteFinanceRecord(state, id) {
  const index = state.finance.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "财务记录不存在。" };
  const finance = state.finance[index];
  if (finance.outboundId) {
    const outbound = state.outbound.find((item) => item.id === finance.outboundId);
    if (outbound) {
      outbound.financeId = "";
      outbound.settlement = "待收";
      outbound.paidAmount = 0;
      outbound.remainingAmount = Number(outbound.amount || 0);
    }
  }
  state.finance.splice(index, 1);
  if (state.ui?.financeViewingId === id) state.ui.financeViewingId = null;
  if (state.ui?.financeEditingId === id) state.ui.financeEditingId = null;
  return { ok: true };
}

async function handleApi(req, res, pathname) {
  const db = readDb();
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, name: "kh-erp", serverMode: true });
    return;
  }

  if (method === "GET" && pathname === "/api/bootstrap") {
    const token = getToken(req);
    const user = currentUserFromToken(db, token);
    sendJson(res, 200, buildBootstrap(db, user, user ? token : ""));
    return;
  }

  if (method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const user = db.users.find((item) => item.username === username);
    if (!user || user.active === false || !verifyPassword(user, body.password)) {
      sendError(res, 401, "账号或密码错误。");
      return;
    }
    const token = createSession(db, user.id);
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, user, token));
    return;
  }

  if (method === "POST" && pathname === "/api/logout") {
    const token = getToken(req);
    if (token) {
      removeSession(db, token);
      writeDb(db);
    }
    sendJson(res, 200, buildBootstrap(db));
    return;
  }

  if (method === "POST" && pathname === "/api/reset") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    resetBusinessState(db);
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "GET" && pathname === "/api/users") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    sendJson(res, 200, { ok: true, users: sanitizeUsers(db.users) });
    return;
  }

  if (method === "POST" && pathname === "/api/users") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = saveUser(db, await readBody(req), context.user);
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === "PUT") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = saveUser(db, { ...(await readBody(req)), id: decodeURIComponent(userMatch[1]) }, context.user);
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (userMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = deleteUser(db, decodeURIComponent(userMatch[1]), context.user);
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "POST" && pathname === "/api/inbound") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "inbound")) {
      sendError(res, 403, "当前账号没有来料维护权限。");
      return;
    }
    const body = await readBody(req);
    const record = upsertRecord(db.state.inbound, normalizeInboundPayload(body.record || body), "in");
    db.state.ui = { ...(db.state.ui || {}), inboundViewingId: record.id, inboundEditingId: null };
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const inboundMatch = pathname.match(/^\/api\/inbound\/([^/]+)$/);
  if (inboundMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const id = decodeURIComponent(inboundMatch[1]);
    db.state.inbound = db.state.inbound.filter((item) => item.id !== id);
    if (db.state.ui?.inboundViewingId === id) db.state.ui.inboundViewingId = null;
    if (db.state.ui?.inboundEditingId === id) db.state.ui.inboundEditingId = null;
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "POST" && pathname === "/api/inventory") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "inventory")) {
      sendError(res, 403, "当前账号没有库存维护权限。");
      return;
    }
    const body = await readBody(req);
    const record = upsertInventoryRecord(db.state.inventory, normalizeInventory(body.record || body));
    db.state.ui = { ...(db.state.ui || {}), inventoryViewingId: record.id, inventoryEditingId: null };
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const inventoryMatch = pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (inventoryMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const id = decodeURIComponent(inventoryMatch[1]);
    const stock = db.state.inventory.find((item) => item.id === id);
    if (!stock) {
      sendError(res, 404, "库存记录不存在。");
      return;
    }
    const outboundUsingStock = db.state.outbound.some(
      (item) => item.inventoryId === stock.id || (item.item === stock.item && item.spec === stock.spec),
    );
    if (outboundUsingStock) {
      sendError(res, 400, "该库存已有出库记录引用，建议先冻结，不建议删除。");
      return;
    }
    db.state.inventory = db.state.inventory.filter((item) => item.id !== id);
    if (db.state.ui?.inventoryViewingId === id) db.state.ui.inventoryViewingId = null;
    if (db.state.ui?.inventoryEditingId === id) db.state.ui.inventoryEditingId = null;
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "POST" && pathname === "/api/outbound") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "outbound")) {
      sendError(res, 403, "当前账号没有出库维护权限。");
      return;
    }
    const result = saveOutboundRecord(db.state, (await readBody(req)).record || {});
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const outboundMatch = pathname.match(/^\/api\/outbound\/([^/]+)$/);
  if (outboundMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = deleteOutboundRecord(db.state, decodeURIComponent(outboundMatch[1]));
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "POST" && pathname === "/api/production") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "production")) {
      sendError(res, 403, "当前账号没有生产计划维护权限。");
      return;
    }
    const result = saveProductionRecord(db.state, (await readBody(req)).record || {});
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const productionStockInMatch = pathname.match(/^\/api\/production\/([^/]+)\/stock-in$/);
  if (productionStockInMatch && method === "POST") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "production") || !canEdit(context.user, "inventory")) {
      sendError(res, 403, "当前账号需要生产计划和库存维护权限。");
      return;
    }
    const result = productionToInventoryRecord(db.state, decodeURIComponent(productionStockInMatch[1]));
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const productionMatch = pathname.match(/^\/api\/production\/([^/]+)$/);
  if (productionMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = deleteProductionRecord(db.state, decodeURIComponent(productionMatch[1]));
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const machineMatch = pathname.match(/^\/api\/machines?\/([^/]+)$/);
  if (machineMatch && method === "PATCH") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "machine")) {
      sendError(res, 403, "当前账号没有机台维护权限。");
      return;
    }
    const result = updateMachineRecord(db.state, decodeURIComponent(machineMatch[1]), (await readBody(req)).patch || {});
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (machineMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = deleteMachineRecord(db.state, decodeURIComponent(machineMatch[1]));
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "POST" && pathname === "/api/machines/import") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "machine")) {
      sendError(res, 403, "当前账号没有机台维护权限。");
      return;
    }
    const result = importMachineRecords(db.state, (await readBody(req)).machines || []);
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "POST" && pathname === "/api/finance") {
    const context = requireUser(req, res, db);
    if (!context) return;
    if (!canEdit(context.user, "finance")) {
      sendError(res, 403, "当前账号没有财务维护权限。");
      return;
    }
    const result = saveFinanceRecord(db.state, (await readBody(req)).record || {});
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  const financeMatch = pathname.match(/^\/api\/finance\/([^/]+)$/);
  if (financeMatch && method === "DELETE") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const result = deleteFinanceRecord(db.state, decodeURIComponent(financeMatch[1]));
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  sendError(res, 404, "接口不存在。");
}

function serveStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requestPath);
  const filePath = path.normalize(path.join(ROOT_DIR, decoded));
  const relative = path.relative(ROOT_DIR, filePath);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    (!relative.startsWith("src/") && !["index.html", "styles.css"].includes(relative))
  ) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendError(res, 500, error?.message || "服务器错误。");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`坤禾半导体 ERP 服务已启动：http://${HOST}:${PORT}`);
});
