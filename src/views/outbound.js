import { badge, renderField, renderTable } from "../ui/components.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";
import { canEdit } from "../lib/state.js";

function findInventory(state, record = {}) {
  if (record.inventoryId) {
    const exact = state.inventory.find((item) => item.id === record.inventoryId);
    if (exact) return exact;
  }

  return (
    state.inventory.find(
      (item) => item.item === record.item && item.spec === record.spec && item.location === record.warehouse,
    ) || state.inventory.find((item) => item.item === record.item && item.spec === record.spec) || null
  );
}

function currentStockQty(state, record = {}) {
  const stock = findInventory(state, record);
  const editingSameStock = stock && stock.id === record.inventoryId;
  return Number(stock?.qty || 0) + (editingSameStock ? Number(record.qty || 0) : 0);
}

function defaultOutboundValues(state, record = {}) {
  const stock = findInventory(state, record);
  return {
    id: record.id || "",
    inventoryId: record.inventoryId || stock?.id || state.inventory[0]?.id || "",
    date: record.date || new Date().toISOString().slice(0, 10),
    customer: record.customer || "",
    orderNo: record.orderNo || "",
    qty: record.qty ?? 1,
    unitPrice: record.unitPrice ?? 0,
    logistics: record.logistics || "",
    settlement: record.settlement || "待收",
    note: record.note || "",
  };
}

function inventoryLabel(item, editingRecord) {
  const availableQty =
    Number(item.qty || 0) + (editingRecord?.inventoryId === item.id ? Number(editingRecord.qty || 0) : 0);
  return `${item.code} · ${item.item} · ${item.location} · 可用 ${formatNumber(availableQty)} ${item.unit}`;
}

export function renderOutbound(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "outbound");
  const formRecord = state.outbound.find((item) => item.id === state.ui?.outboundEditingId) || null;
  const selectedRecord =
    state.outbound.find((item) => item.id === state.ui?.outboundViewingId) || formRecord || state.outbound[0] || null;
  const values = defaultOutboundValues(state, formRecord || {});
  const inventoryOptions = state.inventory.map((item) => ({
    value: item.id,
    label: inventoryLabel(item, formRecord),
  }));

  const fields = [
    { name: "date", label: "出库日期", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    {
      name: "inventoryId",
      label: "关联库存",
      type: "select",
      options: inventoryOptions,
      defaultValue: inventoryOptions[0]?.value || "",
    },
    { name: "customer", label: "客户", placeholder: "例如：华南模组" },
    { name: "orderNo", label: "销售单号", placeholder: "例如：SO-20260614-03" },
    { name: "qty", label: "出库数量", type: "number", min: 1, step: 1, defaultValue: 1 },
    { name: "unitPrice", label: "单价", type: "number", min: 0, step: 0.01, defaultValue: 0 },
    { name: "logistics", label: "物流", placeholder: "例如：德邦 / 顺丰" },
    {
      name: "settlement",
      label: "结算状态",
      type: "select",
      options: [
        { label: "待收", value: "待收" },
        { label: "部分收款", value: "部分收款" },
        { label: "已收", value: "已收" },
      ],
      defaultValue: "待收",
    },
    { name: "note", label: "备注", type: "textarea", full: true, required: false, placeholder: "补充说明" },
  ];

  const columns = [
    { label: "日期", render: (row) => escapeHtml(formatDate(row.date)) },
    { label: "客户", render: (row) => escapeHtml(row.customer) },
    { label: "单号", render: (row) => escapeHtml(row.orderNo) },
    {
      label: "物料",
      render: (row) => `${escapeHtml(row.item)}<div class="small">${escapeHtml(row.spec)}</div>`,
    },
    { label: "数量", render: (row) => `${formatNumber(row.qty)} ${escapeHtml(row.unit)}` },
    { label: "金额", render: (row) => formatCurrency(row.amount) },
    { label: "物流", render: (row) => escapeHtml(row.logistics || "-") },
    { label: "结算", render: (row) => badge(row.settlement) },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="outbound-view" data-id="${escapeHtml(row.id)}">查看</button>
          ${editable ? `<button class="btn mini" type="button" data-action="outbound-edit" data-id="${escapeHtml(row.id)}">编辑</button>` : ""}
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="outbound-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  const pendingReceivable = state.finance.filter((item) => item.type === "应收" && item.status !== "已收");
  const paid = state.finance.filter((item) => item.status === "已收");
  const selectedStock = selectedRecord ? findInventory(state, selectedRecord) : null;
  const selectedFinance = selectedRecord
    ? state.finance.find((item) => item.id === selectedRecord.financeId || item.outboundId === selectedRecord.id)
    : null;

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>出库记录</h3>
            <p>出库时会自动扣减对应库存，并生成或更新一条财务应收记录。</p>
          </div>
          <div class="small">共 ${state.outbound.length} 条</div>
        </div>
        ${editable ? `
          <form class="stack" data-form="outbound">
            <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
            <div class="field-grid">
              ${fields.map((field) => renderField(field, values[field.name])).join("")}
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存出库"}</button>
              ${formRecord ? `<button class="btn ghost" type="button" data-action="outbound-cancel">取消编辑</button>` : ""}
            </div>
          </form>
        ` : `<div class="empty">当前账号没有出库维护权限，可查看出库和财务联动数据。</div>`}
        ${renderTable(columns, state.outbound)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>出库摘要</h3>
            <p>这里先把应收、库存和物流状态串起来，后面可扩展签收、退货和对账。</p>
          </div>
        </div>
        <div class="mini-list">
          ${selectedRecord ? `
            <div class="mini-item">
              <strong>${escapeHtml(selectedRecord.customer)} · ${escapeHtml(selectedRecord.orderNo)}</strong>
              <div class="small">${escapeHtml(selectedRecord.item)} / ${escapeHtml(selectedRecord.spec)}</div>
            </div>
            <div class="mini-item">
              <strong>出库金额</strong>
              <div class="small">${formatNumber(selectedRecord.qty)} ${escapeHtml(selectedRecord.unit)} · ${formatCurrency(selectedRecord.amount)} · ${escapeHtml(selectedRecord.settlement)}</div>
            </div>
            <div class="mini-item">
              <strong>库存联动</strong>
              <div class="small">${selectedStock ? `${escapeHtml(selectedStock.code)} · 当前 ${formatNumber(selectedStock.qty)} ${escapeHtml(selectedStock.unit)}，编辑可用 ${formatNumber(currentStockQty(state, selectedRecord))}` : "未找到关联库存"}</div>
            </div>
            <div class="mini-item">
              <strong>财务联动</strong>
              <div class="small">${selectedFinance ? `${escapeHtml(selectedFinance.source)} · ${formatCurrency(selectedFinance.amount)} · ${escapeHtml(selectedFinance.status)}` : "未找到关联财务记录"}</div>
            </div>
          ` : `<div class="empty">暂无出库记录</div>`}
          <div class="mini-item">
            <strong>待收金额</strong>
            <div class="small">${formatCurrency(pendingReceivable.reduce((total, item) => total + Number(item.amount || 0), 0))}</div>
          </div>
          <div class="mini-item">
            <strong>已完成回款</strong>
            <div class="small">${formatCurrency(paid.reduce((total, item) => total + Number(item.amount || 0), 0))}</div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="small">出库审批、装车照片、物流轨迹、客户签收、退货记录</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
