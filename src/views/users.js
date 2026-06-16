import { RESOURCE_LABELS, ROLE_LABELS } from "../data/seed.js";
import { escapeHtml, formatDate } from "../lib/format.js";
import { badge, renderCheckboxGroup, renderField, renderTable } from "../ui/components.js";

const ROLE_OPTIONS = [
  { label: "管理员", value: "admin" },
  { label: "录单人员", value: "clerk" },
];

const ACTIVE_OPTIONS = [
  { label: "启用", value: "true" },
  { label: "停用", value: "false" },
];

const RESOURCE_OPTIONS = Object.entries(RESOURCE_LABELS).map(([value, label]) => ({ value, label }));

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

  const columns = [
    { label: "账号", render: (row) => `${escapeHtml(row.username)}<div class="small">${escapeHtml(row.name)}</div>` },
    { label: "角色", render: (row) => badge(ROLE_LABELS[row.role] || row.role) },
    { label: "状态", render: (row) => badge(row.active === false ? "停用" : "启用") },
    { label: "可编辑模块", render: (row) => escapeHtml(resourceText(row)) },
    { label: "更新", render: (row) => escapeHtml(formatDate(row.updatedAt || row.createdAt)) },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="user-view" data-id="${escapeHtml(row.id)}">查看</button>
          <button class="btn mini" type="button" data-action="user-edit" data-id="${escapeHtml(row.id)}">编辑</button>
          ${row.id !== currentUser.id ? `<button class="btn mini danger" type="button" data-action="user-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>用户权限</h3>
            <p>管理员在这里创建账号、分配角色和模块编辑权限。录单人员默认只维护来料录入。</p>
          </div>
          <div class="small">共 ${users.length} 个账号</div>
        </div>
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
        ${renderTable(columns, users)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>账号详情</h3>
            <p>权限只控制前端和后端接口的写入操作，部署前请务必修改默认密码。</p>
          </div>
        </div>
        ${selectedUser ? `
          <div class="detail-grid">
            <div class="detail-item"><span>账号</span><strong>${escapeHtml(selectedUser.username)}</strong></div>
            <div class="detail-item"><span>姓名</span><strong>${escapeHtml(selectedUser.name)}</strong></div>
            <div class="detail-item"><span>角色</span><strong>${escapeHtml(ROLE_LABELS[selectedUser.role] || selectedUser.role)}</strong></div>
            <div class="detail-item"><span>状态</span><strong>${escapeHtml(selectedUser.active === false ? "停用" : "启用")}</strong></div>
            <div class="detail-item full"><span>可编辑模块</span><strong>${escapeHtml(resourceText(selectedUser))}</strong></div>
          </div>
        ` : `<div class="empty">暂无用户</div>`}
      </aside>
    </div>
  `;
}
