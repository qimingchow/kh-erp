import { RESOURCE_LABELS, ROLE_LABELS } from "../data/seed.js";
import { icon } from "../lib/icons.js";
import { escapeHtml, formatDate } from "../lib/format.js";
import { badge, renderCheckboxGroup, renderField } from "../ui/components.js";

const ROLE_OPTIONS = [
  { label: "管理员", value: "admin" },
  { label: "录单人员", value: "clerk" },
];

const ACTIVE_OPTIONS = [
  { label: "启用", value: "true" },
  { label: "停用", value: "false" },
];

const RESOURCE_OPTIONS = Object.entries(RESOURCE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const MATRIX_RESOURCE_OPTIONS = [...Object.entries(RESOURCE_LABELS), ["users", "用户权限"]].map(([value, label]) => ({
  value,
  label,
}));

function userValues(user = {}) {
  const current = user || {};
  return {
    id: current.id || "",
    username: current.username || "",
    name: current.name || "",
    role: current.role || "clerk",
    active: current.active === false ? "false" : "true",
    editableResources: Array.isArray(current.editableResources) ? current.editableResources : current.role === "admin" ? Object.keys(RESOURCE_LABELS) : ["inbound"],
  };
}

function resourceText(user) {
  if (user.role === "admin") return "全部模块";
  const resources = Array.isArray(user.editableResources) ? user.editableResources : ["inbound"];
  return resources.map((key) => RESOURCE_LABELS[key] || key).join("、") || "只读";
}

function userInitial(user = {}) {
  return String(user.name || user.username || "U").slice(0, 1).toUpperCase();
}

function roleTone(role) {
  return role === "admin" ? "blue" : "green";
}

function onlineText(user) {
  return user.active === false ? "离线" : "在线";
}

function permissionChecked(user, resource, permission) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (resource === "users") return false;
  const editableResources = new Set(Array.isArray(user.editableResources) ? user.editableResources : ["inbound"]);
  if (permission === "view") return true;
  if (permission === "delete") return false;
  return editableResources.has(resource);
}

function permissionBox(checked) {
  return `<span class="permission-box ${checked ? "checked" : ""}">${checked ? icon("check") : ""}</span>`;
}

