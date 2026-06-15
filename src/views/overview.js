import { badge } from "../ui/components.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";

export function renderOverview(state) {
  const flowItems = [
    { step: "01", title: "来料录入", count: state.inbound.length },
    { step: "02", title: "检验/排产", count: state.inbound.filter((item) => (item.processes || []).length).length },
    { step: "03", title: "库存管理", count: state.inventory.length },
    { step: "04", title: "生产计划", count: state.production.length },
    { step: "05", title: "机台执行", count: state.machines.filter((item) => item.status === "运行").length },
    {
      step: "06",
      title: "出库/财务",
      count: state.outbound.length + state.finance.filter((item) => item.status !== "已收").length,
    },
  ];

  const recent = [
    ...state.inbound.slice(0, 2).map((item) => ({
      date: item.orderDate || item.date,
      name: `来料 · ${item.productSpec || item.orderNo || "接单"}`,
      detail: `${item.customerName || "-"} · ${formatNumber(item.orderQty || item.qty || 0)}${item.unit || ""}`,
      status: (item.processes || [])[0] || "已录入",
    })),
    ...state.outbound.slice(0, 2).map((item) => ({
      date: item.date,
      name: `出库 · ${item.item}`,
      detail: `${item.customer} · ${formatCurrency(item.amount)}`,
      status: item.settlement,
    })),
    ...state.production.slice(0, 2).map((item) => ({
      date: item.dueDate,
      name: `生产 · ${item.planNo}`,
      detail: `${item.item} · ${item.progress}%`,
      status: item.status,
    })),
  ].slice(0, 6);

  const roadmap = [
    { title: "供应商/客户档案", text: "把联系人、地址、信用和合作等级统一管理起来。", dot: "blue" },
    { title: "批次追溯与扫码", text: "从来料到成品都能按批次追踪，减少找货和追责成本。", dot: "teal" },
    { title: "质检与不良品", text: "支持抽检、返工、报废和原因记录。", dot: "amber" },
    { title: "盘点与差异分析", text: "定期盘点，自动比对账面与实物差异。", dot: "rose" },
    { title: "设备保养/故障工单", text: "机台保养计划、停机原因、维修闭环。", dot: "blue" },
    { title: "权限、审批、日志", text: "让录入、审核、出库、对账都留痕。", dot: "teal" },
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>业务流程总览</h3>
            <p>先把来料、库存、生产、机台、出库和财务串成一条线，后面再逐块加审批、扫码和报表。</p>
          </div>
          <div class="small">当前有 ${state.production.filter((item) => item.status !== "已完成").length} 个未完工计划</div>
        </div>
        <div class="flow">
          ${flowItems
            .map(
              (item) => `
                <div class="flow-item">
                  <div class="step">${escapeHtml(item.step)}</div>
                  <div class="title">${escapeHtml(item.title)}</div>
                  <div class="count">${formatNumber(item.count)}</div>
                </div>
              `,
            )
            .join("")}
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>节点</th>
                <th>说明</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              ${recent
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(formatDate(item.date))}</td>
                      <td>${escapeHtml(item.name)}</td>
                      <td>${escapeHtml(item.detail)}</td>
                      <td>${badge(item.status)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>建议补充的功能</h3>
            <p>这是一个比较适合工厂 ERP 的扩展顺序，后面可以按优先级逐步做。</p>
          </div>
        </div>
        <div class="roadmap">
          ${roadmap
            .map(
              (item) => `
                <div class="roadmap-item">
                  <span class="dot ${item.dot}"></span>
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <div class="small">${escapeHtml(item.text)}</div>
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;
}
