import { badge, renderField, renderTable } from "../ui/components.js";
import { icon } from "../lib/icons.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber, parseNumber } from "../lib/format.js";
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
  const selectedStock = state.inventory.find((item) => item.id === state.ui?.inventoryViewingId) || null;
  const stock = findInventory(state, record) || selectedStock;
  return {
    id: record.id || "",
    inventoryId: record.inventoryId || stock?.id || state.inventory[0]?.id || "",
    date: record.date || new Date().toISOString().slice(0, 10),
    customer: record.customer || "",
    orderNo: record.orderNo || "",
    qty: record.qty ?? 1,
    unitPrice: record.unitPrice ?? stock?.cost ?? 0,
    logistics: record.logistics || "",
    settlement: record.settlement || "待收",
    paidAmount: record.paidAmount ?? (record.settlement === "已收" ? record.amount || 0 : 0),
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
  const formOpen = Boolean(editable && (state.ui?.outboundFormOpen || formRecord));
  const formTitle = formRecord ? "编辑出库记录" : "新增出库记录";

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
    { name: "qty", label: "出库数量", placeholder: "例如：10,000 或 10kk" },
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
    { name: "paidAmount", label: "已收金额", type: "number", min: 0, step: 0.01, defaultValue: 0, required: false },
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
    {
      label: "收款",
      render: (row) => `${formatCurrency(row.paidAmount || 0)}<div class="small">未收 ${formatCurrency(row.remainingAmount ?? Number(row.amount || 0) - Number(row.paidAmount || 0))}</div>`,
    },
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

  const outboundAmount = state.outbound.reduce((total, item) => total + Number(item.amount || 0), 0);
  const pendingShip = state.outbound.filter((item) => item.settlement === "待收").length;
  const shipping = state.outbound.filter((item) => item.logistics).length;
  const completed = state.outbound.filter((item) => item.settlement === "已收").length;

  return `
    <div class="page-stack">
      <section class="shipment-flow panel">
        ${[
          ["待发货", "待安排发货", "orange", "clock"],
          ["已发货", "货物已发出", "blue", "truck"],
          ["运输中", "在途运输", "purple", "truck"],
          ["已签收", "客户已签收", "green", "check"],
        ].map(([title, desc, tone, iconName], index) => `
          <div class="shipment-step ${tone}">
            <span class="module-icon ${tone === "purple" ? "purple" : tone}">${icon(iconName)}</span>
            <div><strong>${title}</strong><small>${desc}</small></div>
          </div>
          ${index < 3 ? '<span class="flow-arrow"></span>' : ""}
        `).join("")}
      </section>

      <section class="metric-grid four">
        ${outboundMetric("今日出库", state.outbound.length, "较昨日 +25%", "clock", "orange")}
        ${outboundMetric("待发货", pendingShip, "较昨日 -12%", "truck", "blue")}
        ${outboundMetric("运输中", shipping, "较昨日 +8%", "truck", "purple")}
        ${outboundMetric("已完成", completed, "较昨日 +15%", "check", "green")}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>出库单据列表</h3>
            <p>先查看已出库单据，再从列表进入查看、编辑、删除或新增出库记录。</p>
          </div>
          <div class="module-header-actions">
            <div class="module-stat">
              <span>出库金额</span>
              <strong>${formatCurrency(outboundAmount)}</strong>
              <span>共 ${state.outbound.length} 条出库</span>
            </div>
            ${editable ? `
              <button class="btn primary" type="button" data-action="outbound-new">
                新增出库
              </button>
            ` : ""}
          </div>
        </div>
        <div class="filter-bar compact">
          <label class="filter-field"><span>出库单号</span><input type="search" placeholder="请输入出库单号" /></label>
          <label class="filter-field"><span>客户名称</span><input type="search" placeholder="请输入客户名称" /></label>
          <label class="filter-field"><span>日期范围</span><input type="text" placeholder="开始日期  ~  结束日期" /></label>
          <label class="filter-field"><span>状态筛选</span><select><option>全部状态</option><option>待发货</option><option>已发货</option><option>运输中</option><option>已签收</option></select></label>
          <button class="btn ghost" type="button">重置</button>
          <button class="btn primary" type="button">查询</button>
        </div>
        ${!editable ? `<div class="empty">当前账号没有出库维护权限，可查看出库和财务联动数据。</div>` : ""}
        ${renderTable(columns, state.outbound)}
      </section>

      ${formOpen ? `
        <section class="panel" id="outbound-form-panel">
          <div class="panel-header">
            <div>
              <h3>${formTitle}</h3>
              <p>出库保存后会扣减关联库存，并同步生成或更新财务应收记录。</p>
            </div>
          </div>
          <form class="stack" data-form="outbound">
            <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
            <div class="field-grid">
              ${fields.map((field) => renderField(field, values[field.name])).join("")}
            </div>
            <div class="computed-amount" data-computed-amount>
              ${renderCollectionSummary(parseNumber(values.qty) * parseNumber(values.unitPrice), values.paidAmount)}
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存出库"}</button>
              <button class="btn ghost" type="button" data-action="outbound-cancel">${formRecord ? "取消编辑" : "收起表单"}</button>
            </div>
          </form>
        </section>
      ` : ""}

      ${selectedRecord ? renderOutboundDetail(selectedRecord, state, editable) : ""}

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>出库趋势（最近30天）</h3>
            <p>模拟展示出库单量和出库数量，后续可接真实报表。</p>
          </div>
        </div>
        <div class="outbound-trend">
          <div class="trend-summary">
            <div><span>总出库单数</span><strong>${formatNumber(state.outbound.length * 120 + 1)}</strong><small>较上期 +12.5%</small></div>
            <div><span>总出库数量</span><strong>${formatNumber(state.outbound.reduce((total, item) => total + Number(item.qty || 0), 0) * 24)}</strong><small>较上期 +8.3%</small></div>
          </div>
          <svg viewBox="0 0 800 220" role="img" aria-label="出库趋势图">
            <path class="chart-grid" d="M30 30H770M30 80H770M30 130H770M30 180H770"></path>
            <path class="chart-line blue" d="M40 150 100 138 160 118 220 126 280 92 340 104 400 74 460 116 520 96 580 70 640 108 700 88 760 60"></path>
            <path class="chart-line green dashed" d="M40 170 100 146 160 130 220 116 280 100 340 92 400 112 460 122 520 98 580 104 640 90 700 96 760 82"></path>
          </svg>
        </div>
      </section>
    </div>
  `;
}

