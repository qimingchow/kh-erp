import { badge, renderForm, renderTable } from "../ui/components.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";

export function renderOutbound(state) {
  const inventoryOptions = state.inventory.map((item) => ({
    value: item.id,
    label: `${item.code} · ${item.item} · ${item.location} · 可用 ${formatNumber(item.qty)} ${item.unit}`,
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
    { label: "物料", render: (row) => `${escapeHtml(row.item)}<div class="small">${escapeHtml(row.spec)}</div>` },
    { label: "数量", render: (row) => `${formatNumber(row.qty)} ${escapeHtml(row.unit)}` },
    { label: "金额", render: (row) => formatCurrency(row.amount) },
    { label: "物流", render: (row) => escapeHtml(row.logistics) },
    { label: "结算", render: (row) => badge(row.settlement) },
  ];

  const pendingReceivable = state.finance.filter((item) => item.type === "应收" && item.status !== "已收");
  const paid = state.finance.filter((item) => item.status === "已收");

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>出库记录</h3>
            <p>出库时会自动扣减对应库存，并生成一条财务应收记录。</p>
          </div>
          <div class="small">共 ${state.outbound.length} 条</div>
        </div>
        ${renderForm("outbound", fields, "保存出库")}
        ${renderTable(columns, state.outbound)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>财务联动</h3>
            <p>出库之后通常最重要的是回款跟踪，这里先把应收金额串起来。</p>
          </div>
        </div>
        <div class="mini-list">
          <div class="mini-item">
            <strong>待收金额</strong>
            <div class="small">${formatCurrency(pendingReceivable.reduce((total, item) => total + item.amount, 0))}</div>
          </div>
          <div class="mini-item">
            <strong>已完成回款</strong>
            <div class="small">${formatCurrency(paid.reduce((total, item) => total + item.amount, 0))}</div>
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
