import { badge } from "../ui/components.js";
import { escapeHtml, formatNumber } from "../lib/format.js";
import { MACHINE_TYPES } from "../data/seed.js";
import { getMachineName } from "../domain/actions.js";

function groupMachines(state) {
  const grouped = new Map();
  state.machines.forEach((machine) => {
    const key = machine.type || "其他机型";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(machine);
  });
  return grouped;
}

export function renderMachine(state) {
  const grouped = groupMachines(state);
  const orderedTypes = [...MACHINE_TYPES, ...[...grouped.keys()].filter((type) => !MACHINE_TYPES.includes(type))];
  const uniqueTypes = [...new Set(orderedTypes)];
  const runningMachines = state.machines.filter((item) => item.status === "运行").length;

  const machineGrid = uniqueTypes
    .map((type) => {
      const machines = grouped.get(type) || [];
      if (!machines.length) return "";
      return `
        <section class="machine-type-group">
          <div class="panel-header">
            <div>
              <h3>${escapeHtml(type)}</h3>
              <p>后续新增同类机型时，只要补到这里就能自动显示。</p>
            </div>
            <div class="small">共 ${machines.length} 台</div>
          </div>
          <div class="machine-grid">
            ${machines
              .map(
                (machine) => `
                  <div class="machine-card">
                    <div class="machine-head">
                      <div>
                        <div class="machine-name">${escapeHtml(machine.name)}</div>
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
                    <div class="machine-actions">
                      <button type="button" data-action="machine-status" data-machine="${escapeHtml(machine.id)}" data-status="运行">运行</button>
                      <button type="button" data-action="machine-status" data-machine="${escapeHtml(machine.id)}" data-status="待机">待机</button>
                      <button type="button" data-action="machine-status" data-machine="${escapeHtml(machine.id)}" data-status="维护">维护</button>
                      <button type="button" data-action="machine-step" data-machine="${escapeHtml(machine.id)}" data-step="10">+10%</button>
                      <button type="button" data-action="machine-step" data-machine="${escapeHtml(machine.id)}" data-step="-10">-10%</button>
                      <button type="button" data-action="machine-complete" data-machine="${escapeHtml(machine.id)}">完成</button>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  const activePlans = state.production.filter((item) => item.status === "进行中");

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>机台看板</h3>
            <p>这里按分选机和测试机分组展示。后面如果增加新机型，直接往数据里加类型即可。</p>
          </div>
          <div class="module-stat">
            <span>运行机台</span>
            <strong>${formatNumber(runningMachines)}</strong>
            <span>共 ${state.machines.length} 台设备</span>
          </div>
        </div>
        ${machineGrid}
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
                        <div class="small">${escapeHtml(plan.item)} · ${escapeHtml(getMachineName(state, plan.machineId))} · ${formatNumber(plan.progress)}%</div>
                      </div>
                    `,
                  )
                  .join("")
              : '<div class="empty">当前没有进行中的生产计划。</div>'
          }
          <div class="mini-item">
            <strong>状态说明</strong>
            <div class="small">${[badge("运行"), badge("待机"), badge("维护")].join(" ")}</div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="small">设备保养、停机原因、工位节拍、产线 OEE、异常通知</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