function renderCollectionSummary(amount, paidAmount = 0) {
  const paid = Math.max(0, Math.min(Number(amount || 0), parseNumber(paidAmount)));
  const remaining = Math.max(0, Number(amount || 0) - paid);
  return `预计应收金额：${formatCurrency(amount)}；已收：${formatCurrency(paid)}；未收：${formatCurrency(remaining)}`;
}

function renderOutboundDetail(record, state, editable) {
  const stock = findInventory(state, record);
  const paidAmount = Number(record.paidAmount || 0);
  const remainingAmount =
    record.remainingAmount !== undefined ? Number(record.remainingAmount || 0) : Math.max(0, Number(record.amount || 0) - paidAmount);
  return `
    <section class="panel" id="outbound-detail-panel">
      <div class="panel-header">
        <div>
          <h3>出库单详情</h3>
          <p>查看出库、库存扣减、物流和收款进度。</p>
        </div>
        <div class="module-header-actions">
          ${editable ? `<button class="btn mini" type="button" data-action="outbound-edit" data-id="${escapeHtml(record.id)}">编辑出库</button>` : ""}
        </div>
      </div>
      <div class="detail-grid">
        ${detailItem("销售单号", record.orderNo || "-")}
        ${detailItem("客户", record.customer || "-")}
        ${detailItem("出库物料", `${record.item || "-"} · ${record.spec || "-"}`)}
        ${detailItem("出库数量", `${formatNumber(record.qty)} ${record.unit || ""}`)}
        ${detailItem("关联库存", stock ? `${stock.code} · ${stock.location}` : record.warehouse || "-")}
        ${detailItem("物流", record.logistics || "-")}
        ${detailItem("应收金额", formatCurrency(record.amount))}
        ${detailItem("已收金额", formatCurrency(paidAmount))}
        ${detailItem("未收金额", formatCurrency(remainingAmount))}
        ${detailItem("结算状态", record.settlement || "-")}
        ${detailItem("备注", record.note || "-")}
      </div>
    </section>
  `;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function outboundMetric(label, value, hint, iconName, tone) {
  const mappedTone = tone === "orange" ? "orange" : tone === "purple" ? "purple" : tone;
  return `
    <div class="metric-card ${mappedTone}">
      <span class="module-icon ${mappedTone}">${icon(iconName)}</span>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)} 单</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    </div>
  `;
}
