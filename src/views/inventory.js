import { badge, renderField, renderTable } from "../ui/components.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";
import { canEdit } from "../lib/state.js";

function defaultInventoryValues(record = {}) {
  const current = record || {};
  return {
    id: current.id || "",
    code: current.code || "",
    item: current.item || "",
    spec: current.spec || "",
    location: current.location || "",
    qty: current.qty ?? 0,
    reserved: current.reserved ?? 0,
    safe: current.safe ?? 0,
    unit: current.unit || "",
    status: current.status || "正常",
    cost: current.cost ?? 0,
    note: current.note || "",
  };
}

function availableQty(record) {
  return Math.max(0, Number(record.qty || 0) - Number(record.reserved || 0));
}

export function renderInventory(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "inventory");
  const formRecord = state.inventory.find((item) => item.id === state.ui?.inventoryEditingId) || null;
  const selectedRecord =
    state.inventory.find((item) => item.id === state.ui?.inventoryViewingId) || formRecord || state.inventory[0] || null;
  const values = defaultInventoryValues(formRecord);

  const fields = [
    { name: "code", label: "物料编码", placeholder: "例如：MAT-WF-005" },
    { name: "item", label: "物料名称", placeholder: "例如：晶圆" },
    { name: "spec", label: "规格", placeholder: "例如：8英寸 / Lot-A26" },
    { name: "location", label: "货位", placeholder: "例如：W1-05" },
    { name: "qty", label: "数量", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "reserved", label: "预留数量", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "safe", label: "安全库存", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "unit", label: "单位", placeholder: "片 / 卷 / 套 / 批" },
    {
      name: "status",
      label: "库存状态",
      type: "select",
      options: [
        { label: "正常", value: "正常" },
        { label: "低库存", value: "低库存" },
        { label: "冻结", value: "冻结" },
      ],
      defaultValue: "正常",
    },
    { name: "cost", label: "参考单价", type: "number", min: 0, step: 0.01, defaultValue: 0 },
    { name: "note", label: "备注", type: "textarea", full: true, required: false, placeholder: "补充说明" },
  ];

  const columns = [
    { label: "编码", render: (row) => escapeHtml(row.code) },
    { label: "物料", render: (row) => `${escapeHtml(row.item)}<div class="small">${escapeHtml(row.spec)}</div>` },
    { label: "货位", render: (row) => escapeHtml(row.location) },
    { label: "数量", render: (row) => `${formatNumber(row.qty)} ${escapeHtml(row.unit)}` },
    { label: "可用", render: (row) => `${formatNumber(availableQty(row))} ${escapeHtml(row.unit)}` },
    { label: "预留/安全", render: (row) => `${formatNumber(row.reserved)} / ${formatNumber(row.safe)}` },
    { label: "状态", render: (row) => badge(row.status) },
    { label: "成本", render: (row) => formatCurrency(row.cost) },
    { label: "更新", render: (row) => escapeHtml(formatDate(row.lastUpdate)) },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="inventory-view" data-id="${escapeHtml(row.id)}">查看</button>
          ${editable ? `<button class="btn mini" type="button" data-action="inventory-edit" data-id="${escapeHtml(row.id)}">编辑</button>` : ""}
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="inventory-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  const lowStockItems = state.inventory.filter((item) => item.qty <= item.safe).map((item) => item.item);
  const frozenItems = state.inventory.filter((item) => item.status === "冻结").map((item) => item.item);
  const stockQty = state.inventory.reduce((total, item) => total + Number(item.qty || 0), 0);

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>库存管理</h3>
            <p>支持查看、编辑、删除和低库存预警。后续可以继续接条码、盘点和货位图。</p>
          </div>
          <div class="module-stat">
            <span>当前库存</span>
            <strong>${formatNumber(stockQty)}</strong>
            <span>共 ${state.inventory.length} 条物料</span>
          </div>
        </div>
        ${editable ? `
          <form class="stack" data-form="inventory">
            <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
            <div class="field-grid">
              ${fields.map((field) => renderField(field, values[field.name])).join("")}
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存库存"}</button>
              ${formRecord ? `<button class="btn ghost" type="button" data-action="inventory-cancel">取消编辑</button>` : ""}
            </div>
          </form>
        ` : `<div class="empty">当前账号没有库存维护权限，可查看库存数据。</div>`}
        ${renderTable(columns, state.inventory)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>库存摘要</h3>
            <p>这里先做安全库存和冻结状态提醒，后面可以扩展盘点差异和库龄分析。</p>
          </div>
        </div>
        <div class="mini-list">
          ${selectedRecord ? `
            <div class="mini-item">
              <strong>${escapeHtml(selectedRecord.item)}</strong>
              <div class="small">${escapeHtml(selectedRecord.code)} · ${escapeHtml(selectedRecord.spec)}</div>
            </div>
            <div class="mini-item">
              <strong>数量状态</strong>
              <div class="small">账面 ${formatNumber(selectedRecord.qty)}，预留 ${formatNumber(selectedRecord.reserved)}，可用 ${formatNumber(availableQty(selectedRecord))} ${escapeHtml(selectedRecord.unit)}</div>
            </div>
            <div class="mini-item">
              <strong>库位 / 状态</strong>
              <div class="small">${escapeHtml(selectedRecord.location)} · ${escapeHtml(selectedRecord.status)} · ${escapeHtml(formatDate(selectedRecord.lastUpdate))}</div>
            </div>
          ` : `<div class="empty">暂无库存记录</div>`}
          <div class="mini-item">
            <strong>低库存物料</strong>
            <div class="small">${escapeHtml(lowStockItems.join("、") || "暂无")}</div>
          </div>
          <div class="mini-item">
            <strong>冻结物料</strong>
            <div class="small">${escapeHtml(frozenItems.join("、") || "暂无")}</div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="small">盘点单、差异单、库位地图、呆滞料、保质期提醒</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
