import { badge, renderField, renderTable } from "../ui/components.js";
import { icon } from "../lib/icons.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";
import { getMachineName, productionMachineIds } from "../domain/actions.js";
import { canEdit } from "../lib/state.js";

function defaultProductionValues(record = {}, draftInbound = null, state = { machines: [] }) {
  const current = record || {};
  const machineIds = productionMachineIds(current);
  const draftPlanNo = draftInbound
    ? `PL-${String(draftInbound.orderDate || draftInbound.date || new Date().toISOString().slice(0, 10)).replaceAll("-", "")}-${String((draftInbound.id || "").split("-").pop() || "001").padStart(3, "0")}`
    : "";
  return {
    id: current.id || "",
    planNo: current.planNo || draftPlanNo,
    orderNo: current.orderNo || draftInbound?.orderNo || "",
    item: current.item || draftInbound?.productSpec || "",
    qty: current.qty ?? draftInbound?.orderQty ?? 1,
    unit: current.unit || draftInbound?.unit || "K",
    unitPrice: current.unitPrice ?? draftInbound?.unitPrice ?? "",
    amount: current.amount ?? draftInbound?.amount ?? "",
    startDate: current.startDate || draftInbound?.orderDate || draftInbound?.date || new Date().toISOString().slice(0, 10),
    dueDate: current.dueDate || draftInbound?.deliveryDate || new Date().toISOString().slice(0, 10),
    machineGroup: current.machineGroup || "",
    machineId: machineIds[0] || "",
    machineIds,
    priority: current.priority || "标准",
    status: current.status || "待排产",
    progress: current.progress ?? 0,
    inventoryId: current.inventoryId || "",
    stockedQty: current.stockedQty || 0,
    stockedAt: current.stockedAt || "",
    note: current.note || (draftInbound ? `由来料单 ${draftInbound.orderNo || draftInbound.id} 生成，客户：${draftInbound.customerName || ""}` : ""),
  };
}

