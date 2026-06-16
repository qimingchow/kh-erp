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
  const qty = Number(record.qty || 0);
  const safe = Number(record.safe || 0);
  return {
    ...record,
    id: record.id || makeId("stock"),
    qty,
    reserved: Number(record.reserved || 0),
    safe,
    cost: Number(record.cost || 0),
    status: record.status === "冻结" ? "冻结" : qty <= safe ? "低库存" : "正常",
    lastUpdate: record.lastUpdate || new Date().toISOString().slice(0, 10),
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
    const record = upsertRecord(db.state.inbound, body.record || body, "in");
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
