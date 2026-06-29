import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SEED_STATE, USER_SEED } from "../src/data/seed.js";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SERVER_DIR, "..");
const DATA_DIR = process.env.KH_ERP_DATA_DIR || path.join(ROOT_DIR, "data");
const DB_PATH = process.env.KH_ERP_DB_PATH || path.join(DATA_DIR, "kh-erp-db.json");

export const EDITABLE_RESOURCES = ["inbound", "inventory", "outbound", "production", "machine", "finance"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowText() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function defaultEditableResources(role) {
  if (role === "admin") return [...EDITABLE_RESOURCES];
  if (role === "clerk") return ["inbound"];
  return [];
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash: hash };
}

export function verifyPassword(user, password) {
  if (!user) return false;
  if (user.passwordHash && user.passwordSalt) {
    const { passwordHash } = hashPassword(password, user.passwordSalt);
    return crypto.timingSafeEqual(Buffer.from(passwordHash, "hex"), Buffer.from(user.passwordHash, "hex"));
  }
  return String(user.password || "") === String(password || "");
}

function normalizeUser(user, index = 0) {
  const role = user.role === "admin" ? "admin" : "clerk";
  const passwordParts =
    user.passwordHash && user.passwordSalt ? { passwordHash: user.passwordHash, passwordSalt: user.passwordSalt } : hashPassword(user.password || "123456");

  return {
    id: user.id || makeId("u"),
    username: String(user.username || `user${index + 1}`).trim(),
    name: String(user.name || user.username || `用户${index + 1}`).trim(),
    role,
    active: user.active !== false,
    editableResources: Array.isArray(user.editableResources) ? user.editableResources : defaultEditableResources(role),
    createdAt: user.createdAt || todayText(),
    updatedAt: user.updatedAt || todayText(),
    ...passwordParts,
  };
}

function normalizeDb(raw = {}) {
  const users = Array.isArray(raw.users) && raw.users.length ? raw.users : USER_SEED.users;
  const state = normalizeState({ ...clone(SEED_STATE), ...(raw.state || {}) });
  return {
    version: 1,
    state,
    users: users.map(normalizeUser),
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
  };
}

function productionMachineIds(plan = {}) {
  const ids = Array.isArray(plan.machineIds) ? plan.machineIds : plan.machineId ? [plan.machineId] : [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function normalizeState(state) {
  state.production = Array.isArray(state.production) ? state.production : [];
  state.machines = Array.isArray(state.machines) ? state.machines : [];
  state.production.forEach((plan) => {
    plan.machineIds = productionMachineIds(plan);
    plan.machineId = plan.machineIds[0] || "";
  });
  reconcileMachineAssignments(state);
  return state;
}

function reconcileMachineAssignments(state) {
  const activeMachineIds = new Set();
  state.production.forEach((plan) => {
    if (plan.status === "已完成") return;
    productionMachineIds(plan).forEach((machineId) => {
      const machine = state.machines.find((item) => item.id === machineId);
      if (!machine) return;
      activeMachineIds.add(machine.id);
      machine.assignedPlanId = plan.id;
      machine.job = `${plan.item || "生产任务"} / ${plan.planNo || plan.orderNo || ""}`.trim();
      machine.status = plan.status === "进行中" || Number(plan.progress || 0) > 0 ? "运行" : "待机";
      machine.progress = Number(plan.progress || 0);
      machine.updatedAt = machine.updatedAt || plan.updatedAt || todayText();
    });
  });

  state.machines.forEach((machine) => {
    if (!machine.assignedPlanId || activeMachineIds.has(machine.id)) return;
    const plan = state.production.find((item) => item.id === machine.assignedPlanId);
    if (!plan || plan.status === "已完成") {
      machine.assignedPlanId = "";
      machine.job = "等待排产";
      machine.status = "待机";
      machine.progress = 0;
    }
  });
}

function initialDb() {
  return normalizeDb({
    state: clone(SEED_STATE),
    users: USER_SEED.users,
    sessions: [],
  });
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) writeDb(initialDb());
}

export function readDb() {
  ensureDataFile();
  try {
    const db = normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
    writeDb(db);
    return db;
  } catch {
    const db = initialDb();
    writeDb(db);
    return db;
  }
}

export function writeDb(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, `${JSON.stringify(normalizeDb(db), null, 2)}\n`);
}

