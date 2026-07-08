import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API_BASE = String(process.env.KH_ERP_API_BASE || "").replace(/\/$/, "");
const COLLECTOR_TOKEN = process.env.KH_ERP_COLLECTOR_TOKEN || "";
const NAS_ROOT = process.env.KH_ERP_NAS_ROOT || "/nas";
const STATE_PATH = process.env.KH_ERP_COLLECTOR_STATE || "/state/machine-data-collector-state.json";
const TESTER_DIR = process.env.KH_ERP_TESTER_DIR || "测试机";
const TESTER_DATA_DIR = process.env.KH_ERP_TESTER_DATA_DIR || "测试档";
const SORTER_DIR = process.env.KH_ERP_SORTER_DIR || "分选机";
const SORTER_DATA_DIR = process.env.KH_ERP_SORTER_DATA_DIR || "CN";
const DAY_SHIFT_START = process.env.KH_ERP_DAY_SHIFT_START || "08:00";
const NIGHT_SHIFT_START = process.env.KH_ERP_NIGHT_SHIFT_START || "20:00";
const INTERVAL_SECONDS = Number(process.env.KH_ERP_SCAN_INTERVAL_SECONDS || 300);
const COLLECTOR_ENABLED = String(process.env.KH_ERP_COLLECTOR_ENABLED || "true").toLowerCase() !== "false";
const ONCE = String(process.env.KH_ERP_ONCE || "").toLowerCase() === "true";
const DRY_RUN = String(process.env.KH_ERP_DRY_RUN || "").toLowerCase() === "true";
const FILE_INDEX_ENABLED = String(process.env.KH_ERP_FILE_INDEX_ENABLED || "true").toLowerCase() !== "false";
const RUN_IMPORT_ENABLED = String(process.env.KH_ERP_RUN_IMPORT_ENABLED || "true").toLowerCase() !== "false";
const FILE_INDEX_LIMIT = Number(process.env.KH_ERP_FILE_INDEX_LIMIT || 5000);
const MAX_FILES_PER_SCAN = Number(process.env.KH_ERP_MAX_FILES_PER_SCAN || 500);
const LOOKBACK_HOURS = Number(process.env.KH_ERP_LOOKBACK_HOURS || 168);
const UPLOAD_CHUNK_SIZE = Number(process.env.KH_ERP_UPLOAD_CHUNK_SIZE || 500);
const TESTER_SUMMARY_ENABLED = String(process.env.KH_ERP_TESTER_SUMMARY_ENABLED || "").toLowerCase() === "true";
const TESTER_SUMMARY_WINDOWS = process.env.KH_ERP_TESTER_SUMMARY_WINDOWS || "08:00-12:00@12:05,12:00-20:00@20:05,20:00-00:00@00:05,00:00-08:00@08:05";
const TESTER_SUMMARY_LOOKBACK_DAYS = Number(process.env.KH_ERP_TESTER_SUMMARY_LOOKBACK_DAYS || 2);
const TESTER_SUMMARY_ARCHIVE_MODE = String(process.env.KH_ERP_TESTER_SUMMARY_ARCHIVE_MODE || "move").toLowerCase() === "copy" ? "copy" : "move";
const TESTER_SUMMARY_OUTPUT_FORMAT = String(process.env.KH_ERP_TESTER_SUMMARY_OUTPUT_FORMAT || "xlsx").toLowerCase();
const TESTER_SUMMARY_GROUP_FIELDS = process.env.KH_ERP_TESTER_SUMMARY_GROUP_FIELDS || "Specification,Spec,料号,规格,型号";
const TESTER_SUMMARY_QUANTITY_FIELDS = process.env.KH_ERP_TESTER_SUMMARY_QUANTITY_FIELDS || "TotalTested,Total Tested,测试总数,总测试数";
const TESTER_SUMMARY_QUANTITY_LABEL = process.env.KH_ERP_TESTER_SUMMARY_QUANTITY_LABEL || "TotalTested";
const SORTER_SUMMARY_ENABLED = String(process.env.KH_ERP_SORTER_SUMMARY_ENABLED || "").toLowerCase() === "true";
const SORTER_SUMMARY_WINDOWS = process.env.KH_ERP_SORTER_SUMMARY_WINDOWS || TESTER_SUMMARY_WINDOWS;
const SORTER_SUMMARY_LOOKBACK_DAYS = Number(process.env.KH_ERP_SORTER_SUMMARY_LOOKBACK_DAYS || TESTER_SUMMARY_LOOKBACK_DAYS);
const SORTER_SUMMARY_ARCHIVE_MODE = String(process.env.KH_ERP_SORTER_SUMMARY_ARCHIVE_MODE || "move").toLowerCase() === "copy" ? "copy" : "move";
const SORTER_SUMMARY_OUTPUT_FORMAT = String(process.env.KH_ERP_SORTER_SUMMARY_OUTPUT_FORMAT || "xlsx").toLowerCase();
const SORTER_SUMMARY_GROUP_FIELDS = process.env.KH_ERP_SORTER_SUMMARY_GROUP_FIELDS || "Specification,Spec,料号,规格,型号,PartNo,Lot";
const SORTER_SUMMARY_QUANTITY_FIELDS = process.env.KH_ERP_SORTER_SUMMARY_QUANTITY_FIELDS || "TotalSorted,TotalTested,OutputQty,产出数量,分选总数,总数";
const SORTER_SUMMARY_QUANTITY_LABEL = process.env.KH_ERP_SORTER_SUMMARY_QUANTITY_LABEL || "TotalSorted";
const SUMMARY_MAX_MACHINES_PER_RUN = Number(process.env.KH_ERP_SUMMARY_MAX_MACHINES_PER_RUN || 0);
const SUMMARY_MAX_FILES_PER_MACHINE = Number(process.env.KH_ERP_SUMMARY_MAX_FILES_PER_MACHINE || 1000);
const HISTORY_SUMMARY_ENABLED = String(process.env.KH_ERP_HISTORY_SUMMARY_ENABLED || "").toLowerCase() === "true";
const HISTORY_SUMMARY_FROM = process.env.KH_ERP_HISTORY_SUMMARY_FROM || "";
const HISTORY_SUMMARY_TO = process.env.KH_ERP_HISTORY_SUMMARY_TO || "";
const HISTORY_SUMMARY_TYPES = (process.env.KH_ERP_HISTORY_SUMMARY_TYPES || "tester").split(",").map((item) => item.trim()).filter(Boolean);
const HISTORY_SUMMARY_MAX_WINDOWS_PER_RUN = Number(process.env.KH_ERP_HISTORY_SUMMARY_MAX_WINDOWS_PER_RUN || 2);
const HISTORY_SUMMARY_REPROCESS = String(process.env.KH_ERP_HISTORY_SUMMARY_REPROCESS || "").toLowerCase() === "true";
const TESTER_HEADER_READ_BYTES = Number(process.env.KH_ERP_TESTER_HEADER_READ_BYTES || 256 * 1024);

