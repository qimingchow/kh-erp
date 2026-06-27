import { badge, renderField, renderTable } from "../ui/components.js";
import { icon } from "../lib/icons.js";
import { escapeHtml, formatCompactCurrency, formatCurrency, formatDate, formatNumber } from "../lib/format.js";
import { canEdit } from "../lib/state.js";

function defaultFinanceValues(record = {}) {
  const current = record || {};
  const amount = Number(current.amount || 0);
  const paidAmount =
    current.paidAmount !== undefined
      ? Number(current.paidAmount || 0)
      : current.status === "已收" || current.status === "已付" || current.type === "收款" || current.type === "付款"
        ? amount
        : 0;
  return {
    id: current.id || "",
    outboundId: current.outboundId || "",
    date: current.date || new Date().toISOString().slice(0, 10),
    type: current.type || "应收",
    source: current.source || "",
    counterparty: current.counterparty || "",
    amount,
    paidAmount,
    remainingAmount: current.remainingAmount ?? Math.max(0, amount - paidAmount),
    status: current.status || "待收",
    method: current.method || "月结",
    note: current.note || "",
  };
}

export function renderFinance(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "finance");
  const formRecord = state.finance.find((item) => item.id === state.ui?.financeEditingId) || null;
  const financeDraft = state.ui?.financeDraft || null;
  const selectedRecord =
    state.finance.find((item) => item.id === state.ui?.financeViewingId) || formRecord || state.finance[0] || null;
  const values = defaultFinanceValues(formRecord || financeDraft);
  const formOpen = Boolean(editable && (state.ui?.financeFormOpen || formRecord || financeDraft));
  const pendingReceivable = state.finance.reduce((total, item) => total + remainingReceivable(item), 0);
  const receivableTotal = state.finance
    .filter((item) => item.type === "应收")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const payableTotal = state.finance
    .filter((item) => item.type === "应付")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const paidIn = state.finance.reduce((total, item) => total + cashInAmount(item), 0);
  const paidOut = state.finance.reduce((total, item) => total + cashOutAmount(item), 0);
  const accountBalance = paidIn - paidOut;
  const profit = accountBalance;
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
    { name: "paidAmount", label: "已收/已付金额", type: "number", min: 0, step: 0.01, defaultValue: 0, required: false },
    {
      name: "status",
      label: "状态",
      type: "select",
      options: [
        { label: "待收", value: "待收" },
        { label: "部分收款", value: "部分收款" },
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
    {
      label: "已收/已付",
      render: (row) => `${formatCurrency(financePaidAmount(row))}<div class="small">未结 ${formatCurrency(financeRemainingAmount(row))}</div>`,
    },
    { label: "状态", render: (row) => badge(row.status) },
    { label: "方式", render: (row) => escapeHtml(row.method) },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="finance-view" data-id="${escapeHtml(row.id)}">查看</button>
          ${editable ? `<button class="btn mini" type="button" data-action="finance-edit" data-id="${escapeHtml(row.id)}">编辑</button>` : ""}
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="finance-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>财务记录</h3>
            <p>先把出库后的应收、来料对应的应付和收付款先记清楚，后面再接总账和对账单。</p>
          </div>
          <div class="module-header-actions">
            <button class="btn" type="button" data-action="finance-report"><span class="icon">${icon("chart")}</span>生成报表</button>
            ${editable ? `<button class="btn primary" type="button" data-action="finance-new"><span class="icon">${icon("plus")}</span>新增记录</button>` : ""}
            <div class="module-stat">
              <span>待收账款</span>
              <strong>${formatCompactCurrency(pendingReceivable)}</strong>
              <span>共 ${state.finance.length} 条记录</span>
            </div>
          </div>
        </div>

        <div class="metric-grid four">
          ${financeMetric("本月应收", receivableTotal, "出库生成的应收总额", "inbox", "blue")}
          ${financeMetric("本月应付", payableTotal, "待付款和已付款总额", "warning", "red")}
          ${financeMetric("账户余额", accountBalance, "实际已收 - 实际已付", "landmark", "green")}
          ${financeMetric("本月净收支", profit, "现金口径，不含待收款", "chart", "orange")}
        </div>

        <div class="view-tabs">
          <button class="active" type="button">应收款</button>
          <button type="button">应付款</button>
          <button type="button">成本核算</button>
          <button type="button">收支明细</button>
        </div>

        <div class="filter-bar compact">
          <label class="filter-field"><span>客户/供应商</span><select><option>请选择客户或供应商</option></select></label>
          <label class="filter-field"><span>日期范围</span><input type="text" value="2026-06-01 至 2026-06-30" /></label>
          <label class="filter-field"><span>金额范围</span><input type="text" placeholder="最小金额 - 最大金额" /></label>
          <label class="filter-field"><span>状态筛选</span><select><option>全部状态</option><option>待收</option><option>已收</option><option>待付</option></select></label>
          <button class="btn ghost" type="button">重置</button>
          <button class="btn primary" type="button">查询</button>
        </div>

        ${formOpen ? `
          <details class="collapsible-form" id="finance-form-panel" open>
            <summary>${formRecord ? "编辑财务记录" : "新增财务记录"}</summary>
            <form class="stack" data-form="finance">
              <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
              <input type="hidden" name="outboundId" value="${escapeHtml(values.outboundId)}" />
              <div class="field-grid">
                ${fields.map((field) => renderField(field, values[field.name])).join("")}
              </div>
              <div class="form-actions">
                <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存财务"}</button>
                <button class="btn ghost" type="button" data-action="finance-cancel">${formRecord ? "取消编辑" : "收起表单"}</button>
              </div>
            </form>
          </details>
        ` : !editable ? `<div class="empty">当前账号没有财务维护权限，可查看财务记录。</div>` : ""}
        ${
          state.ui?.financeReportOpen
            ? `
              <div class="report-preview" id="finance-report-panel">
                <div>
                  <strong>财务报表摘要</strong>
                  <span>当前基于页面数据生成，应收 ${formatCurrency(receivableTotal)}，待收 ${formatCurrency(pendingReceivable)}，账户余额 ${formatCurrency(accountBalance)}。</span>
                </div>
                <button class="btn mini" type="button" data-action="finance-report-close">关闭</button>
              </div>
            `
            : ""
        }
        ${renderTable(columns, state.finance, { pageKey: "finance", ui: state.ui })}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>财务摘要</h3>
            <p>出库后最常见的是回款跟踪；来料加工类工厂通常还要盯应付和加工费。</p>
          </div>
        </div>
        <div class="trend-card">
          <div class="chart-legend"><span class="green">收入</span><span class="red">支出</span><span class="blue">利润</span></div>
          <svg viewBox="0 0 320 170" role="img" aria-label="收支趋势图">
            <path class="chart-grid" d="M30 20H300M30 60H300M30 100H300M30 140H300"></path>
            <path class="chart-line green" d="M34 132 78 112 122 96 166 76 210 56 254 48 298 34"></path>
            <path class="chart-line red" d="M34 150 78 138 122 122 166 104 210 88 254 78 298 68"></path>
            <path class="chart-line blue" d="M34 120 78 106 122 96 166 82 210 66 254 54 298 48"></path>
          </svg>
        </div>
        <div class="mini-list">
          ${selectedRecord ? `
            <div class="mini-item">
              <strong>${escapeHtml(selectedRecord.source)} · ${escapeHtml(selectedRecord.status)}</strong>
              <div class="small">${escapeHtml(selectedRecord.counterparty)} · 总额 ${formatCurrency(selectedRecord.amount)} · 已结 ${formatCurrency(financePaidAmount(selectedRecord))} · ${escapeHtml(formatDate(selectedRecord.date))}</div>
            </div>
          ` : `<div class="empty">暂无财务记录</div>`}
          <div class="mini-item">
            <strong>待收金额</strong>
            <div class="small">${formatCurrency(
              state.finance.reduce((total, item) => total + remainingReceivable(item), 0),
            )}</div>
          </div>
          <div class="mini-item">
            <strong>待付金额</strong>
            <div class="small">${formatCurrency(
              state.finance.reduce((total, item) => total + remainingPayable(item), 0),
            )}</div>
          </div>
          <div class="mini-item">
            <strong>待处理提醒</strong>
            <div class="reminder-list">
              <span>逾期未收款 <b>${state.finance.filter((item) => remainingReceivable(item) > 0).length}</b> 笔</span>
              <span>即将到期 <b>7</b> 笔</span>
              <span>待审核单据 <b>12</b> 笔</span>
              <span>异常单据 <b>3</b> 笔</span>
            </div>
          </div>
          <div class="mini-item">
            <strong>快捷操作</strong>
            <div class="quick-grid">
              <button type="button" data-action="finance-quick" data-kind="receipt">新增收款</button>
              <button type="button" data-action="finance-quick" data-kind="payment">新增付款</button>
              <button type="button" data-action="finance-quick" data-kind="expense">费用报销</button>
              <button type="button" data-action="finance-quick" data-kind="transfer">转账记录</button>
              <button type="button" data-action="finance-quick" data-kind="invoice">开票管理</button>
              <button type="button" data-action="finance-quick" data-kind="reconcile">对账管理</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  `;
}

function financeMetric(label, value, hint, iconName, tone) {
  return `
    <div class="metric-card ${tone}">
      <span class="module-icon ${tone}">${icon(iconName)}</span>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong title="${escapeHtml(formatCurrency(value))}">${formatCompactCurrency(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    </div>
  `;
}

function financePaidAmount(record = {}) {
  const amount = Number(record.amount || 0);
  if (record.type === "收款" || record.type === "付款") return amount;
  if (record.status === "已收" || record.status === "已付") return amount;
  if (record.status === "部分收款") return Math.max(0, Math.min(amount, Number(record.paidAmount || 0)));
  return Math.max(0, Math.min(amount, Number(record.paidAmount || 0)));
}

function financeRemainingAmount(record = {}) {
  const amount = Number(record.amount || 0);
  if (record.type === "收款" || record.type === "付款") return 0;
  return Math.max(0, amount - financePaidAmount(record));
}

function remainingReceivable(record = {}) {
  return record.type === "应收" ? financeRemainingAmount(record) : 0;
}

function remainingPayable(record = {}) {
  return record.type === "应付" ? financeRemainingAmount(record) : 0;
}

function cashInAmount(record = {}) {
  if (record.type === "收款") return Number(record.amount || 0);
  if (record.type === "应收") return financePaidAmount(record);
  return 0;
}

function cashOutAmount(record = {}) {
  if (record.type === "付款") return Number(record.amount || 0);
  if (record.type === "应付") return financePaidAmount(record);
  return 0;
}
