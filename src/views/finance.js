import { badge, renderForm, renderTable } from "../ui/components.js";
import { escapeHtml, formatCurrency, formatDate } from "../lib/format.js";

export function renderFinance(state) {
  const pendingReceivable = state.finance
    .filter((item) => item.type === "应收" && item.status !== "已收")
    .reduce((total, item) => total + item.amount, 0);
  const fields = [
    { name: "date", label: "日期", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    {
      name: "type",
      label: "类型",
      type: "select",
      options: [
        { label: "应收", value: "应收" },
        { label: "应付", value: "应付" },
        { label: "收款", value: "收款" },
        { label: "付款", value: "付款" },
      ],
      defaultValue: "应收",
    },
    { name: "source", label: "来源单据", placeholder: "例如：出库单 SO-20260614-03" },
    { name: "counterparty", label: "往来单位", placeholder: "例如：华南模组" },
    { name: "amount", label: "金额", type: "number", min: 0, step: 0.01, defaultValue: 0 },
    {
      name: "status",
      label: "状态",
      type: "select",
      options: [
        { label: "待收", value: "待收" },
        { label: "已收", value: "已收" },
        { label: "待付", value: "待付" },
        { label: "已付", value: "已付" },
      ],
      defaultValue: "待收",
    },
    {
      name: "method",
      label: "结算方式",
      type: "select",
      options: [
        { label: "现金", value: "现金" },
        { label: "转账", value: "转账" },
        { label: "月结", value: "月结" },
        { label: "预付", value: "预付" },
      ],
      defaultValue: "月结",
    },
    { name: "note", label: "备注", type: "textarea", full: true, required: false, placeholder: "补充说明" },
  ];

  const columns = [
    { label: "日期", render: (row) => escapeHtml(formatDate(row.date)) },
    { label: "类型", render: (row) => badge(row.type) },
    { label: "来源", render: (row) => escapeHtml(row.source) },
    { label: "往来单位", render: (row) => escapeHtml(row.counterparty) },
    { label: "金额", render: (row) => formatCurrency(row.amount) },
    { label: "状态", render: (row) => badge(row.status) },
    { label: "方式", render: (row) => escapeHtml(row.method) },
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>财务记录</h3>
            <p>先把出库后的应收、来料对应的应付和收付款先记清楚，后面再接总账和对账单。</p>
          </div>
          <div class="module-stat">
            <span>待收账款</span>
            <strong>${formatCurrency(pendingReceivable)}</strong>
            <span>共 ${state.finance.length} 条记录</span>
          </div>
        </div>
        ${renderForm("finance", fields, "保存财务")}
        ${renderTable(columns, state.finance)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>财务摘要</h3>
            <p>出库后最常见的是回款跟踪；来料加工类工厂通常还要盯应付和加工费。</p>
          </div>
        </div>
        <div class="mini-list">
          <div class="mini-item">
            <strong>待收金额</strong>
            <div class="small">${formatCurrency(
              state.finance.filter((item) => item.type === "应收" && item.status !== "已收").reduce((total, item) => total + item.amount, 0),
            )}</div>
          </div>
          <div class="mini-item">
            <strong>待付金额</strong>
            <div class="small">${formatCurrency(
              state.finance.filter((item) => item.type === "应付" && item.status !== "已付").reduce((total, item) => total + item.amount, 0),
            )}</div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="small">对账单、账龄分析、税票、收据附件、合同管理</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