function timestampText(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateText(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateTimeText(date) {
  if (!date) return "";
  return `${dateText(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-:：/\\()（）]/g, "");
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
  if (Number.isFinite(serial) && serial > 30000 && serial < 80000) return new Date(Math.round((serial - 25569) * 86400 * 1000));
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})[_\-\s]?(\d{2})?(\d{2})?(\d{2})?/);
  if (compact) {
    return new Date(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]), Number(compact[4] || 0), Number(compact[5] || 0), Number(compact[6] || 0));
  }
  const parts = raw.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (parts) {
    return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4] || 0), Number(parts[5] || 0), Number(parts[6] || 0));
  }
  const monthFirst = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (monthFirst) {
    return new Date(Number(monthFirst[3]), Number(monthFirst[1]) - 1, Number(monthFirst[2]), Number(monthFirst[4] || 0), Number(monthFirst[5] || 0), Number(monthFirst[6] || 0));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minuteOfDay(value) {
  const [hour = 0, minute = 0] = String(value || "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function splitAliases(value = "") {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return new Date(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]));
  const dashed = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (dashed) return new Date(Number(dashed[1]), Number(dashed[2]) - 1, Number(dashed[3]));
  return null;
}

function previousDateText(date) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return dateText(previous);
}

function shiftInfo(date) {
  const finishedDate = date || new Date();
  const minute = finishedDate.getHours() * 60 + finishedDate.getMinutes();
  const dayStart = minuteOfDay(DAY_SHIFT_START);
  const nightStart = minuteOfDay(NIGHT_SHIFT_START);
  const isDay = dayStart < nightStart ? minute >= dayStart && minute < nightStart : minute >= dayStart || minute < nightStart;
  if (isDay) return { shift: "白班", shiftDate: dateText(finishedDate) };
  return { shift: "夜班", shiftDate: minute < dayStart ? previousDateText(finishedDate) : dateText(finishedDate) };
}

function pathSegmentsFromRoot(filePath) {
  const relative = path.relative(NAS_ROOT, filePath || "");
  if (!relative || relative.startsWith("..")) return [];
  return relative.split(path.sep).filter(Boolean);
}

function categoryInfoFromPath(filePath) {
  const segments = pathSegmentsFromRoot(filePath);
  const testerKey = normalizeKey(TESTER_DIR);
  const sorterKey = normalizeKey(SORTER_DIR);
  const categoryIndex = segments.findIndex((segment) => {
    const key = normalizeKey(segment);
    return key === testerKey || key === sorterKey;
  });
  if (categoryIndex < 0) return { machineType: "", machineFolder: "", categoryDir: "", dataDir: "" };
  const categoryDir = segments[categoryIndex];
  const machineType = normalizeKey(categoryDir) === testerKey ? "测试机" : "分选机";
  const dataDir = machineType === "测试机" ? TESTER_DATA_DIR : SORTER_DATA_DIR;
  const nextSegment = segments[categoryIndex + 1] || "";
  const hasDataDir = dataDir && normalizeKey(nextSegment) === normalizeKey(dataDir);
  return {
    machineType,
    machineFolder: segments[categoryIndex + (hasDataDir ? 2 : 1)] || "",
    categoryDir,
    dataDir: hasDataDir ? nextSegment : "",
  };
}

const MACHINE_RUN_ALIASES = {
  machineId: ["机台编号", "设备编号", "机台id", "machineid", "machine", "tester", "testernumber", "testermodel", "sorter", "handler"],
  machineName: ["机台名称", "设备名称", "machinename"],
  machineType: ["机台类型", "设备类型", "类型", "machinetype"],
  planNo: ["生产计划", "计划号", "工单号", "plan", "planno", "workorder", "工单"],
  orderNo: ["订单号", "订单编号", "orderno", "mo"],
  batchNo: ["批次", "批号", "lot", "lotno", "batch", "specification", "spec"],
  startedAt: ["开始时间", "开始", "start", "starttime"],
  finishedAt: ["结束时间", "完工时间", "完成时间", "测试时间", "结束", "finish", "finishtime", "end", "endtime", "testtime", "time", "时间"],
  inputQty: ["投入数量", "投入", "总数", "测试总数", "input", "inputqty", "total", "totalqty", "totaltested"],
  outputQty: ["产出数量", "完成数量", "产出", "output", "outputqty", "totaltested"],
  goodQty: ["良品数量", "良品", "合格数", "pass", "passqty", "good", "ok"],
  ngQty: ["不良数量", "不良", "失败数", "fail", "failqty", "ng"],
  yieldRate: ["良率", "yield", "yieldrate", "passrate"],
  operator: ["操作员", "人员", "operator", "op"],
  note: ["备注", "note", "memo"],
};

function findAliasIndex(headers = [], aliases = []) {
  const normalizedAliases = aliases.map(normalizeKey);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeKey(header)));
}

function valuesFromHeaderRow(headers, row) {
  return Object.fromEntries(
    Object.entries(MACHINE_RUN_ALIASES).map(([key, aliases]) => {
      const index = findAliasIndex(headers, aliases);
      return [key, index >= 0 ? row[index] : ""];
    }),
  );
}

function firstValueAfterKey(row = []) {
  return row.slice(1).find((item) => String(item || "").trim() !== "") || "";
}

function valuesFromKeyValue(rows) {
  const values = {};
  Object.entries(MACHINE_RUN_ALIASES).forEach(([key, aliases]) => {
    const normalized = aliases.map(normalizeKey);
    const found = rows.find((row) => normalized.includes(normalizeKey(row[0])));
    values[key] = found ? firstValueAfterKey(found) : "";
  });
  return values;
}

function runFromValues(values, context) {
  const category = categoryInfoFromPath(context.filePath);
  const machineId = values.machineId || category.machineFolder;
  const machineName = values.machineName || machineId;
  const machineType = values.machineType || category.machineType;
  const started = parseDateTimeValue(values.startedAt);
  const finished = parseDateTimeValue(values.finishedAt) || started || context.fileMtime;
  const inputQty = parseNumber(values.inputQty);
  const goodQty = parseNumber(values.goodQty);
  const ngQty = parseNumber(values.ngQty);
  const outputQty = parseNumber(values.outputQty) || goodQty + ngQty || inputQty;
  let yieldRate = parseNumber(values.yieldRate);
  if (yieldRate > 0 && yieldRate <= 1) yieldRate *= 100;
  if (!yieldRate && inputQty && goodQty) yieldRate = Number(((goodQty / inputQty) * 100).toFixed(2));
  const shift = shiftInfo(finished);
  return {
    id: `run-${context.fileHash.slice(0, 12)}-${context.rowIndex}`,
    machineId,
    machineName,
    machineType,
    planNo: values.planNo || "",
    orderNo: values.orderNo || "",
    batchNo: values.batchNo || "",
    startedAt: dateTimeText(started),
    finishedAt: dateTimeText(finished),
    shift: shift.shift,
    shiftDate: shift.shiftDate,
    inputQty,
    outputQty,
    goodQty,
    ngQty,
    yieldRate: Number((yieldRate || 0).toFixed(2)),
    operator: values.operator || "",
    sourceFile: context.relativePath,
    sourceFileName: path.basename(context.filePath),
    sourceFileHash: context.fileHash,
    sourceRowIndex: context.rowIndex,
    importedAt: timestampText(),
    note: values.note || "",
  };
}

function parseMachineDataText(text, context) {
  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const rows = parseDelimited(text, delimiter);
  if (!rows.length) return [];
  const isTesterKeyValueFile = rows.slice(0, 40).some((row) => normalizeKey(row[0]) === "totaltested")
    && rows.slice(0, 40).some((row) => normalizeKey(row[0]) === "specification");
  if (isTesterKeyValueFile) {
    return [runFromValues(valuesFromKeyValue(rows), { ...context, rowIndex: 1 })].filter(
      (run) => run.machineId || run.machineName || run.planNo || run.batchNo || run.inputQty || run.outputQty || run.goodQty,
    );
  }
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

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return { files: {}, summaries: {}, ...state };
  } catch {
    return { files: {}, summaries: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function collectFiles(rootDir, limit = FILE_INDEX_LIMIT) {
  const files = [];
  const visit = (current) => {
    if (files.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      console.warn(`[collector] skip unreadable directory: ${current} ${error.message}`);
      return;
    }
    entries.forEach((entry) => {
      if (files.length >= limit) return;
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (/^\d{12}$/.test(entry.name)) return;
        visit(nextPath);
        return;
      }
      if (entry.isFile() && !isGeneratedSummaryFile(entry.name)) files.push(nextPath);
    });
  };
  visit(rootDir);
  return files;
}

function isGeneratedSummaryFile(fileName = "") {
  const lower = String(fileName || "").toLowerCase();
  return lower.includes("totaltested-summary") || lower.includes("kh-erp-summary") || lower.includes("汇总");
}

function compactDateTimeText(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function csvCell(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function parseSummaryWindowSpecs(windowsText) {
  return String(windowsText || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [range, dueRaw = ""] = item.split("@").map((part) => part.trim());
      const [startRaw, endRaw] = range.split("-").map((part) => part.trim());
      if (!startRaw || !endRaw) return null;
      return {
        raw: item,
        startRaw,
        endRaw,
        dueRaw,
        startMinute: minuteOfDay(startRaw),
        endMinute: minuteOfDay(endRaw),
        dueMinute: dueRaw ? minuteOfDay(dueRaw) : null,
      };
    })
    .filter(Boolean);
}

function summaryWindowFromSpec(base, spec) {
  const beginAt = addMinutes(base, spec.startMinute);
  const endBase = new Date(base);
  if (spec.endMinute <= spec.startMinute) endBase.setDate(endBase.getDate() + 1);
  const endAt = addMinutes(endBase, spec.endMinute);
  let dueAt = spec.dueMinute == null ? addMinutes(endAt, 5) : addMinutes(base, spec.dueMinute);
  while (dueAt < endAt) dueAt = addMinutes(dueAt, 24 * 60);
  return {
    ...spec,
    beginAt,
    endAt,
    dueAt,
    label: compactDateTimeText(endAt),
  };
}

function realtimeSummaryWindows(profile, now = new Date()) {
  const specs = parseSummaryWindowSpecs(profile.windowsText);
  const start = startOfDay(now);
  start.setDate(start.getDate() - Math.max(0, profile.lookbackDays));
  const windows = [];
  for (let day = 0; day <= Math.max(0, profile.lookbackDays) + 1; day += 1) {
    const base = new Date(start);
    base.setDate(start.getDate() + day);
    specs.forEach((spec) => {
      const window = summaryWindowFromSpec(base, spec);
      if (now < window.dueAt || now < window.endAt) return;
      windows.push({ ...window, mode: "realtime", key: `${profile.key}:realtime:${window.label}:${window.raw}` });
    });
  }
  const byKey = new Map();
  windows.forEach((window) => byKey.set(window.key, window));
  return [...byKey.values()].sort((a, b) => b.endAt.getTime() - a.endAt.getTime());
}

function historySummaryWindows(profile, state, now = new Date()) {
  if (!HISTORY_SUMMARY_ENABLED) return [];
  if (!HISTORY_SUMMARY_TYPES.includes("all") && !HISTORY_SUMMARY_TYPES.includes(profile.key)) return [];
  const from = parseDateOnly(HISTORY_SUMMARY_FROM);
  const to = parseDateOnly(HISTORY_SUMMARY_TO) || from;
  if (!from || !to) return [];
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const specs = parseSummaryWindowSpecs(profile.windowsText);
  const windows = [];
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const base = startOfDay(day);
    specs.forEach((spec) => {
      const window = summaryWindowFromSpec(base, spec);
      if (window.endAt > now) return;
      const key = `${profile.key}:history:${window.label}:${window.raw}`;
      if (!HISTORY_SUMMARY_REPROCESS && state.summaryWindows?.[key]) return;
      windows.push({ ...window, mode: "history", key });
    });
  }
  return windows
    .sort((a, b) => a.endAt.getTime() - b.endAt.getTime())
    .slice(0, Math.max(1, HISTORY_SUMMARY_MAX_WINDOWS_PER_RUN));
}

function listDirectDataFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !isGeneratedSummaryFile(entry.name))
      .map((entry) => path.join(dir, entry.name))
      .filter((filePath) => [".csv", ".tsv", ".txt"].includes(path.extname(filePath).toLowerCase()));
  } catch {
    return [];
  }
}

function readTextPrefix(filePath, maxBytes = TESTER_HEADER_READ_BYTES) {
  const stat = fs.statSync(filePath);
  const length = Math.max(0, Math.min(Number(maxBytes) || 0, stat.size));
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString("utf8");
}

function keyValue(rows, aliases) {
  const normalizedAliases = aliases.map(normalizeKey);
  const found = rows.find((row) => normalizedAliases.includes(normalizeKey(row[0])));
  return found ? firstValueAfterKey(found) : "";
}

function summaryProfiles() {
  return [
    {
      key: "tester",
      label: "测试机",
      enabled: TESTER_SUMMARY_ENABLED,
      root: path.join(NAS_ROOT, TESTER_DIR, TESTER_DATA_DIR),
      windowsText: TESTER_SUMMARY_WINDOWS,
      lookbackDays: TESTER_SUMMARY_LOOKBACK_DAYS,
      archiveMode: TESTER_SUMMARY_ARCHIVE_MODE,
      outputFormat: TESTER_SUMMARY_OUTPUT_FORMAT,
      groupAliases: splitAliases(TESTER_SUMMARY_GROUP_FIELDS),
      quantityAliases: splitAliases(TESTER_SUMMARY_QUANTITY_FIELDS),
      quantityLabel: TESTER_SUMMARY_QUANTITY_LABEL,
    },
    {
      key: "sorter",
      label: "分选机",
      enabled: SORTER_SUMMARY_ENABLED,
      root: path.join(NAS_ROOT, SORTER_DIR, SORTER_DATA_DIR),
      windowsText: SORTER_SUMMARY_WINDOWS,
      lookbackDays: SORTER_SUMMARY_LOOKBACK_DAYS,
      archiveMode: SORTER_SUMMARY_ARCHIVE_MODE,
      outputFormat: SORTER_SUMMARY_OUTPUT_FORMAT,
      groupAliases: splitAliases(SORTER_SUMMARY_GROUP_FIELDS),
      quantityAliases: splitAliases(SORTER_SUMMARY_QUANTITY_FIELDS),
      quantityLabel: SORTER_SUMMARY_QUANTITY_LABEL,
    },
  ];
}

function parseSummarySource(filePath, profile) {
  const stat = fs.statSync(filePath);
  const text = readTextPrefix(filePath);
  const delimiter = path.extname(filePath).toLowerCase() === ".tsv" || (text.includes("\t") && !text.includes(",")) ? "\t" : ",";
  const rows = parseDelimited(text, delimiter);
  const testTime = parseDateTimeValue(keyValue(rows, ["TestTime", "测试时间", "完工时间", "完成时间"])) || stat.mtime;
  const groupValue = keyValue(rows, profile.groupAliases);
  const quantity = parseNumber(keyValue(rows, profile.quantityAliases));
  const testerNumber = keyValue(rows, ["TesterNumber", "TesterModel", "机台编号", "设备编号"]);
  if (!groupValue && !quantity) return null;
  return {
    filePath,
    fileName: path.basename(filePath),
    testTime,
    groupValue: groupValue || "未识别料号",
    quantity,
    testerNumber,
    size: stat.size,
    modifiedAt: stat.mtime,
  };
}

function uniqueTargetPath(targetDir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let targetPath = path.join(targetDir, fileName);
  let index = 2;
  while (fs.existsSync(targetPath)) {
    targetPath = path.join(targetDir, `${base}-${index}${ext}`);
    index += 1;
  }
  return targetPath;
}

function archiveSourceFile(sourcePath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (path.resolve(path.dirname(sourcePath)) === path.resolve(targetDir)) return sourcePath;
  const targetPath = uniqueTargetPath(targetDir, path.basename(sourcePath));
  if (currentArchiveMode === "copy") {
    fs.copyFileSync(sourcePath, targetPath);
    return targetPath;
  }
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
  return targetPath;
}

let currentArchiveMode = "move";

function aggregateSummaryRecords(records) {
  const byGroup = new Map();
  records.forEach((record) => {
    const key = record.groupValue || "未识别料号";
    const current = byGroup.get(key) || { groupValue: key, quantity: 0, fileCount: 0, files: [] };
    current.quantity += Number(record.quantity || 0);
    current.fileCount += 1;
    current.files.push(record.fileName);
    byGroup.set(key, current);
  });
  return [...byGroup.values()].sort((a, b) => a.groupValue.localeCompare(b.groupValue, "zh-CN"));
}

function writeSummaryCsv(filePath, groups, quantityLabel) {
  const rows = [
    ["", ...groups.map((item) => item.groupValue)],
    [quantityLabel, ...groups.map((item) => item.quantity)],
  ];
  fs.writeFileSync(filePath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
}

let xlsxModulePromise = null;

async function xlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx").then((mod) => mod.default || mod).catch(() => null);
  }
  return xlsxModulePromise;
}

async function writeSummaryReport(targetDir, machineName, window, groups, profile) {
  const baseName = `${machineName}-${window.label}-${profile.quantityLabel}-summary`;
  if (profile.outputFormat !== "csv") {
    const XLSX = await xlsxModule();
    if (XLSX) {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ["", ...groups.map((item) => item.groupValue)],
        [profile.quantityLabel, ...groups.map((item) => item.quantity)],
      ]);
      worksheet["!cols"] = [{ wch: 16 }, ...groups.map((item) => ({ wch: Math.max(18, item.groupValue.length + 2) }))];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const filePath = path.join(targetDir, `${baseName}.xlsx`);
      XLSX.writeFile(workbook, filePath);
      return filePath;
    }
  }
  const filePath = path.join(targetDir, `${baseName}.csv`);
  writeSummaryCsv(filePath, groups, profile.quantityLabel);
  return filePath;
}

function directMachineDirs(rootDir) {
  try {
    return fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !/^\d{12}$/.test(entry.name))
      .map((entry) => ({ name: entry.name, dir: path.join(rootDir, entry.name) }));
  } catch {
    return [];
  }
}

function inWindow(date, window) {
  const time = date?.getTime?.() || 0;
  return time >= window.beginAt.getTime() && time < window.endAt.getTime();
}

async function processSummaryWindow(profile, machine, window) {
  const targetDir = path.join(machine.dir, window.label);
  const activeFiles = listDirectDataFiles(machine.dir).slice(0, Math.max(1, SUMMARY_MAX_FILES_PER_MACHINE)).map((filePath) => ({ filePath, active: true }));
  const archivedFiles = listDirectDataFiles(targetDir).map((filePath) => ({ filePath, active: false }));
  const records = [];
  const errors = [];

  [...archivedFiles, ...activeFiles].forEach((item) => {
    try {
      const record = parseSummarySource(item.filePath, profile);
      if (record && inWindow(record.testTime, window)) records.push({ ...record, active: item.active });
    } catch (error) {
      errors.push({ filePath: item.filePath, message: error.message || "解析失败" });
    }
  });

  const activeRecords = records.filter((record) => record.active);
  const reportBase = `${machine.name}-${window.label}-${profile.quantityLabel}-summary`;
  const reportExists = fs.existsSync(path.join(targetDir, `${reportBase}.xlsx`))
    || fs.existsSync(path.join(targetDir, `${reportBase}.csv`));
  if (!records.length || (!activeRecords.length && reportExists)) {
    return { reports: 0, archived: 0, records: records.length, logs: errors.map((error) => summaryErrorLog(error, profile)) };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const groups = aggregateSummaryRecords(records);
  const archivedPaths = [];
  currentArchiveMode = profile.archiveMode;
  activeRecords.forEach((record) => {
    archivedPaths.push(archiveSourceFile(record.filePath, targetDir));
  });
  const reportPath = await writeSummaryReport(targetDir, machine.name, window, groups, profile);
  const total = groups.reduce((sum, item) => sum + item.quantity, 0);
  return {
    reports: 1,
    archived: archivedPaths.length,
    records: records.length,
    logs: [
      ...errors.map((error) => summaryErrorLog(error, profile)),
      {
        scannedAt: timestampText(),
        filePath: path.relative(NAS_ROOT, reportPath),
        fileName: path.basename(reportPath),
        status: "summary",
        message: `${profile.label} ${machine.name} ${dateTimeText(window.beginAt)} 至 ${dateTimeText(window.endAt)}：按 ${groups.length} 个分组汇总 ${records.length} 个文件，${profile.quantityLabel} ${total}，归档 ${archivedPaths.length} 个新文件。`,
        importedCount: records.length,
      },
    ],
  };
}

function summaryErrorLog(error, profile) {
  return {
    scannedAt: timestampText(),
    filePath: path.relative(NAS_ROOT, error.filePath),
    fileName: path.basename(error.filePath),
    status: "error",
    message: `${profile.label}班次统计解析失败：${error.message}`,
    importedCount: 0,
  };
}

function enabledSummaryProfiles() {
  return summaryProfiles().filter((profile) => profile.enabled || (HISTORY_SUMMARY_ENABLED && (HISTORY_SUMMARY_TYPES.includes("all") || HISTORY_SUMMARY_TYPES.includes(profile.key))));
}

async function processProfileShiftSummaries(profile, state) {
  const totals = { reports: 0, archived: 0, records: 0, logs: [] };
  if (!fs.existsSync(profile.root) || !fs.statSync(profile.root).isDirectory()) {
    totals.logs.push({
      scannedAt: timestampText(),
      filePath: path.relative(NAS_ROOT, profile.root),
      fileName: path.basename(profile.root),
      status: "error",
      message: `${profile.label}统计目录不存在：${profile.root}`,
      importedCount: 0,
    });
    return totals;
  }
  const realtimeWindows = profile.enabled ? realtimeSummaryWindows(profile) : [];
  const historyWindows = historySummaryWindows(profile, state);
  const windows = [...realtimeWindows, ...historyWindows];
  const machines = directMachineDirs(profile.root).slice(0, SUMMARY_MAX_MACHINES_PER_RUN > 0 ? SUMMARY_MAX_MACHINES_PER_RUN : undefined);
  state.summaryWindows = state.summaryWindows || {};
  for (const window of windows) {
    let windowReports = 0;
    let windowArchived = 0;
    let windowRecords = 0;
    for (const machine of machines) {
      const result = await processSummaryWindow(profile, machine, window);
      totals.reports += result.reports;
      totals.archived += result.archived;
      totals.records += result.records;
      windowReports += result.reports;
      windowArchived += result.archived;
      windowRecords += result.records;
      totals.logs.push(...result.logs);
    }
    if (window.mode === "history") {
      state.summaryWindows[window.key] = {
        processedAt: new Date().toISOString(),
        reports: windowReports,
        archived: windowArchived,
        records: windowRecords,
      };
    }
  }
  return totals;
}

async function processShiftSummaries(state) {
  const totals = { reports: 0, archived: 0, records: 0, logs: [] };
  for (const profile of enabledSummaryProfiles()) {
    const result = await processProfileShiftSummaries(profile, state);
    totals.reports += result.reports;
    totals.archived += result.archived;
    totals.records += result.records;
    totals.logs.push(...result.logs);
  }
  return totals;
}

function scanRoots() {
  return [
    path.join(NAS_ROOT, TESTER_DIR, TESTER_DATA_DIR),
    path.join(NAS_ROOT, SORTER_DIR, SORTER_DATA_DIR),
  ].filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
}

function fileInfo(filePath, status = "待扫描") {
  const stat = fs.statSync(filePath);
  const category = categoryInfoFromPath(filePath);
  const relativePath = path.relative(NAS_ROOT, filePath);
  return {
    path: relativePath,
    relativePath,
    fileName: path.basename(filePath),
    folderPath: path.dirname(relativePath),
    machineType: category.machineType,
    machineFolder: category.machineFolder,
    categoryDir: category.categoryDir,
    dataDir: category.dataDir,
    ext: path.extname(filePath).toLowerCase(),
    size: stat.size,
    modifiedAt: dateTimeText(stat.mtime),
    modifiedDate: dateText(stat.mtime),
    modifiedTime: stat.mtime.getTime(),
    status,
    canOpen: false,
  };
}

function shouldProcess(file, previous) {
  if (!previous) return true;
  return Number(previous.mtimeMs || 0) !== file.modifiedTime || Number(previous.size || 0) !== file.size;
}

async function discoverAndParse() {
  const state = loadState();
  state.files = state.files || {};
  state.summaries = state.summaries || {};
  state.summaryWindows = state.summaryWindows || {};
  const roots = scanRoots();
  if ((FILE_INDEX_ENABLED || RUN_IMPORT_ENABLED) && !roots.length) {
    throw new Error(`没有找到可扫描目录：${path.join(NAS_ROOT, TESTER_DIR, TESTER_DATA_DIR)} 或 ${path.join(NAS_ROOT, SORTER_DIR, SORTER_DATA_DIR)}`);
  }

  const supported = new Set([".csv", ".tsv", ".txt"]);
  const unsupported = new Set([".xlsx", ".xls"]);
  const minMtime = LOOKBACK_HOURS > 0 ? Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000 : 0;
  const discovered = FILE_INDEX_ENABLED || RUN_IMPORT_ENABLED
    ? roots
      .flatMap((root) => collectFiles(root))
      .map((filePath) => {
        const previous = state.files[path.relative(NAS_ROOT, filePath)];
        return fileInfo(filePath, previous?.status || "待扫描");
      })
      .sort((a, b) => b.modifiedTime - a.modifiedTime)
      .slice(0, FILE_INDEX_LIMIT)
    : [];

  const files = [];
  const runs = [];
  const logs = [];
  const nextState = { ...state, files: { ...(state.files || {}) } };
  let processed = 0;

  discovered.forEach((info) => {
    const absolutePath = path.join(NAS_ROOT, info.relativePath);
    const previous = state.files[info.relativePath];
    const isSupported = supported.has(info.ext);
    const isUnsupported = unsupported.has(info.ext);
    let status = previous?.status || (isUnsupported ? "暂不支持" : isSupported ? "待扫描" : "已跳过");

    if (RUN_IMPORT_ENABLED && isSupported && info.modifiedTime >= minMtime && processed < MAX_FILES_PER_SCAN && shouldProcess(info, previous)) {
      try {
        const buffer = fs.readFileSync(absolutePath);
        const fileHash = crypto.createHash("sha1").update(buffer).digest("hex");
        const parsedRuns = parseMachineDataText(buffer.toString("utf8"), {
          filePath: absolutePath,
          relativePath: info.relativePath,
          fileHash,
          fileMtime: new Date(info.modifiedTime),
        });
        status = parsedRuns.length ? "已导入" : "已跳过";
        runs.push(...parsedRuns);
        logs.push({
          scannedAt: timestampText(),
          filePath: info.relativePath,
          fileName: info.fileName,
          status: parsedRuns.length ? "imported" : "skipped",
          message: parsedRuns.length ? `导入 ${parsedRuns.length} 条机台运行记录。` : "未识别到可导入的统计行。",
          importedCount: parsedRuns.length,
        });
        nextState.files[info.relativePath] = { hash: fileHash, mtimeMs: info.modifiedTime, size: info.size, status };
        processed += 1;
      } catch (error) {
        status = "解析失败";
        logs.push({
          scannedAt: timestampText(),
          filePath: info.relativePath,
          fileName: info.fileName,
          status: "error",
          message: error.message || "解析失败。",
          importedCount: 0,
        });
      }
    }

    if (FILE_INDEX_ENABLED) files.push({ ...info, status });
  });

  const machineSummary = await processShiftSummaries(nextState);
  logs.push(...machineSummary.logs);

  nextState.lastScanAt = new Date().toISOString();
  return {
    files,
    runs,
    logs,
    nextState,
    summary: {
      discovered: discovered.length,
      processed,
      runs: runs.length,
      logs: logs.length,
      summaryReports: machineSummary.reports,
      summaryArchived: machineSummary.archived,
      summaryRecords: machineSummary.records,
    },
  };
}

async function postJson(pathname, payload) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${COLLECTOR_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
}

async function uploadScanResult(result) {
  const runChunks = result.runs.length ? [] : [[]];
  for (let index = 0; index < result.runs.length; index += UPLOAD_CHUNK_SIZE) {
    runChunks.push(result.runs.slice(index, index + UPLOAD_CHUNK_SIZE));
  }
  for (let index = 0; index < runChunks.length; index += 1) {
    await postJson("/api/machine-data/ingest", {
      collectorId: process.env.HOSTNAME || "nas-docker-collector",
      scannedAt: timestampText(),
      files: index === 0 ? result.files : [],
      logs: index === 0 ? result.logs : [],
      runs: runChunks[index],
      summary: result.summary,
    });
  }
}

async function scanAndUpload() {
  if (!DRY_RUN && (!API_BASE || !COLLECTOR_TOKEN)) {
    throw new Error("请配置 KH_ERP_API_BASE 和 KH_ERP_COLLECTOR_TOKEN。");
  }
  const result = await discoverAndParse();
  if (!DRY_RUN) await uploadScanResult(result);
  saveState(result.nextState);
  console.log(`[collector] ${timestampText()} files=${result.summary.discovered} processed=${result.summary.processed} runs=${result.summary.runs} summaryReports=${result.summary.summaryReports}${DRY_RUN ? " dryRun=true" : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!COLLECTOR_ENABLED) {
    console.log(`[collector] ${timestampText()} disabled by KH_ERP_COLLECTOR_ENABLED=false`);
    if (ONCE) return;
    while (true) await sleep(Math.max(30, INTERVAL_SECONDS) * 1000);
  }
  if (ONCE) {
    await scanAndUpload();
    return;
  }
  while (true) {
    try {
      await scanAndUpload();
    } catch (error) {
      console.error(`[collector] ${timestampText()} ${error.message}`);
    }
    await sleep(Math.max(30, INTERVAL_SECONDS) * 1000);
  }
}

main().catch((error) => {
  console.error(`[collector] ${error.stack || error.message}`);
  process.exit(1);
});