export function renderUsers(state, auth = {}) {
  const currentUser = auth?.currentUser;
  const isAdmin = currentUser?.role === "admin";
  const users = auth?.users || [];
  const editingUser = users.find((item) => item.id === state.ui?.userEditingId) || null;
  const selectedUser = users.find((item) => item.id === state.ui?.userViewingId) || editingUser || users[0] || null;
  const values = userValues(editingUser);

  if (!currentUser) {
    return `<div class="empty">请先登录管理员账号后再维护用户。</div>`;
  }

  if (!isAdmin) {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>用户权限</h3>
            <p>当前账号不是管理员，只能查看自己的账号权限。</p>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-item"><span>账号</span><strong>${escapeHtml(currentUser.username)}</strong></div>
          <div class="detail-item"><span>姓名</span><strong>${escapeHtml(currentUser.name)}</strong></div>
          <div class="detail-item"><span>角色</span><strong>${escapeHtml(ROLE_LABELS[currentUser.role] || currentUser.role)}</strong></div>
          <div class="detail-item"><span>可编辑模块</span><strong>${escapeHtml(resourceText(currentUser))}</strong></div>
        </div>
      </section>
    `;
  }

  const fields = [
    { name: "username", label: "登录账号", placeholder: "例如：zhangsan" },
    { name: "name", label: "姓名", placeholder: "例如：张三" },
    {
      name: "password",
      label: editingUser ? "新密码" : "初始密码",
      type: "password",
      required: !editingUser,
      placeholder: editingUser ? "留空表示不修改" : "请设置初始密码",
    },
    { name: "role", label: "角色", type: "select", options: ROLE_OPTIONS, defaultValue: "clerk" },
    { name: "active", label: "账号状态", type: "select", options: ACTIVE_OPTIONS, defaultValue: "true" },
  ];

  const authorizedCount = selectedUser?.role === "admin"
    ? MATRIX_RESOURCE_OPTIONS.length * 5
    : MATRIX_RESOURCE_OPTIONS.reduce((total, item) => {
        return total + ["view", "create", "edit", "delete", "export"].filter((permission) => permissionChecked(selectedUser, item.value, permission)).length;
      }, 0);
  const totalPermissions = MATRIX_RESOURCE_OPTIONS.length * 5;

  return `
    <div class="users-layout">
      <section class="panel users-list-panel">
        <div class="view-tabs user-tabs">
          <button class="active" type="button">用户列表</button>
          <button type="button">角色管理</button>
        </div>
        <div class="filter-bar compact users-search">
          <label class="filter-field wide">
            <span>搜索用户</span>
            <input type="search" placeholder="搜索用户名称、角色或部门..." />
          </label>
          <button class="btn ghost" type="button">${icon("settings")}</button>
        </div>
        <div class="user-card-list">
          ${users.map((user, index) => `
            <article class="user-card ${selectedUser?.id === user.id ? "active" : ""}">
              <button type="button" data-action="user-view" data-id="${escapeHtml(user.id)}" aria-label="查看${escapeHtml(user.name)}"></button>
              <span class="user-avatar tone-${roleTone(user.role)}">${escapeHtml(userInitial(user))}<i class="${user.active === false ? "offline" : ""}"></i></span>
              <div>
                <strong>${escapeHtml(user.name)}</strong>
                <div class="small">${escapeHtml(user.username)} · ${escapeHtml(resourceText(user))}</div>
              </div>
              <div class="user-card-meta">
                ${badge(ROLE_LABELS[user.role] || user.role)}
                <span>${escapeHtml(onlineText(user))}</span>
                <small>最后登录 ${escapeHtml(formatDate(user.updatedAt || user.createdAt || (index ? "2026-06-16" : "2026-06-24")))}</small>
              </div>
            </article>
          `).join("")}
        </div>
        <div class="pager-like">
          <span>共 ${users.length} 条</span>
          <button class="btn mini" type="button" disabled>1</button>
          <button class="btn mini" type="button">2</button>
          <select><option>10 条/页</option></select>
        </div>
      </section>

      <section class="panel users-detail-panel">
        <div class="panel-header">
          <div>
            <h3>用户权限</h3>
            <p>左侧选择用户，右侧查看角色模板、授权概览和模块权限矩阵。</p>
          </div>
          <div class="module-header-actions">
            <button class="btn" type="button"><span class="icon">${icon("download")}</span>导出 Excel</button>
            <button class="btn primary" type="button" data-action="user-new"><span class="icon">${icon("plus")}</span>新增用户</button>
          </div>
        </div>

        ${selectedUser ? `
          <div class="user-profile-card">
            <span class="user-avatar large tone-${roleTone(selectedUser.role)}">${escapeHtml(userInitial(selectedUser))}<i class="${selectedUser.active === false ? "offline" : ""}"></i></span>
            <div>
              <h3>${escapeHtml(selectedUser.name)}</h3>
              <div class="profile-line">
                ${badge(ROLE_LABELS[selectedUser.role] || selectedUser.role)}
                <span>${escapeHtml(selectedUser.username)}</span>
                <span>${escapeHtml(selectedUser.active === false ? "账号停用" : "在线")}</span>
                <span>入职时间：2024/03/15</span>
              </div>
            </div>
            <div class="user-profile-actions">
              <button class="btn" type="button" data-action="user-edit" data-id="${escapeHtml(selectedUser.id)}">${icon("settings")}编辑信息</button>
              <button class="btn" type="button">${icon("refresh")}重置密码</button>
              ${selectedUser.id !== currentUser.id ? `<button class="btn danger" type="button" data-action="user-delete" data-id="${escapeHtml(selectedUser.id)}">删除账户</button>` : ""}
            </div>
          </div>
        ` : `<div class="empty">暂无用户</div>`}

        <div class="permission-summary-grid">
          <div class="role-template-card">
            <span>应用角色模板</span>
            <select>
              <option>${escapeHtml(ROLE_LABELS[selectedUser?.role] || "录单人员")}（模板）</option>
              <option>管理员（模板）</option>
              <option>录单人员（模板）</option>
            </select>
            <small>选择模板可快速套用预设权限。</small>
          </div>
          <div class="permission-overview-card">
            <span>${icon("warning")} 权限概览</span>
            <strong>已授权 ${formatPermissionCount(authorizedCount)}/${formatPermissionCount(totalPermissions)} 项权限</strong>
            <div class="inline-progress"><span style="width:${Math.round((authorizedCount / totalPermissions) * 100)}%"></span></div>
          </div>
          <div class="batch-card">
            <span>批量操作</span>
            <div class="form-actions">
              <button class="btn mini" type="button">全选</button>
              <button class="btn mini" type="button">全不选</button>
              <label class="check-item"><input type="checkbox" checked />继承角色权限</label>
            </div>
          </div>
        </div>

        <div class="permission-matrix-wrap">
          <table class="permission-matrix">
            <thead>
              <tr>
                <th>模块</th>
                <th>查看</th>
                <th>新增</th>
                <th>编辑</th>
                <th>删除</th>
                <th>导出</th>
              </tr>
            </thead>
            <tbody>
              ${MATRIX_RESOURCE_OPTIONS.map((resource, index) => `
                <tr>
                  <td>
                    <span class="module-cell">
                      <span class="module-icon ${["blue", "green", "orange", "purple"][index % 4]}">${icon(moduleIcon(resource.value))}</span>
                      <span><strong>${escapeHtml(resource.label)}</strong><small>${escapeHtml(moduleDescription(resource.value))}</small></span>
                    </span>
                  </td>
                  ${["view", "create", "edit", "delete", "export"].map((permission) => `<td>${permissionBox(permissionChecked(selectedUser, resource.value, permission))}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <details class="collapsible-form" id="user-form-panel" ${editingUser ? "open" : ""}>
          <summary>${editingUser ? "编辑用户信息" : "新增用户"}</summary>
          <form class="stack" data-form="user">
            <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
            <div class="field-grid">
              ${fields.map((field) => renderField(field, values[field.name])).join("")}
            </div>
            ${renderCheckboxGroup("editableResources", "可编辑模块", RESOURCE_OPTIONS, values.editableResources, "管理员自动拥有全部权限")}
            <div class="form-actions">
              <button class="btn primary" type="submit">${editingUser ? "保存用户" : "创建用户"}</button>
              ${editingUser ? `<button class="btn ghost" type="button" data-action="user-cancel">取消编辑</button>` : ""}
            </div>
          </form>
        </details>
      </section>
    </div>
  `;
}

function moduleIcon(resource) {
  const icons = {
    inbound: "inbox",
    inventory: "boxes",
    outbound: "truck",
    production: "calendar",
    machine: "monitor",
    finance: "landmark",
    users: "users",
  };
  return icons[resource] || "dashboard";
}

function moduleDescription(resource) {
  const descriptions = {
    inbound: "客户接单、加工要求、检验标准",
    inventory: "库存、货位、预警、盘点",
    outbound: "出库、客户、金额、对账",
    production: "工单、交期、排产、进度",
    machine: "分选机、测试机和设备状态",
    finance: "应收、应付、收款、付款",
    users: "账号、角色、模块权限",
  };
  return descriptions[resource] || "模块权限";
}

function formatPermissionCount(value) {
  return String(Math.max(0, Number(value || 0)));
}
