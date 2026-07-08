import crypto from "node:crypto";
import { execFile } from "node:child_process";
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
const MAX_BODY_BYTES = Number(process.env.KH_ERP_MAX_BODY_BYTES || 20_000_000);
const COLLECTOR_TOKEN = process.env.KH_ERP_COLLECTOR_TOKEN || "";

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
      if (raw.length > MAX_BODY_BYTES) {
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

function safeTokenEqual(expected = "", actual = "") {
  const expectedBuffer = Buffer.from(String(expected));
  const actualBuffer = Buffer.from(String(actual));
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function requireCollector(req, res) {
  if (!COLLECTOR_TOKEN) {
    sendError(res, 503, "服务端未配置 KH_ERP_COLLECTOR_TOKEN，暂不能接收 NAS 采集器数据。");
    return false;
  }
  const token = getToken(req) || String(req.headers["x-collector-token"] || "").trim();
  if (!token || !safeTokenEqual(COLLECTOR_TOKEN, token)) {
    sendError(res, 401, "采集器密钥无效。");
    return false;
  }
  return true;
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

function normalizeMachineDataConfig(config = {}) {
  return {
    nasPath: String(config.nasPath || "").trim(),
    testerDir: String(config.testerDir || "测试机").trim() || "测试机",
    sorterDir: String(config.sorterDir || "分选机").trim() || "分选机",
    testerDataDir: String(config.testerDataDir || "测试档").trim(),
    sorterDataDir: String(config.sorterDataDir || "CN").trim(),
    dayShiftStart: config.dayShiftStart || "08:00",
    nightShiftStart: config.nightShiftStart || "20:00",
    lastScanAt: config.lastScanAt || "",
  };
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-:：/\\()（）]/g, "");
}

function findAliasIndex(headers = [], aliases = []) {
  const normalizedAliases = aliases.map(normalizeKey);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeKey(header)));
}

function parseDelimited(text = "", delimiter = ",") {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  const normalizedText = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const next = normalizedText[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((item) => item !== "")) rows.push(row);
  return rows;
}

function parseDateTimeValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 30000 && serial < 80000) {
    return new Date(Math.round((serial - 25569) * 86400 * 1000));
  }
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})[_\-\s]?(\d{2})?(\d{2})?(\d{2})?/);
  if (compact) {
    return new Date(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]), Number(compact[4] || 0), Number(compact[5] || 0), Number(compact[6] || 0));
  }
  const parts = raw.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (parts) {
    return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4] || 0), Number(parts[5] || 0), Number(parts[6] || 0));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateText(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateTimeText(date) {
  if (!date) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${dateText(date)} ${hour}:${minute}`;
}

function previousDateText(date) {
  const previous = new Date(date.getTime());
  previous.setDate(previous.getDate() - 1);
  return dateText(previous);
}

function minutesOfDay(value = "08:00") {
  const match = String(value || "").match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function shiftInfo(finishedDate, config) {
  if (!finishedDate) return { shift: "未识别", shiftDate: "" };
  const dayStart = minutesOfDay(config.dayShiftStart || "08:00");
  const nightStart = minutesOfDay(config.nightShiftStart || "20:00");
  const minute = finishedDate.getHours() * 60 + finishedDate.getMinutes();
  const isDay = dayStart < nightStart ? minute >= dayStart && minute < nightStart : minute >= dayStart || minute < nightStart;
  if (isDay) return { shift: "白班", shiftDate: dateText(finishedDate) };
  return { shift: "夜班", shiftDate: minute < dayStart ? previousDateText(finishedDate) : dateText(finishedDate) };
}

function pathSegmentsFromRoot(filePath, rootDir) {
  const relative = path.relative(rootDir || "", filePath || "");
  if (!relative || relative.startsWith("..")) return [];
  return relative.split(path.sep).filter(Boolean);
}

function categoryInfoFromPath(filePath, config = {}) {
  const segments = pathSegmentsFromRoot(filePath, config.nasPath);
  const testerKey = normalizeKey(config.testerDir || "测试机");
  const sorterKey = normalizeKey(config.sorterDir || "分选机");
  const testerDataKey = normalizeKey(config.testerDataDir || "测试档");
  const sorterDataKey = normalizeKey(config.sorterDataDir || "CN");
  const categoryIndex = segments.findIndex((segment) => {
    const key = normalizeKey(segment);
    return key === testerKey || key === sorterKey;
  });
  if (categoryIndex < 0) return { machineType: "", machineFolder: "", categoryDir: "" };
  const categoryDir = segments[categoryIndex];
  const categoryKey = normalizeKey(categoryDir);
  const machineType = categoryKey === testerKey ? "测试机" : "分选机";
  const dataDirKey = machineType === "测试机" ? testerDataKey : sorterDataKey;
  const nextSegment = segments[categoryIndex + 1] || "";
  const hasDataDir = Boolean(dataDirKey && normalizeKey(nextSegment) === dataDirKey);
  return {
    machineType,
    machineFolder: segments[categoryIndex + (hasDataDir ? 2 : 1)] || "",
    categoryDir,
    dataDir: hasDataDir ? nextSegment : "",
  };
}

function findMachineByFolder(state, folderName = "") {
  const folderKey = normalizeKey(folderName);
  if (!folderKey) return null;
  return (state.machines || []).find((item) => {
    const id = normalizeKey(item.id || "");
    const name = normalizeKey(item.name || "");
    return id === folderKey || name === folderKey || (id && folderKey.includes(id)) || (name && folderKey.includes(name));
  }) || null;
}

function inferMachine(filePath, state, config = {}) {
  const category = categoryInfoFromPath(filePath, config);
  const folderMachine = findMachineByFolder(state, category.machineFolder);
  if (folderMachine) return { machineId: folderMachine.id, machineName: folderMachine.name, machineType: folderMachine.type || category.machineType };
  if (category.machineFolder) {
    return {
      machineId: category.machineFolder,
      machineName: category.machineFolder,
      machineType: category.machineType,
    };
  }
  const haystack = String(filePath || "").toLowerCase();
  const machine = (state.machines || []).find((item) => {
    const id = String(item.id || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();
    return (id && haystack.includes(id)) || (name && haystack.includes(name));
  });
  if (machine) return { machineId: machine.id, machineName: machine.name, machineType: machine.type };
  const basename = path.basename(filePath);
  const codeMatch = basename.match(/(?:^|[_\-\s])(T|S)[_\-\s]?(\d{1,4})(?:[_\-\s.]|$)/i);
  const machineType = /测试|tester|test/i.test(filePath) || codeMatch?.[1]?.toUpperCase() === "T" ? "测试机" : /分选|sorter|sort/i.test(filePath) || codeMatch?.[1]?.toUpperCase() === "S" ? "分选机" : "";
  const machineId = codeMatch ? `${codeMatch[1].toUpperCase()}-${String(codeMatch[2]).padStart(3, "0")}` : "";
  return { machineId, machineName: machineId, machineType };
}

function findLinkedPlan(state, payload) {
  const tokens = [payload.planNo, payload.orderNo, payload.batchNo, payload.sourceFileName].map((item) => String(item || "").trim()).filter(Boolean);
  return (state.production || []).find((plan) =>
    tokens.some((token) => [plan.id, plan.planNo, plan.orderNo, plan.item].some((value) => value && String(value).includes(token))),
  );
}

function runFromValues(values, context) {
  const machine = inferMachine(context.filePath, context.state, context.config);
  const machineId = values.machineId || machine.machineId;
  const machineName = values.machineName || machine.machineName || machineId;
  const machineType = values.machineType || machine.machineType;
  const started = parseDateTimeValue(values.startedAt);
  const finished = parseDateTimeValue(values.finishedAt) || started || context.fileMtime;
  const inputQty = parseNumber(values.inputQty);
  const goodQty = parseNumber(values.goodQty);
  const ngQty = parseNumber(values.ngQty);
  const outputQty = parseNumber(values.outputQty) || goodQty + ngQty || inputQty;
  let yieldRate = parseNumber(values.yieldRate);
  if (yieldRate > 0 && yieldRate <= 1) yieldRate *= 100;
  if (!yieldRate && (inputQty || outputQty) && goodQty) yieldRate = Number(((goodQty / (inputQty || outputQty)) * 100).toFixed(2));
  const plan = findLinkedPlan(context.state, values);
  const shift = shiftInfo(finished, context.config);
  return {
    id: `run-${context.fileHash.slice(0, 12)}-${context.rowIndex}`,
    machineId,
    machineName,
    machineType,
    planId: plan?.id || "",
    planNo: values.planNo || plan?.planNo || "",
    orderNo: values.orderNo || plan?.orderNo || "",
    batchNo: values.batchNo || "",
    startedAt: dateTimeText(started),
    finishedAt: dateTimeText(finished),
    shift: shift.shift,
    shiftDate: shift.shiftDate,
    inputQty,
    outputQty,
    goodQty,
    ngQty,
    yieldRate: Number(yieldRate.toFixed(2)),
    operator: values.operator || "",
    sourceFile: context.filePath,
    sourceFileName: path.basename(context.filePath),
    sourceFileHash: context.fileHash,
    sourceRowIndex: context.rowIndex,
    importedAt: timestampText(),
    note: values.note || "",
  };
}

const MACHINE_RUN_ALIASES = {
  machineId: ["机台编号", "设备编号", "机台id", "machineid", "machine", "tester", "sorter", "handler"],
  machineName: ["机台名称", "设备名称", "machinename"],
  machineType: ["机台类型", "设备类型", "类型", "machinetype"],
  planNo: ["生产计划", "计划号", "工单号", "plan", "planno", "workorder", "工单"],
  orderNo: ["订单号", "订单编号", "orderno", "mo"],
  batchNo: ["批次", "批号", "lot", "lotno", "batch"],
  startedAt: ["开始时间", "开始", "start", "starttime"],
  finishedAt: ["结束时间", "完工时间", "完成时间", "结束", "finish", "finishtime", "end", "endtime", "time", "时间"],
  inputQty: ["投入数量", "投入", "总数", "input", "inputqty", "total", "totalqty"],
  outputQty: ["产出数量", "完成数量", "产出", "output", "outputqty"],
  goodQty: ["良品数量", "良品", "合格数", "pass", "passqty", "good", "ok"],
  ngQty: ["不良数量", "不良", "失败数", "fail", "failqty", "ng"],
  yieldRate: ["良率", "yield", "yieldrate", "passrate"],
  operator: ["操作员", "人员", "operator", "op"],
  note: ["备注", "note", "memo"],
};

function valuesFromHeaderRow(headers, row) {
  return Object.fromEntries(
    Object.entries(MACHINE_RUN_ALIASES).map(([key, aliases]) => {
      const index = findAliasIndex(headers, aliases);
      return [key, index >= 0 ? row[index] : ""];
    }),
  );
}

function valuesFromKeyValue(rows) {
  const values = {};
  Object.entries(MACHINE_RUN_ALIASES).forEach(([key, aliases]) => {
    const normalized = aliases.map(normalizeKey);
    const found = rows.find((row) => normalized.includes(normalizeKey(row[0])));
    values[key] = found?.[1] || "";
  });
  return values;
}

function parseMachineDataText(text, context) {
  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const rows = parseDelimited(text, delimiter);
  if (!rows.length) return [];
  const headerIndex = rows.slice(0, 20).findIndex((row) => {
    const hitCount = Object.values(MACHINE_RUN_ALIASES).filter((aliases) => findAliasIndex(row, aliases) >= 0).length;
    return hitCount >= 2;
  });
  if (headerIndex >= 0) {
    const headers = rows[headerIndex];
    return rows.slice(headerIndex + 1)
      .map((row, index) => runFromValues(valuesFromHeaderRow(headers, row), { ...context, rowIndex: index + 1 }))
      .filter((run) => run.machineId || run.machineName || run.planNo || run.batchNo || run.inputQty || run.outputQty || run.goodQty);
  }
  return [runFromValues(valuesFromKeyValue(rows), { ...context, rowIndex: 1 })].filter(
    (run) => run.machineId || run.machineName || run.planNo || run.batchNo || run.inputQty || run.outputQty || run.goodQty,
  );
}

function collectMachineDataFiles(rootDir, limit = 5000) {
  const files = [];
  const visit = (current) => {
    if (files.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.forEach((entry) => {
      if (files.length >= limit) return;
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(nextPath);
        return;
      }
      if (entry.isFile()) files.push(nextPath);
    });
  };
  visit(rootDir);
  return files;
}

function findMachineDataCategoryRoots(rootDir, config) {
  const categoryKeys = new Map([
    [normalizeKey(config.testerDir || "测试机"), "测试机"],
    [normalizeKey(config.sorterDir || "分选机"), "分选机"],
  ]);
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && categoryKeys.has(normalizeKey(entry.name)))
    .map((entry) => {
      const type = categoryKeys.get(normalizeKey(entry.name));
      const categoryPath = path.join(rootDir, entry.name);
      const dataDir = type === "测试机" ? config.testerDataDir : config.sorterDataDir;
      const scanPath = dataDir ? path.join(categoryPath, dataDir) : categoryPath;
      return {
        type,
        name: entry.name,
        path: categoryPath,
        scanPath,
        dataDir,
      };
    })
    .filter((entry) => fs.existsSync(entry.scanPath) && fs.statSync(entry.scanPath).isDirectory());
}

function machineDataFileInfo(filePath, state, config, importedFiles = new Set()) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const category = categoryInfoFromPath(filePath, config);
  const supported = [".csv", ".tsv", ".txt"].includes(ext);
  const unsupported = [".xlsx", ".xls"].includes(ext);
  const imported = importedFiles.has(filePath);
  return {
    path: filePath,
    relativePath: path.relative(config.nasPath, filePath),
    fileName: path.basename(filePath),
    folderPath: path.dirname(filePath),
    machineType: category.machineType || "",
    machineFolder: category.machineFolder || "",
    categoryDir: category.categoryDir || "",
    dataDir: category.dataDir || "",
    ext: ext || "",
    size: stat.size,
    modifiedAt: dateTimeText(stat.mtime),
    modifiedDate: dateText(stat.mtime),
    modifiedTime: stat.mtime.getTime(),
    status: imported ? "已导入" : unsupported ? "暂不支持" : supported ? "待扫描" : "已跳过",
  };
}

function normalizeMachineFileFilters(filters = {}) {
  return {
    machineType: String(filters.machineType || "").trim(),
    machineKeyword: String(filters.machineKeyword || filters.keyword || "").trim().toLowerCase(),
    ext: String(filters.ext || "").trim().toLowerCase(),
    status: String(filters.status || "").trim(),
    modifiedFrom: String(filters.modifiedFrom || "").trim(),
    modifiedTo: String(filters.modifiedTo || "").trim(),
  };
}

function normalizeMachineDataFileRecord(file = {}) {
  const modifiedTime = Number(file.modifiedTime || 0);
  const modifiedDate = file.modifiedDate || (modifiedTime ? dateText(new Date(modifiedTime)) : "");
  const modifiedAt = file.modifiedAt || (modifiedTime ? dateTimeText(new Date(modifiedTime)) : "");
  const relativePath = String(file.relativePath || file.path || "").trim();
  const fileName = String(file.fileName || path.basename(relativePath || "")).trim();
  return {
    path: String(file.path || relativePath).trim(),
    relativePath,
    fileName,
    folderPath: String(file.folderPath || path.dirname(relativePath || "")).trim(),
    machineType: String(file.machineType || "").trim(),
    machineFolder: String(file.machineFolder || "").trim(),
    categoryDir: String(file.categoryDir || "").trim(),
    dataDir: String(file.dataDir || "").trim(),
    ext: String(file.ext || path.extname(fileName).toLowerCase()).trim().toLowerCase(),
    size: Number(file.size || 0),
    modifiedAt,
    modifiedDate,
    modifiedTime,
    status: String(file.status || "待扫描").trim(),
    canOpen: file.canOpen === true,
  };
}

function dateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}${String(value).includes("T") ? "" : endOfDay ? "T23:59:59" : "T00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filterMachineDataFiles(files = [], filters = {}) {
  const next = normalizeMachineFileFilters(filters);
  const from = dateBoundary(next.modifiedFrom, false);
  const to = dateBoundary(next.modifiedTo, true);
  return files.filter((file) => {
    if (next.machineType && file.machineType !== next.machineType) return false;
    if (next.ext && file.ext !== next.ext) return false;
    if (next.status && file.status !== next.status) return false;
    if (from && file.modifiedTime < from.getTime()) return false;
    if (to && file.modifiedTime > to.getTime()) return false;
    if (next.machineKeyword) {
      const haystack = [file.fileName, file.relativePath, file.machineFolder, file.machineType, file.ext].join(" ").toLowerCase();
      if (!haystack.includes(next.machineKeyword)) return false;
    }
    return true;
  });
}

function listMachineDataFiles(state, filters = {}) {
  const config = normalizeMachineDataConfig(state.machineDataConfig || {});
  const indexedFiles = Array.isArray(state.machineDataFiles) ? state.machineDataFiles.map(normalizeMachineDataFileRecord) : [];
  if (!config.nasPath) {
    return { ok: true, files: filterMachineDataFiles(indexedFiles, filters), totalFiles: indexedFiles.length, source: "collector" };
  }
  if (!fs.existsSync(config.nasPath)) {
    if (indexedFiles.length) return { ok: true, files: filterMachineDataFiles(indexedFiles, filters), totalFiles: indexedFiles.length, source: "collector" };
    return { ok: false, message: `NAS 路径不存在：${config.nasPath}` };
  }
  if (!fs.statSync(config.nasPath).isDirectory()) return { ok: false, message: "NAS 路径不是文件夹。" };
  const categoryRoots = findMachineDataCategoryRoots(config.nasPath, config);
  if (!categoryRoots.length) {
    return {
      ok: false,
      message: `NAS 路径下没有找到可扫描的数据目录：${config.testerDir}/${config.testerDataDir} 或 ${config.sorterDir}/${config.sorterDataDir}。`,
    };
  }
  const importedFiles = new Set((state.machineRuns || []).map((run) => run.sourceFile).filter(Boolean));
  const files = categoryRoots
    .flatMap((root) => collectMachineDataFiles(root.scanPath))
    .map((filePath) => machineDataFileInfo(filePath, state, config, importedFiles))
    .sort((a, b) => b.modifiedTime - a.modifiedTime);
  return { ok: true, files: filterMachineDataFiles(files, filters), totalFiles: files.length };
}

function mergeMachineDataFileIndex(state, files = []) {
  state.machineDataFiles = Array.isArray(state.machineDataFiles) ? state.machineDataFiles.map(normalizeMachineDataFileRecord) : [];
  const byKey = new Map(state.machineDataFiles.map((file) => [file.relativePath || file.path, file]));
  files.map(normalizeMachineDataFileRecord).forEach((file) => {
    const key = file.relativePath || file.path;
    if (!key) return;
    byKey.set(key, { ...(byKey.get(key) || {}), ...file });
  });
  state.machineDataFiles = [...byKey.values()].sort((a, b) => Number(b.modifiedTime || 0) - Number(a.modifiedTime || 0)).slice(0, 20000);
  return files.length;
}

function normalizeUploadedMachineRun(state, item = {}, index = 0) {
  const inputQty = parseNumber(item.inputQty);
  const goodQty = parseNumber(item.goodQty);
  const ngQty = parseNumber(item.ngQty);
  const outputQty = parseNumber(item.outputQty) || goodQty + ngQty || inputQty;
  let yieldRate = parseNumber(item.yieldRate);
  if (yieldRate > 0 && yieldRate <= 1) yieldRate *= 100;
  if (!yieldRate && inputQty && goodQty) yieldRate = Number(((goodQty / inputQty) * 100).toFixed(2));
  const plan = findLinkedPlan(state, item);
  const sourceFile = String(item.sourceFile || item.relativePath || "").trim();
  const sourceFileHash = String(item.sourceFileHash || "").trim();
  const sourceRowIndex = Number(item.sourceRowIndex || index + 1);
  return {
    id: item.id || (sourceFileHash ? `run-${sourceFileHash.slice(0, 12)}-${sourceRowIndex}` : makeId("run")),
    machineId: String(item.machineId || item.machineFolder || "").trim(),
    machineName: String(item.machineName || item.machineId || item.machineFolder || "").trim(),
    machineType: String(item.machineType || "").trim(),
    planId: item.planId || plan?.id || "",
    planNo: item.planNo || plan?.planNo || "",
    orderNo: item.orderNo || plan?.orderNo || "",
    batchNo: String(item.batchNo || "").trim(),
    startedAt: String(item.startedAt || "").trim(),
    finishedAt: String(item.finishedAt || item.startedAt || "").trim(),
    shift: String(item.shift || "未识别").trim(),
    shiftDate: String(item.shiftDate || "").trim(),
    inputQty,
    outputQty,
    goodQty,
    ngQty,
    yieldRate: Number((yieldRate || 0).toFixed(2)),
    operator: String(item.operator || "").trim(),
    sourceFile,
    sourceFileName: String(item.sourceFileName || path.basename(sourceFile)).trim(),
    sourceFileHash,
    sourceRowIndex,
    importedAt: item.importedAt || timestampText(),
    note: String(item.note || "").trim(),
  };
}

function ingestMachineDataPayload(state, payload = {}) {
  state.machineRuns = Array.isArray(state.machineRuns) ? state.machineRuns : [];
  state.machineDataLogs = Array.isArray(state.machineDataLogs) ? state.machineDataLogs : [];
  const indexedFiles = mergeMachineDataFileIndex(state, payload.files || []);
  const existingKeys = new Set((state.machineRuns || []).map((run) => `${run.sourceFileHash}:${run.sourceRowIndex}`));
  const incomingRuns = Array.isArray(payload.runs) ? payload.runs : [];
  const nextRuns = incomingRuns
    .map((run, index) => normalizeUploadedMachineRun(state, run, index))
    .filter((run) => run.sourceFileHash || run.sourceFile || run.machineId || run.inputQty || run.outputQty)
    .filter((run) => {
      const key = `${run.sourceFileHash}:${run.sourceRowIndex}`;
      if (run.sourceFileHash && existingKeys.has(key)) return false;
      if (run.sourceFileHash) existingKeys.add(key);
      return true;
    });
  if (nextRuns.length) state.machineRuns.unshift(...nextRuns);
  state.machineRuns = state.machineRuns.slice(0, 20000);

  (payload.logs || []).slice(0, 200).forEach((log) => appendMachineDataLog(state, log));
  state.machineDataConfig = normalizeMachineDataConfig(state.machineDataConfig || {});
  state.machineDataConfig.lastScanAt = payload.scannedAt || timestampText();
  return {
    ok: true,
    summary: {
      indexedFiles,
      receivedRuns: incomingRuns.length,
      importedRuns: nextRuns.length,
      receivedLogs: Array.isArray(payload.logs) ? payload.logs.length : 0,
    },
  };
}

function appendMachineDataLog(state, log) {
  state.machineDataLogs = [
    {
      id: makeId("mlog"),
      scannedAt: timestampText(),
      ...log,
    },
    ...(state.machineDataLogs || []),
  ].slice(0, 300);
}

function scanMachineDataFiles(state, filters = {}) {
  state.machineDataConfig = normalizeMachineDataConfig(state.machineDataConfig || {});
  state.machineRuns = Array.isArray(state.machineRuns) ? state.machineRuns : [];
  state.machineDataLogs = Array.isArray(state.machineDataLogs) ? state.machineDataLogs : [];
  const config = state.machineDataConfig;
  if (!config.nasPath) return { ok: false, message: "请先配置 NAS 挂载路径。" };
  if (!fs.existsSync(config.nasPath)) return { ok: false, message: `NAS 路径不存在：${config.nasPath}` };
  if (!fs.statSync(config.nasPath).isDirectory()) return { ok: false, message: "NAS 路径不是文件夹。" };

  const supported = new Set([".csv", ".tsv", ".txt"]);
  const unsupported = new Set([".xlsx", ".xls"]);
  const existingKeys = new Set((state.machineRuns || []).map((run) => `${run.sourceFileHash}:${run.sourceRowIndex}`));
  const listed = listMachineDataFiles(state, filters);
  if (listed.ok === false) return listed;
  const files = listed.files.map((file) => file.path);
  let importedRuns = 0;
  let importedFiles = 0;
  let skippedFiles = 0;
  let errorFiles = 0;

  files.forEach((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    if (unsupported.has(ext)) {
      skippedFiles += 1;
      appendMachineDataLog(state, { filePath, fileName, status: "unsupported", message: "第一版暂不解析 Excel 文件，请先另存为 CSV/TSV。", importedCount: 0 });
      return;
    }
    if (!supported.has(ext)) return;
    try {
      const buffer = fs.readFileSync(filePath);
      const fileHash = crypto.createHash("sha1").update(buffer).digest("hex");
      const stat = fs.statSync(filePath);
      const runs = parseMachineDataText(buffer.toString("utf8"), {
        state,
        config,
        filePath,
        fileHash,
        fileMtime: stat.mtime,
      });
      const nextRuns = runs.filter((run) => !existingKeys.has(`${run.sourceFileHash}:${run.sourceRowIndex}`));
      nextRuns.forEach((run) => existingKeys.add(`${run.sourceFileHash}:${run.sourceRowIndex}`));
      if (nextRuns.length) {
        state.machineRuns.unshift(...nextRuns);
        importedRuns += nextRuns.length;
        importedFiles += 1;
        appendMachineDataLog(state, { filePath, fileName, status: "imported", message: `导入 ${nextRuns.length} 条机台运行记录。`, importedCount: nextRuns.length });
      } else {
        skippedFiles += 1;
      }
    } catch (error) {
      errorFiles += 1;
      appendMachineDataLog(state, { filePath, fileName, status: "error", message: error.message || "解析失败。", importedCount: 0 });
    }
  });

  state.machineRuns = state.machineRuns.slice(0, 20000);
  config.lastScanAt = timestampText();
  return { ok: true, summary: { scannedFiles: files.length, importedFiles, importedRuns, skippedFiles, errorFiles } };
}

function safeNasPath(config, targetPath = "") {
  const root = path.resolve(config.nasPath || "");
  if (!root) return "";
  const target = targetPath ? path.resolve(targetPath) : root;
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return target;
}

function openSystemFolder(folderPath) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  return new Promise((resolve, reject) => {
    execFile(command, [folderPath], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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

function productionMachineIds(plan = {}) {
  const ids = Array.isArray(plan.machineIds) ? plan.machineIds : plan.machineId ? [plan.machineId] : [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function planMachineJob(plan) {
  return `${plan.item || "生产任务"} / ${plan.planNo || plan.orderNo || ""}`.trim();
}

function releasePlanMachine(machine, plan) {
  if (!machine) return;
  if (machine.assignedPlanId && machine.assignedPlanId !== plan.id) return;
  if (!machine.assignedPlanId && !String(machine.job || "").includes(plan.planNo || "")) return;
  Object.assign(machine, {
    assignedPlanId: "",
    job: "等待排产",
    status: "待机",
    progress: 0,
    updatedAt: timestampText(),
  });
}

function assignMachineToPlan(state, plan, previousMachineIds = []) {
  const nextIds = productionMachineIds(plan);
  const previousIds = [...new Set(previousMachineIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const nextIdSet = new Set(nextIds);

  previousIds.forEach((machineId) => {
    if (nextIdSet.has(machineId)) return;
    releasePlanMachine(state.machines.find((item) => item.id === machineId), plan);
  });

  plan.machineIds = nextIds;
  plan.machineId = nextIds[0] || "";

  if (plan.status === "已完成") {
    nextIds.forEach((machineId) => releasePlanMachine(state.machines.find((item) => item.id === machineId), plan));
    return;
  }

  nextIds.forEach((machineId) => {
    const machine = state.machines.find((item) => item.id === machineId);
    if (!machine) return;
    Object.assign(machine, {
      assignedPlanId: plan.id,
      job: planMachineJob(plan),
      status: plan.status === "进行中" || Number(plan.progress || 0) > 0 ? "运行" : "待机",
      progress: Number(plan.progress || 0),
      updatedAt: timestampText(),
    });
  });
}

function saveProductionRecord(state, payload) {
  const id = String(payload.id || "").trim();
  const existing = id ? state.production.find((item) => item.id === id) : null;
  const previousMachineIds = existing ? productionMachineIds(existing) : [];
  const progressStatus = normalizeProductionProgressStatus(payload.status, payload.progress);
  const machineIds = Array.isArray(payload.machineIds)
    ? payload.machineIds.map((machineId) => String(machineId || "").trim()).filter(Boolean)
    : payload.machineId
      ? [String(payload.machineId).trim()]
      : [];
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
    machineId: machineIds[0] || "",
    machineIds,
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
  assignMachineToPlan(state, existing || record, previousMachineIds);
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
  productionMachineIds(plan).forEach((machineId) => releasePlanMachine(state.machines.find((item) => item.id === machineId), plan));

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

  const plan = state.production.find(
    (item) => item.status !== "已完成" && (item.id === machine.assignedPlanId || productionMachineIds(item).includes(machine.id)),
  );
  if (plan) {
    const planMachines = productionMachineIds(plan).map((id) => state.machines.find((item) => item.id === id)).filter(Boolean);
    const averageProgress = planMachines.length
      ? Math.round(planMachines.reduce((total, item) => total + Number(item.progress || 0), 0) / planMachines.length)
      : Number(machine.progress || 0);
    plan.progress = Math.max(0, Math.min(100, averageProgress));
    if (planMachines.length && planMachines.every((item) => Number(item.progress || 0) >= 100)) {
      plan.status = "已完成";
    } else if (planMachines.some((item) => item.status === "运行" || Number(item.progress || 0) > 0)) {
      plan.status = "进行中";
    }
    plan.updatedAt = timestampText();
  }

  return { ok: true, record: machine };
}

function deleteMachineRecord(state, machineId) {
  const index = state.machines.findIndex((item) => item.id === machineId);
  if (index < 0) return { ok: false, message: "机台不存在。" };

  state.machines.splice(index, 1);
  state.production.forEach((plan) => {
    const existingIds = productionMachineIds(plan);
    const nextMachineIds = existingIds.filter((id) => id !== machineId);
    if (nextMachineIds.length === existingIds.length) return;
    plan.machineIds = nextMachineIds;
    plan.machineId = nextMachineIds[0] || "";
    plan.note = plan.note
      ? `${plan.note}；原绑定机台已删除，请重新分配。`
      : "原绑定机台已删除，请重新分配生产组资源。";
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
    group: String(record.group || record.productionGroup || (type === "测试机" ? "测试设备" : "分选设备")).trim(),
    assignedPlanId: String(record.assignedPlanId || "").trim(),
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
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

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

  if (method === "POST" && pathname === "/api/machine-data/config") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const body = await readBody(req);
    db.state.machineDataConfig = {
      ...normalizeMachineDataConfig(db.state.machineDataConfig || {}),
      ...normalizeMachineDataConfig(body.config || body),
    };
    writeDb(db);
    sendJson(res, 200, buildBootstrap(db, context.user, context.token));
    return;
  }

  if (method === "GET" && pathname === "/api/machine-data/files") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const filters = Object.fromEntries(requestUrl.searchParams.entries());
    const result = listMachineDataFiles(db.state, filters);
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    sendJson(res, 200, { ok: true, files: result.files, totalFiles: result.totalFiles });
    return;
  }

  if (method === "POST" && pathname === "/api/machine-data/open-folder") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const body = await readBody(req);
    const config = normalizeMachineDataConfig(db.state.machineDataConfig || {});
    const target = safeNasPath(config, body.path || config.nasPath);
    if (!target) {
      sendError(res, 400, "只能打开 NAS 挂载路径下的文件夹。");
      return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      sendError(res, 400, `文件夹不存在：${target}`);
      return;
    }
    try {
      await openSystemFolder(target);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendError(res, 500, `当前运行环境无法打开文件夹：${error.message || "open failed"}`);
    }
    return;
  }

  if (method === "POST" && pathname === "/api/machine-data/scan") {
    const context = requireAdmin(req, res, db);
    if (!context) return;
    const body = await readBody(req);
    const result = scanMachineDataFiles(db.state, body.filters || {});
    if (result.ok === false) {
      sendError(res, 400, result.message);
      return;
    }
    writeDb(db);
    sendJson(res, 200, { ...buildBootstrap(db, context.user, context.token), summary: result.summary });
    return;
  }

  if (method === "POST" && pathname === "/api/machine-data/ingest") {
    if (!requireCollector(req, res)) return;
    const result = ingestMachineDataPayload(db.state, await readBody(req));
    writeDb(db);
    sendJson(res, 200, { ok: true, summary: result.summary });
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
