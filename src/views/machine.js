import { badge, renderTable } from "../ui/components.js";
import { icon } from "../lib/icons.js";
import { escapeHtml, formatNumber } from "../lib/format.js";
import { MACHINE_TYPES } from "../data/seed.js";
import { productionMachineIds } from "../domain/actions.js";
import { canEdit } from "../lib/state.js";

function groupMachines(machines) {
  const grouped = new Map();
  machines.forEach((machine) => {
    const key = machine.type || "其他机型";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(machine);
  });
  return grouped;
}

function buildPlanMachineIndex(plans = []) {
  const index = new Map();
  plans.forEach((plan) => {
    productionMachineIds(plan).forEach((machineId) => {
      if (!index.has(machineId)) index.set(machineId, []);
      index.get(machineId).push(plan);
    });
  });
  return index;
}

function getMachinePlan(planById, machine = {}, planByMachineId = new Map()) {
  const activePlan = planById.get(machine.assignedPlanId);
  if (activePlan) return activePlan;
  const relatedPlans = planByMachineId.get(machine.id) || [];
  return relatedPlans[relatedPlans.length - 1] || null;
}

function machineBelongsToPlan(machine, planId, planByMachineId = new Map()) {
  if (machine.assignedPlanId === planId) return true;
  return (planByMachineId.get(machine.id) || []).some((plan) => plan.id === planId);
}

function machinePlanLabel(plan) {
  if (!plan) return "未绑定计划";
  return `${plan.planNo || plan.orderNo || "未编号计划"} · ${plan.item || "生产任务"}`;
}

function machineResourceSummary(state, plan = {}) {
  const machines = productionMachineIds(plan).map((id) => state.machines.find((machine) => machine.id === id)).filter(Boolean);
  const sorters = machines.filter((machine) => machine.type === "分选机").length;
  const testers = machines.filter((machine) => machine.type === "测试机").length;
  return machines.length ? `${machines.length} 台，分选 ${sorters} / 测试 ${testers}` : "未分配机台";
}

function matchesMachineFilters(machine, filters = {}, planById = new Map(), planByMachineId = new Map()) {
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  const type = String(filters.type || "");
  const status = String(filters.status || "");
  const planId = String(filters.planId || "");
  const plan = getMachinePlan(planById, machine, planByMachineId);
  const relatedPlans = planByMachineId.get(machine.id) || [];
  const haystack = [
    machine.id,
    machine.type,
    machine.name,
    machine.area,
    machine.status,
    machine.job,
    machine.operator,
    machine.shift,
    plan?.planNo,
    plan?.orderNo,
    plan?.item,
    ...relatedPlans.flatMap((item) => [item.planNo, item.orderNo, item.item, item.status]),
  ]
    .join(" ")
    .toLowerCase();

  if (keyword && !haystack.includes(keyword)) return false;
  if (type && machine.type !== type) return false;
  if (status && machine.status !== status) return false;
  if (planId === "__unassigned__" && machine.assignedPlanId) return false;
  if (planId && planId !== "__unassigned__" && !machineBelongsToPlan(machine, planId, planByMachineId)) return false;
  return true;
}