export function renderProduction(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "production");
  const formRecord = state.production.find((item) => item.id === state.ui?.productionEditingId) || null;
  const draftInbound =
    !formRecord && state.ui?.productionDraftInboundId
      ? state.inbound.find((item) => item.id === state.ui.productionDraftInboundId) || null
      : null;
  const selectedRecord =
    state.production.find((item) => item.id === state.ui?.productionViewingId) || formRecord || state.production[0] || null;
  const values = defaultProductionValues(formRecord, draftInbound, state);
  const viewMode = state.ui?.productionViewMode === "gantt" ? "gantt" : "list";
  const pendingPlans = state.production.filter((item) => item.status !== "已完成").length;
  const runningPlans = state.production.filter((item) => item.status === "进行中").length;
  const completedPlans = state.production.filter((item) => item.status === "已完成").length;
  const overduePlans = state.production.filter((item) => item.status !== "已完成" && item.dueDate < new Date().toISOString().slice(0, 10)).length;
  const formOpen = Boolean(editable && (state.ui?.productionFormOpen || formRecord || draftInbound));
  const formTitle = formRecord ? "编辑生产计划" : draftInbound ? "由来料生成生产计划" : "新增生产计划";
  const ganttWindow = createGanttWindow(state, selectedRecord);

  const fields = [
    { name: "planNo", label: "计划编号", placeholder: "例如：PL-260614-04" },
    { name: "orderNo", label: "关联单号", placeholder: "例如：MO-20260614-03" },
    { name: "item", label: "生产物料", placeholder: "例如：晶圆分选批" },
    { name: "qty", label: "计划数量", placeholder: "例如：100,000 或 100kk" },
    { name: "unit", label: "单位", placeholder: "K / KK / PCS / 批" },
    { name: "unitPrice", label: "单价", type: "number", min: 0, step: 0.01, defaultValue: "", required: false },
    { name: "amount", label: "金额", type: "number", min: 0, step: 0.01, defaultValue: "", required: false },
    { name: "startDate", label: "计划开始", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    { name: "dueDate", label: "交期", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    {
      name: "machineGroup",
      label: "生产组名称",
      placeholder: "例如：A线-白班 / 临时10+10组",
      defaultValue: "",
      required: false,
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
    { label: "物料", render: (row) => `${escapeHtml(row.item)}<div class="small">${formatNumber(row.qty)} ${escapeHtml(row.unit || "K")}</div>` },
    { label: "生产组 / 资源", render: (row) => `${escapeHtml(row.machineGroup || "未命名生产组")}<div class="small">${escapeHtml(machineAssignmentSummary(state, row))}</div>` },
    { label: "计划开始", render: (row) => escapeHtml(formatDate(row.startDate)) },
    { label: "交期", render: (row) => escapeHtml(formatDate(row.dueDate)) },
    { label: "优先级", render: (row) => `<span class="priority-pill ${priorityClass(row.priority)}">${escapeHtml(priorityLabel(row.priority))}</span>` },
    { label: "状态", render: (row) => badge(row.status) },
    {
      label: "入库状态",
      render: (row) => productionStockStatus(row),
    },
    {
      label: "进度",
      render: (row) => `
        <div class="inline-progress">
          <span style="width: ${Math.max(0, Math.min(100, Number(row.progress || 0)))}%"></span>
        </div>
        <div class="small">${formatNumber(row.progress)}%</div>
      `,
    },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="production-view" data-id="${escapeHtml(row.id)}">查看</button>
          ${editable ? `<button class="btn mini" type="button" data-action="production-edit" data-id="${escapeHtml(row.id)}">编辑</button>` : ""}
          ${editable && canStockIn(row) ? `<button class="btn mini primary" type="button" data-action="production-stock-in" data-id="${escapeHtml(row.id)}">转库存</button>` : ""}
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="production-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  return `
    <div class="page-stack">
      <section class="metric-grid four">
        ${renderMetricCard("待排产工单", pendingPlans, "较昨日 +2", "calendar", "blue")}
        ${renderMetricCard("生产中", runningPlans, "较昨日 -1", "monitor", "blue")}
        ${renderMetricCard("已完成今日", completedPlans, "较昨日 +3", "check", "green")}
        ${renderMetricCard("延期工单", overduePlans, "较昨日 +1", "warning", "red")}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>生产计划列表</h3>
            <p>先查看待排产和进行中的计划，再从列表进入查看、编辑、删除或新增计划。</p>
          </div>
          <div class="module-header-actions">
            <div class="module-stat">
              <span>在制计划</span>
              <strong>${formatNumber(pendingPlans)}</strong>
              <span>共 ${state.production.length} 条计划</span>
            </div>
            ${editable ? `
              <button class="btn primary" type="button" data-action="production-new">
                新增计划
              </button>
            ` : ""}
          </div>
        </div>
        <div class="view-tabs">
          <button class="${viewMode === "list" ? "active" : ""}" type="button" data-action="production-view-mode" data-mode="list">列表视图</button>
          <button class="${viewMode === "gantt" ? "active" : ""}" type="button" data-action="production-view-mode" data-mode="gantt">甘特图视图</button>
        </div>
        <div class="filter-bar compact">
          <label class="filter-field"><span>日期范围</span><input type="text" value="2026-06-01 ~ 2026-06-30" /></label>
          <label class="filter-field"><span>机台</span><select><option>全部机台</option>${state.machines.map((item) => `<option>${escapeHtml(item.name)}</option>`).join("")}</select></label>
          <label class="filter-field"><span>状态</span><select><option>全部状态</option><option>待排产</option><option>进行中</option><option>已完成</option></select></label>
          <label class="filter-field"><span>优先级</span><select><option>全部优先级</option><option>紧急</option><option>高</option><option>中</option><option>低</option></select></label>
          <label class="filter-field wide"><span>搜索</span><input type="search" placeholder="搜索工单号、产品型号..." /></label>
          <button class="btn ghost" type="button">重置</button>
          <button class="btn primary" type="button">筛选</button>
        </div>
        ${!editable ? `<div class="empty">当前账号没有生产计划维护权限，可查看排产数据。</div>` : ""}
        ${
          viewMode === "list"
            ? `<div class="production-view-content">${renderTable(columns, state.production, { pageKey: "production", ui: state.ui })}</div>`
            : `
          <div class="gantt-panel gantt-panel-wide">
            <div class="gantt-head">
              <button class="btn mini" type="button">今天</button>
              <strong>${escapeHtml(ganttWindow.label)}</strong>
              <div class="segmented-control"><span>日</span><span class="active">周</span><span>月</span></div>
            </div>
            ${renderGantt(state, ganttWindow)}
          </div>`
        }
      </section>

      ${selectedRecord ? renderProductionDetail(selectedRecord, state, editable) : ""}

      ${formOpen ? `
        <section class="panel" id="production-form-panel">
          <div class="panel-header">
            <div>
              <h3>${formTitle}</h3>
              <p>${draftInbound ? "已按来料单预填订单、品名、数量和交期，确认机台后即可保存计划。" : "维护订单、交期、机台和进度，保存后会同步刷新机台当前任务。"}</p>
            </div>
          </div>
          <form class="stack" data-form="production">
            <input type="hidden" name="id" value="${escapeHtml(values.id)}" />
            <input type="hidden" name="inventoryId" value="${escapeHtml(values.inventoryId)}" />
            <input type="hidden" name="stockedQty" value="${escapeHtml(values.stockedQty)}" />
            <input type="hidden" name="stockedAt" value="${escapeHtml(values.stockedAt)}" />
            <div class="field-grid">
              ${fields.map((field) => renderField(field, values[field.name])).join("")}
            </div>
            ${renderMachineAssignmentPicker(state, values)}
            <div class="form-actions">
              <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存计划"}</button>
              <button class="btn ghost" type="button" data-action="production-cancel">${formRecord ? "取消编辑" : "收起表单"}</button>
            </div>
          </form>
        </section>
      ` : ""}

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>产能负荷图</h3>
            <p>按机台展示当前利用率，后续可接真实工时和 OEE。</p>
          </div>
        </div>
        <div class="capacity-grid">
          ${state.machines.map((machine, index) => {
            const plan = state.production.find((item) => productionMachineIds(item).includes(machine.id) && item.status !== "已完成");
            const load = Math.max(10, Math.min(96, Number(plan?.progress || machine.progress || 0) + (index % 3) * 8));
            return `
              <div class="capacity-card ${load > 80 ? "hot" : machine.status === "待机" ? "idle" : ""}">
                <div class="capacity-head"><strong>${escapeHtml(machine.name.replace(/^(分选机|测试机)\s*/, ""))}</strong><span>${machine.status === "运行" ? "运行中" : machine.status}</span></div>
                <div class="capacity-value">${formatNumber(load)}%</div>
                <div class="mini-bars">
                  ${Array.from({ length: 18 }).map((_, barIndex) => `<span style="height:${18 + ((barIndex * 7 + load) % 42)}px"></span>`).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>可转生产的来料单</h3>
            <p>先提供一个轻量入口，把已录入的来料单快速带入生产计划。</p>
          </div>
        </div>
        <div class="mini-list">
          ${state.inbound.slice(0, 6).map((item) => `
            <div class="mini-item">
              <strong>${escapeHtml(item.orderNo || item.id)} · ${escapeHtml(item.productSpec || "-")}</strong>
              <div class="small">${escapeHtml(item.customerName || "-")} · ${formatNumber(item.orderQty || 0)} ${escapeHtml(item.unit || "")} · 交期 ${escapeHtml(formatDate(item.deliveryDate))}</div>
              ${editable ? `
                <div class="form-actions">
                  <button class="btn mini" type="button" data-action="production-from-inbound" data-id="${escapeHtml(item.id)}">生成计划</button>
                </div>
              ` : ""}
            </div>
          `).join("") || `<div class="empty">暂无可用来料单</div>`}
        </div>
      </section>
    </div>
  `;
}

function priorityLabel(value) {
  if (value === "加急") return "紧急";
  if (value === "标准") return "中";
  if (value === "普通") return "低";
  return value || "中";
}

function priorityClass(value) {
  const label = priorityLabel(value);
  if (label === "紧急") return "urgent";
  if (label === "高") return "high";
  if (label === "中") return "medium";
  return "low";
}

function canStockIn(plan) {
  return !plan.inventoryId && plan.status === "已完成" && Number(plan.progress || 0) >= 100;
}

function productionStockStatus(plan) {
  if (plan.inventoryId) {
    return `${badge("已入库")}<div class="small">${escapeHtml(plan.stockedAt || "")} · ${formatNumber(plan.stockedQty || plan.qty || 0)} ${escapeHtml(plan.unit || "K")}</div>`;
  }
  if (canStockIn(plan)) return badge("待入库");
  return `<span class="badge neutral">未完成</span>`;
}

function machineTypeCounts(state, planOrIds) {
  const ids = Array.isArray(planOrIds) ? planOrIds : productionMachineIds(planOrIds);
  const machines = ids.map((id) => state.machines.find((machine) => machine.id === id)).filter(Boolean);
  return {
    total: machines.length,
    sorter: machines.filter((machine) => machine.type === "分选机").length,
    tester: machines.filter((machine) => machine.type === "测试机").length,
  };
}

function machineAssignmentSummary(state, planOrIds) {
  const counts = machineTypeCounts(state, planOrIds);
  if (!counts.total) return "未分配机台";
  return `${counts.total} 台：分选机 ${counts.sorter} 台 / 测试机 ${counts.tester} 台`;
}

function machineAssignmentNames(state, planOrIds) {
  const ids = Array.isArray(planOrIds) ? planOrIds : productionMachineIds(planOrIds);
  const names = ids.map((id) => getMachineName(state, id)).filter((name) => name && name !== "未指定");
  if (!names.length) return "未分配";
  if (names.length <= 8) return names.join("、");
  return `${names.slice(0, 8).join("、")} 等 ${names.length} 台`;
}

function renderMachineAssignmentPicker(state, values) {
  const selectedIds = new Set(values.machineIds || []);
  const plans = state.production || [];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const sorters = state.machines.filter((machine) => machine.type === "分选机");
  const testers = state.machines.filter((machine) => machine.type === "测试机");
  const counts = machineTypeCounts(state, [...selectedIds]);
  const activeType = counts.tester > 0 && counts.sorter === 0 ? "测试机" : "分选机";

  return `
    <section class="assignment-panel" data-active-machine-pool="${escapeHtml(activeType)}">
      <div class="assignment-head">
        <div>
          <h4>生产资源分配</h4>
          <p>先选择机台大类，再在该大类下多选机台；一个生产组可以同时包含多台测试机和多台分选机。</p>
        </div>
        <div class="assignment-summary">
          <strong>已选 ${formatNumber(counts.total)} 台</strong>
          <span>分选 ${formatNumber(counts.sorter)} / 测试 ${formatNumber(counts.tester)}</span>
        </div>
      </div>
      <div class="machine-pool-tabs" role="tablist" aria-label="机台大类">
        ${["分选机", "测试机"].map((type) => `
          <button class="btn mini ${activeType === type ? "primary" : ""}" type="button" data-action="machine-pool-type" data-type="${escapeHtml(type)}">
            ${escapeHtml(type)}
            <span>${formatNumber(type === "分选机" ? sorters.length : testers.length)} 台</span>
            <b>${formatNumber(type === "分选机" ? counts.sorter : counts.tester)} 已选</b>
          </button>
        `).join("")}
      </div>
      <div class="assignment-filter-bar">
        <label class="filter-field">
          <span>快速查找机台</span>
          <input type="search" data-machine-pool-filter="keyword" placeholder="机台编号、名称、区域、人员、任务、生产计划" />
        </label>
        <label class="filter-field compact">
          <span>状态</span>
          <select data-machine-pool-filter="status">
            <option value="">全部状态</option>
            ${["待机", "运行", "维护", "故障", "异常"].map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}
          </select>
        </label>
        <button class="btn ghost" type="button" data-action="machine-pool-filter-reset">重置</button>
      </div>
      <div class="assignment-single">
        ${renderMachinePool("分选机", sorters, selectedIds, planById, activeType)}
        ${renderMachinePool("测试机", testers, selectedIds, planById, activeType)}
      </div>
    </section>
  `;
}

function renderMachinePool(title, machines, selectedIds, planById = new Map(), activeType = "分选机") {
  const isLocked = (machine) => {
    if (selectedIds.has(machine.id) || !machine.assignedPlanId) return false;
    const plan = planById.get(machine.assignedPlanId);
    return Boolean(plan && plan.status !== "已完成");
  };
  const selectedMachines = machines.filter((machine) => selectedIds.has(machine.id));
  const idleMachines = machines.filter((machine) => !selectedIds.has(machine.id) && !isLocked(machine) && machine.status === "待机");
  const otherMachines = machines.filter((machine) => !selectedIds.has(machine.id) && !isLocked(machine) && machine.status !== "待机");
  const lockedMachines = machines.filter((machine) => isLocked(machine));
  const visibleMachines = [...selectedMachines, ...idleMachines, ...otherMachines, ...lockedMachines];
  return `
    <div class="machine-pool" data-machine-pool-type="${escapeHtml(title)}" ${activeType === title ? "" : "hidden"}>
      <div class="machine-pool-head">
        <strong>${escapeHtml(title)}</strong>
        <span>当前 <b data-machine-pool-visible>${formatNumber(machines.length)}</b> / ${formatNumber(machines.length)} 台，已选 <b data-machine-pool-selected>${formatNumber(selectedMachines.length)}</b> 台</span>
      </div>
      <div class="machine-pool-actions">
        <button class="btn mini" type="button" data-action="machine-pool-select-visible">勾选当前筛选</button>
        <button class="btn mini" type="button" data-action="machine-pool-clear">清空本组选择</button>
      </div>
      <div class="machine-check-list">
        ${
          visibleMachines.length
            ? visibleMachines.map((machine) => {
              const locked = isLocked(machine);
              const lockedPlan = locked ? planById.get(machine.assignedPlanId) : null;
              const meta = locked
                ? `已占用：${lockedPlan?.planNo || lockedPlan?.orderNo || "其他计划"}`
                : `${machine.area || "-"} · ${machine.status || "-"} · ${machine.job || "等待排产"}`;
              return `
              <label
                class="machine-check ${selectedIds.has(machine.id) ? "selected" : ""} ${locked ? "locked" : ""}"
                data-machine-option
                data-status="${escapeHtml(machine.status || "")}"
                data-keywords="${escapeHtml([machine.id, machine.type, machine.name, machine.area, machine.operator, machine.shift, machine.status, machine.job, lockedPlan?.planNo, lockedPlan?.orderNo, lockedPlan?.item].join(" ").toLowerCase())}"
              >
                <input type="checkbox" name="machineIds" value="${escapeHtml(machine.id)}" ${selectedIds.has(machine.id) ? "checked" : ""} ${locked ? "disabled" : ""} />
                <span>
                  <strong>${escapeHtml(machine.name)}</strong>
                  <small>${escapeHtml(meta)}</small>
                </span>
              </label>
            `;
            }).join("")
            : `<div class="empty compact">暂无可选${escapeHtml(title)}。</div>`
        }
      </div>
      <div class="small">支持全量机台内快速搜索；批量勾选前建议先按关键词或状态缩小范围。</div>
    </div>
  `;
}

function renderProductionDetail(plan, state, editable) {
  return `
    <section class="panel" id="production-detail-panel">
      <div class="panel-header">
        <div>
          <h3>生产计划详情</h3>
          <p>查看当前计划的排产、进度、入库和金额信息。</p>
        </div>
        <div class="module-header-actions">
          ${editable ? `<button class="btn mini" type="button" data-action="production-edit" data-id="${escapeHtml(plan.id)}">编辑计划</button>` : ""}
          ${editable && canStockIn(plan) ? `<button class="btn mini primary" type="button" data-action="production-stock-in" data-id="${escapeHtml(plan.id)}">转库存</button>` : ""}
        </div>
      </div>
      <div class="detail-grid">
        ${detailItem("计划号", plan.planNo)}
        ${detailItem("关联订单", plan.orderNo || "-")}
        ${detailItem("生产物料", plan.item)}
        ${detailItem("计划数量", `${formatNumber(plan.qty)} ${plan.unit || "K"}`)}
        ${detailItem("生产组", plan.machineGroup || "未命名生产组")}
        ${detailItem("机台资源", machineAssignmentSummary(state, plan))}
        ${detailItem("已选机台", machineAssignmentNames(state, plan))}
        ${detailItem("计划开始", formatDate(plan.startDate))}
        ${detailItem("交期", formatDate(plan.dueDate))}
        ${detailItem("优先级", priorityLabel(plan.priority))}
        ${detailItem("状态 / 进度", `${plan.status} · ${formatNumber(plan.progress)}%`)}
        ${detailItem("入库状态", plan.inventoryId ? `已入库 · ${plan.stockedAt || "-"} · ${formatNumber(plan.stockedQty || plan.qty)} ${plan.unit || "K"}` : canStockIn(plan) ? "待转库存" : "未完成")}
        ${detailItem("金额", plan.amount !== "" && plan.amount !== undefined ? formatCurrency(plan.amount) : "-")}
        ${detailItem("备注", plan.note || "-")}
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

function renderMetricCard(label, value, hint, iconName, tone) {
  return `
    <div class="metric-card ${tone}">
      <span class="module-icon ${tone === "red" ? "red" : tone}">${icon(iconName)}</span>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    </div>
  `;
}

function parseScheduleDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function createGanttWindow(state, selectedRecord) {
  const dates = state.production
    .flatMap((plan) => [parseScheduleDate(plan.startDate), parseScheduleDate(plan.dueDate)])
    .filter(Boolean);
  dates.sort((a, b) => a.getTime() - b.getTime());
  const anchor = parseScheduleDate(selectedRecord?.startDate) || dates[0] || new Date();
  const start = addDays(anchor, -1);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return {
    days,
    label: `${dateKey(days[0])} - ${dateKey(days[days.length - 1])}`,
  };
}

function scheduleColumn(schedule, value) {
  const date = parseScheduleDate(value);
  if (!date) return 0;
  const key = dateKey(date);
  const index = schedule.days.findIndex((day) => dateKey(day) === key);
  return index < 0 ? 0 : index;
}

function renderGantt(state, schedule) {
  const days = schedule.days;
  if (!state.production.length) return `<div class="empty">暂无生产计划。</div>`;
  return `
    <div class="gantt-grid">
      <div class="gantt-row gantt-labels">
        <span>工单号</span>
        ${days.map((day) => `<span>${escapeHtml(formatShortDate(day))}</span>`).join("")}
      </div>
      ${state.production.map((plan, index) => {
        const startDate = parseScheduleDate(plan.startDate) || parseScheduleDate(plan.dueDate) || days[0];
        const dueDate = parseScheduleDate(plan.dueDate) || startDate;
        const startIndex = Math.max(0, Math.min(6, scheduleColumn(schedule, dateKey(startDate))));
        const endIndex = Math.max(startIndex, Math.min(6, scheduleColumn(schedule, dateKey(dueDate))));
        const start = startIndex + 2;
        const width = Math.max(1, endIndex - startIndex + 1);
        const className = plan.status === "已完成" ? "done" : plan.status === "进行中" ? "active" : "pending";
        return `
          <div class="gantt-row">
            <span>${escapeHtml(plan.planNo)}</span>
            <div class="gantt-track" style="grid-column:${start} / span ${width}">
              <b class="${className}">${escapeHtml(plan.item)} (${formatNumber(plan.progress)}%)</b>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}
