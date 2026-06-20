import { badge, renderField, renderTable } from "../ui/components.js";
import { escapeHtml, formatDate, formatNumber } from "../lib/format.js";
import { getMachineName } from "../domain/actions.js";
import { canEdit } from "../lib/state.js";

function defaultProductionValues(record = {}) {
  const current = record || {};
  return {
    id: current.id || "",
    planNo: current.planNo || "",
    orderNo: current.orderNo || "",
    item: current.item || "",
    qty: current.qty ?? 1,
    dueDate: current.dueDate || new Date().toISOString().slice(0, 10),
    machineId: current.machineId || "",
    priority: current.priority || "标准",
    status: current.status || "待排产",
    progress: current.progress ?? 0,
    note: current.note || "",
  };
}

export function renderProduction(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "production");
  const formRecord = state.production.find((item) => item.id === state.ui?.productionEditingId) || null;
  const selectedRecord =
    state.production.find((item) => item.id === state.ui?.productionViewingId) || formRecord || state.production[0] || null;
  const values = defaultProductionValues(formRecord);
  const pendingPlans = state.production.filter((item) => item.status !== "已完成").length;
  const machineOptions = state.machines.map((item) => ({
    value: item.id,
    label: `${item.type} · ${item.name} · ${item.area} · ${item.status}`,
  }));

  const fields = [
    { name: "planNo", label: "计划编号", placeholder: "例如：PL-260614-04" },
    { name: "orderNo", label: "关联单号", placeholder: "例如：MO-20260614-03" },
    { name: "item", label: "生产物料", placeholder: "例如：晶圆分选批" },
    { name: "qty", label: "计划数量", type: "number", min: 1, step: 1, defaultValue: 1 },
    { name: "dueDate", label: "交期", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    {
      name: "machineId",
      label: "机台",
      type: "select",
      options: machineOptions,
      defaultValue: machineOptions[0]?.value || "",
    },
    {
      name: "priority",
      label: "优先级",
      type: "select",
      options: [
        { label: "普通", value: "普通" },
        { label: "标准", value: "标准" },
        { label: "高", value: "高" },
        { label: "加急", value: "加急" },
      ],
      defaultValue: "标准",
    },
    {
      name: "status",
      label: "状态",
      type: "select",
      options: [
        { label: "待排产", value: "待排产" },
        { label: "进行中", value: "进行中" },
        { label: "已完成", value: "已完成" },
      ],
      defaultValue: "待排产",
    },
    { name: "progress", label: "进度", type: "number", min: 0, max: 100, step: 1, defaultValue: 0 },
    { name: "note", label: "备注", type: "textarea", full: true, required: false, placeholder: "补充说明" },
  ];

  const columns = [
    { label: "计划号", render: (row) => escapeHtml(row.planNo) },
    { label: "订单", render: (row) => escapeHtml(row.orderNo) },
    { label: "物料", render: (row) => `${escapeHtml(row.item)}<div class="small">${escapeHtml(row.qty)} 件</div>` },
    { label: "机台", render: (row) => escapeHtml(getMachineName(state, row.machineId)) },
    { label: "交期", render: (row) => escapeHtml(formatDate(row.dueDate)) },
    { label: "优先级", render: (row) => badge(row.priority) },
    { label: "状态", render: (row) => badge(row.status) },
    { label: "进度", render: (row) => `${formatNumber(row.progress)}%` },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="production-view" data-id="${escapeHtml(row.id)}">查看</button>
          ${editable ? `<button class="btn mini" type="button" data-action="production-edit" data-id="${escapeHtml(row.id)}">编辑</button>` : ""}
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="production-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>生产计划</h3>
            <p>把订单、交期、机台和进度连在一起，方便往后扩展排产、工序和报工。</p>
          </div>
          <div class="module-stat">
            <span>在制计划</span>
            <strong>${formatNumber(pendingPlans)}</strong>
            <span>共 ${state.production.length} 条计划</span>
          </div>
        </div>
        ${editable ? `
          <form class="stack" data-form="production">
            <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
            <div class="field-grid">
              ${fields.map((field) => renderField(field, values[field.name])).join("")}
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存计划"}</button>
              ${formRecord ? `<button class="btn ghost" type="button" data-action="production-cancel">取消编辑</button>` : ""}
            </div>
          </form>
        ` : `<div class="empty">当前账号没有生产计划维护权限，可查看排产数据。</div>`}
        ${renderTable(columns, state.production)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>机台联动</h3>
            <p>如果排产到指定机台，可以直接把机台当前工单和进度一起更新。</p>
          </div>
        </div>
        <div class="mini-list">
          ${selectedRecord ? `
            <div class="mini-item">
              <strong>${escapeHtml(selectedRecord.planNo)} · ${escapeHtml(selectedRecord.status)}</strong>
              <div class="small">${escapeHtml(selectedRecord.item)} · ${formatNumber(selectedRecord.qty)} 件 · ${escapeHtml(getMachineName(state, selectedRecord.machineId))}</div>
            </div>
            <div class="mini-item">
              <strong>交期 / 进度</strong>
              <div class="small">${escapeHtml(formatDate(selectedRecord.dueDate))} · ${formatNumber(selectedRecord.progress)}% · ${escapeHtml(selectedRecord.priority)}</div>
            </div>
          ` : `<div class="empty">暂无生产计划</div>`}
          <div class="mini-item">
            <strong>进行中计划</strong>
            <div class="small">${state.production.filter((item) => item.status === "进行中").length} 条</div>
          </div>
          <div class="mini-item">
            <strong>今日到期</strong>
            <div class="small">${state.production.filter((item) => item.dueDate === new Date().toISOString().slice(0, 10)).length} 条</div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="small">工序流转、报工、工时统计、物料齐套、异常停机</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
