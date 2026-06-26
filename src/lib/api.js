let serverMode = false;

function tokenHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...tokenHeader(options.token),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("当前地址没有启用后端服务。");
  }

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "请求失败。");
  }
  return payload;
}

export function isServerMode() {
  return serverMode;
}

export function setServerMode(value) {
  serverMode = Boolean(value);
}

export async function bootstrap(token) {
  const payload = await request("/api/bootstrap", { token });
  setServerMode(Boolean(payload.serverMode));
  return payload;
}

export async function loginRemote(username, password) {
  const payload = await request("/api/login", {
    method: "POST",
    body: { username, password },
  });
  setServerMode(true);
  return payload;
}

export async function logoutRemote(token) {
  return request("/api/logout", { method: "POST", token });
}

export async function resetRemote(token) {
  return request("/api/reset", { method: "POST", token });
}

export async function saveInboundRemote(record, token) {
  return request("/api/inbound", { method: "POST", token, body: { record } });
}

export async function deleteInboundRemote(id, token) {
  return request(`/api/inbound/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

export async function saveInventoryRemote(record, token) {
  return request("/api/inventory", { method: "POST", token, body: { record } });
}

export async function deleteInventoryRemote(id, token) {
  return request(`/api/inventory/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

export async function saveOutboundRemote(record, token) {
  return request("/api/outbound", { method: "POST", token, body: { record } });
}

export async function deleteOutboundRemote(id, token) {
  return request(`/api/outbound/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

export async function saveProductionRemote(record, token) {
  return request("/api/production", { method: "POST", token, body: { record } });
}

export async function deleteProductionRemote(id, token) {
  return request(`/api/production/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

export async function stockInProductionRemote(id, token) {
  return request(`/api/production/${encodeURIComponent(id)}/stock-in`, { method: "POST", token });
}

export async function updateMachineRemote(id, patch, token) {
  return request(`/api/machines/${encodeURIComponent(id)}`, { method: "PATCH", token, body: { patch } });
}

export async function importMachinesRemote(machines, token) {
  return request("/api/machines/import", { method: "POST", token, body: { machines } });
}

export async function saveFinanceRemote(record, token) {
  return request("/api/finance", { method: "POST", token, body: { record } });
}

export async function deleteFinanceRemote(id, token) {
  return request(`/api/finance/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

export async function saveUserRemote(user, token) {
  if (user.id) {
    return request(`/api/users/${encodeURIComponent(user.id)}`, { method: "PUT", token, body: user });
  }
  return request("/api/users", { method: "POST", token, body: user });
}

export async function deleteUserRemote(id, token) {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE", token });
}