export function resetBusinessState(db) {
  db.state = clone(SEED_STATE);
  db.state.ui = clone(SEED_STATE.ui);
  return db;
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    editableResources: Array.isArray(user.editableResources) ? user.editableResources : defaultEditableResources(user.role),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function sanitizeUsers(users) {
  return users.map(sanitizeUser);
}

export function publicState() {
  return {
    ...clone(SEED_STATE),
    inbound: [],
    inventory: [],
    outbound: [],
    production: [],
    machines: [],
    finance: [],
  };
}

export function currentUserFromToken(db, token) {
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId && item.active !== false);
  return user || null;
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions = (db.sessions || []).filter((item) => item.userId !== userId);
  db.sessions.push({ token, userId, createdAt: nowText() });
  return token;
}

export function removeSession(db, token) {
  db.sessions = (db.sessions || []).filter((item) => item.token !== token);
}

export function canEdit(user, resource) {
  if (!user || user.active === false) return false;
  if (user.role === "admin") return true;
  return Array.isArray(user.editableResources) && user.editableResources.includes(resource);
}

export function buildBootstrap(db, user = null, token = "") {
  const safeUser = sanitizeUser(user);
  const authUsers = user?.role === "admin" ? sanitizeUsers(db.users) : safeUser ? [safeUser] : [];
  return {
    ok: true,
    serverMode: true,
    token: token || "",
    currentUser: safeUser,
    auth: {
      activeUserId: safeUser?.id || null,
      users: authUsers,
    },
    state: safeUser ? db.state : publicState(),
  };
}

export function saveUser(db, payload, currentUser) {
  const id = String(payload.id || "").trim();
  const username = String(payload.username || "").trim();
  const name = String(payload.name || "").trim();
  const role = payload.role === "admin" ? "admin" : "clerk";
  const password = String(payload.password || "");
  const active = payload.active !== false && payload.active !== "false";
  const editableResources = Array.isArray(payload.editableResources)
    ? payload.editableResources.filter((item) => EDITABLE_RESOURCES.includes(item))
    : defaultEditableResources(role);

  if (!username) return { ok: false, message: "请填写账号。" };
  if (!name) return { ok: false, message: "请填写姓名。" };

  const duplicated = db.users.find((item) => item.username === username && item.id !== id);
  if (duplicated) return { ok: false, message: "账号已存在。" };

  if (id) {
    const existing = db.users.find((item) => item.id === id);
    if (!existing) return { ok: false, message: "用户不存在。" };
    if (existing.id === currentUser.id && !active) return { ok: false, message: "不能停用当前登录账号。" };
    if (existing.id === currentUser.id && role !== "admin") return { ok: false, message: "不能把当前管理员账号改成录单人员。" };

    Object.assign(existing, {
      username,
      name,
      role,
      active,
      editableResources: role === "admin" ? defaultEditableResources("admin") : editableResources,
      updatedAt: todayText(),
    });
    if (password) Object.assign(existing, hashPassword(password));
    return { ok: true, user: sanitizeUser(existing) };
  }

  if (!password) return { ok: false, message: "新建用户需要填写初始密码。" };
  const user = normalizeUser({
    id: makeId("u"),
    username,
    name,
    role,
    active,
    editableResources: role === "admin" ? defaultEditableResources("admin") : editableResources,
    password,
    createdAt: todayText(),
    updatedAt: todayText(),
  });
  db.users.push(user);
  return { ok: true, user: sanitizeUser(user) };
}

export function deleteUser(db, id, currentUser) {
  if (id === currentUser.id) return { ok: false, message: "不能删除当前登录账号。" };
  const index = db.users.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "用户不存在。" };
  db.users.splice(index, 1);
  db.sessions = db.sessions.filter((item) => item.userId !== id);
  return { ok: true };
}

export function upsertRecord(list, record, prefix) {
  const next = {
    ...record,
    id: String(record.id || "").trim() || makeId(prefix),
    updatedAt: record.updatedAt || nowText(),
  };
  const index = list.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...next };
  } else {
    list.unshift(next);
  }
  return next;
}