export function renderMachine(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "machine");
  const filters = state.ui?.machineFilters || {};
  const planById = new Map((state.production || []).map((plan) => [plan.id, plan]));
  const planByMachineId = buildPlanMachineIndex(state.production || []);
  const filteredMachines = state.machines.filter((machine) => matchesMachineFilters(machine, filters, planById, planByMachineId));
  const previewMachines = filteredMachines.slice(0, 24);
  const grouped = groupMachines(previewMachines);
  const orderedTypes = [...MACHINE_TYPES, ...[...grouped.keys()].filter((type) => !MACHINE_TYPES.includes(type))];
  const uniqueTypes = [...new Set(orderedTypes)];
  const runningMachines = filteredMachines.filter((item) => item.status === "运行").length;
  const standbyMachines = filteredMachines.filter((item) => item.status === "待机").length;
  const maintenanceMachines = filteredMachines.filter((item) => item.status === "维护").length;
  const errorMachines = filteredMachines.filter((item) => item.status === "故障" || item.status === "异常").length;
  const statusTotal = filteredMachines.length || 0;
  const planOptions = state.production || [];
  const statusClass = (status) => {
    if (status === "运行") return "running";
    if (status === "待机") return "standby";
    if (status === "维护") return "maintenance";
    return "error";
  };

  const machineGrid = uniqueTypes
    .map((type) => {
      const machines = grouped.get(type) || [];
      if (!machines.length) return "";
      return `
        <section class="machine-type-group">
          <div class="panel-header">
            <div>
              <h3>${escapeHtml(type)}</h3>
              <p>当前筛选范围内的${escapeHtml(type)}，较多时可继续按状态、区域、操作员或任务搜索。</p>
            </div>
            <div class="small">共 ${machines.length} 台</div>
          </div>
          <div class="machine-grid">
            ${machines
              .map(
                (machine) => `
                  <div class="machine-card ${statusClass(machine.status)}">
                    <div class="machine-head">
                      <div>
                        <div class="machine-name"><span class="status-dot ${statusClass(machine.status)}"></span>${escapeHtml(machine.name)}</div>
                        <div class="machine-sub">${escapeHtml(machine.area)} · ${escapeHtml(machine.operator)} · ${escapeHtml(machine.shift)}</div>
                      </div>
                      <div>${badge(machine.status)}</div>
                    </div>
                    <div>
                      <div class="small">${escapeHtml(machine.job)}</div>
                      <div class="progress" aria-label="机台进度">
                        <span style="width: ${Math.max(0, Math.min(100, machine.progress))}%"></span>
                      </div>
                      <div class="small" style="margin-top: 6px;">进度 ${formatNumber(machine.progress)}% · 最近更新 ${escapeHtml(machine.updatedAt)}</div>
                    </div>
                    ${editable ? `
                      <div class="machine-actions">
                        <button type="button" data-action="machine-status" data-machine="${escapeHtml(machine.id)}" data-status="运行">运行</button>
                        <button type="button" data-action="machine-status" data-machine="${escapeHtml(machine.id)}" data-status="待机">待机</button>
                        <button type="button" data-action="machine-status" data-machine="${escapeHtml(machine.id)}" data-status="维护">维护</button>
                        <button type="button" data-action="machine-step" data-machine="${escapeHtml(machine.id)}" data-step="10">+10%</button>
                        <button type="button" data-action="machine-step" data-machine="${escapeHtml(machine.id)}" data-step="-10">-10%</button>
                        <button type="button" data-action="machine-delete" data-machine="${escapeHtml(machine.id)}">删除</button>
                      </div>
                    ` : ""}
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  const machineColumns = [
    {
      label: "机台",
      render: (row) => `
        <strong>${escapeHtml(row.name)}</strong>
        <div class="small">${escapeHtml(row.id)} · ${escapeHtml(row.type || "-")}</div>
      `,
    },
    { label: "生产计划", render: (row) => escapeHtml(machinePlanLabel(getMachinePlan(planById, row, planByMachineId))) },
    { label: "区域 / 班次", render: (row) => `${escapeHtml(row.area || "-")}<div class="small">${escapeHtml(row.operator || "-")} · ${escapeHtml(row.shift || "-")}</div>` },
    { label: "状态", render: (row) => badge(row.status) },
    { label: "当前任务", render: (row) => escapeHtml(row.job || "等待排产") },
    {
      label: "进度",
      render: (row) => `
        <div class="inline-progress"><span style="width:${Math.max(0, Math.min(100, Number(row.progress || 0)))}%"></span></div>
        <div class="small">${formatNumber(row.progress)}% · ${escapeHtml(row.updatedAt || "-")}</div>
      `,
    },
    {
      label: "操作",
      render: (row) =>
        editable
          ? `
            <div class="row-actions">
              <button class="btn mini" type="button" data-action="machine-status" data-machine="${escapeHtml(row.id)}" data-status="运行">运行</button>
              <button class="btn mini" type="button" data-action="machine-status" data-machine="${escapeHtml(row.id)}" data-status="待机">待机</button>
              <button class="btn mini" type="button" data-action="machine-status" data-machine="${escapeHtml(row.id)}" data-status="维护">维护</button>
              <button class="btn mini danger" type="button" data-action="machine-delete" data-machine="${escapeHtml(row.id)}">删除</button>
            </div>
          `
          : `<span class="small">只读</span>`,
    },
  ];

  const activePlans = state.production.filter((item) => item.status !== "已完成" && productionMachineIds(item).length);

  return `
    <div class="page-stack machine-page">
      <section class="panel machine-main-panel">
        <div class="panel-header machine-panel-header">
          <div>
            <h3>机台看板</h3>
            <p>按分选机和测试机管理设备，支持批量导入、导出、模板维护和快速查找。</p>
          </div>
          <div class="module-header-actions machine-header-actions">
            <button class="btn" type="button" data-action="machine-export"><span class="icon">${icon("download")}</span>导出机台</button>
            <button class="btn" type="button" data-action="machine-template"><span class="icon">${icon("download")}</span>下载模板</button>
            ${
              editable
                ? `
                  <label class="btn primary file-action" for="machine-import-file">
                    <span class="icon">${icon("upload")}</span>导入机台
                  </label>
                  <input class="file-input" id="machine-import-file" type="file" accept=".csv,.txt" data-machine-import />
                `
                : ""
            }
          </div>
        </div>
        <div class="machine-control-card">
            <div class="module-stat">
              <span>运行机台</span>
              <strong>${formatNumber(runningMachines)}</strong>
              <span>筛选 ${formatNumber(filteredMachines.length)} / 共 ${formatNumber(state.machines.length)} 台</span>
            </div>
          <div class="filter-bar compact machine-filter-bar">
            <label class="filter-field">
              <span>快速查找</span>
              <input type="search" data-machine-filter="keyword" placeholder="机台编号、名称、计划号、区域、人员、任务" value="${escapeHtml(filters.keyword || "")}" />
            </label>
            <label class="filter-field">
              <span>机台类型</span>
              <select data-machine-filter="type">
                <option value="">全部类型</option>
                ${MACHINE_TYPES.map((type) => `<option value="${escapeHtml(type)}" ${filters.type === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
              </select>
            </label>
            <label class="filter-field">
              <span>状态</span>
              <select data-machine-filter="status">
                <option value="">全部状态</option>
                ${["运行", "待机", "维护", "故障"].map((status) => `<option value="${escapeHtml(status)}" ${filters.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
              </select>
            </label>
            <label class="filter-field">
              <span>生产计划</span>
              <select data-machine-filter="planId">
                <option value="">全部计划</option>
                <option value="__unassigned__" ${filters.planId === "__unassigned__" ? "selected" : ""}>未绑定计划</option>
                ${planOptions.map((plan) => `<option value="${escapeHtml(plan.id)}" ${filters.planId === plan.id ? "selected" : ""}>${escapeHtml(machinePlanLabel(plan))}</option>`).join("")}
              </select>
            </label>
            <button class="btn ghost" type="button" data-action="machine-filter-reset">重置</button>
          </div>
        </div>
        <div class="machine-plan-strip">
          <button class="${!filters.planId ? "active" : ""}" type="button" data-action="machine-plan-filter" data-plan-id="">全部计划</button>
          <button class="${filters.planId === "__unassigned__" ? "active" : ""}" type="button" data-action="machine-plan-filter" data-plan-id="__unassigned__">未绑定计划</button>
          ${planOptions.slice(0, 8).map((plan) => `
            <button class="${filters.planId === plan.id ? "active" : ""}" type="button" data-action="machine-plan-filter" data-plan-id="${escapeHtml(plan.id)}">${escapeHtml(plan.planNo || plan.orderNo || "未编号计划")}</button>
          `).join("")}
        </div>
        <div class="machine-status-grid">
          <div class="machine-status-card running">
            <span class="machine-status-icon">${icon("play")}</span>
            <div>
              <span>运行中机台</span>
              <strong>${formatNumber(runningMachines)} 台</strong>
              <small>占比 ${statusTotal ? Math.round((runningMachines / statusTotal) * 100) : 0}%</small>
            </div>
          </div>
          <div class="machine-status-card standby">
            <span class="machine-status-icon">${icon("pause")}</span>
            <div>
              <span>待机中机台</span>
              <strong>${formatNumber(standbyMachines)} 台</strong>
              <small>占比 ${statusTotal ? Math.round((standbyMachines / statusTotal) * 100) : 0}%</small>
            </div>
          </div>
          <div class="machine-status-card maintenance">
            <span class="machine-status-icon">${icon("tool")}</span>
            <div>
              <span>维护中机台</span>
              <strong>${formatNumber(maintenanceMachines)} 台</strong>
              <small>占比 ${statusTotal ? Math.round((maintenanceMachines / statusTotal) * 100) : 0}%</small>
            </div>
          </div>
          <div class="machine-status-card error">
            <span class="machine-status-icon">${icon("warning")}</span>
            <div>
              <span>故障机台</span>
              <strong>${formatNumber(errorMachines)} 台</strong>
              <small>占比 ${statusTotal ? Math.round((errorMachines / statusTotal) * 100) : 0}%</small>
            </div>
          </div>
        </div>
        <section class="machine-list-panel">
          <div class="panel-header">
            <div>
              <h3>机台列表</h3>
              <p>机台数量较多时以列表为主，可按类型、状态、生产计划和关键词快速定位。</p>
            </div>
            <div class="small">共 ${formatNumber(filteredMachines.length)} 台</div>
          </div>
          ${renderTable(machineColumns, filteredMachines, { pageKey: "machine", ui: state.ui, pageSize: 20 })}
        </section>
        <details class="machine-card-preview">
          <summary>查看卡片预览</summary>
        ${
          machineGrid ||
          `<div class="empty">没有找到匹配的机台。可以重置筛选，或按模板批量导入分选机、测试机信息。</div>`
        }
        </details>
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>当前生产中的货</h3>
            <p>把机台和工单关系单独抽出来，车间现场会非常好用。</p>
          </div>
        </div>
        <div class="mini-list">
          ${
            activePlans.length
              ? activePlans
                  .map(
                    (plan) => `
                      <div class="mini-item">
                        <strong>${escapeHtml(plan.planNo)}</strong>
                        <div class="small">${escapeHtml(plan.item)} · ${escapeHtml(machineResourceSummary(state, plan))} · ${formatNumber(plan.progress)}%</div>
                      </div>
                    `,
                  )
                  .join("")
              : '<div class="empty">当前没有进行中的生产计划。</div>'
          }
          <div class="mini-item">
            <strong>状态说明</strong>
            <div class="status-legend">
              <span><i class="status-dot running"></i>运行中 设备正在正常运行并生产</span>
              <span><i class="status-dot standby"></i>待机中 设备处于空闲状态</span>
              <span><i class="status-dot maintenance"></i>维护中 设备正在维护或保养中</span>
              <span><i class="status-dot error"></i>故障 设备发生故障需立即处理</span>
            </div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="suggestion-list">
              <div><strong>分选机 S-02</strong><span>预防性维护 · 计划中</span></div>
              <div><strong>测试机 T-02</strong><span>良率波动 · 建议检查参数</span></div>
              <div><strong>分选机 S-01</strong><span>运行正常 · 产能达成率稳定</span></div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
