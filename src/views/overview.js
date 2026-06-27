import { badge } from "../ui/components.js";
import { icon } from "../lib/icons.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";
import { getPendingInboundRecords } from "../domain/actions.js";

export function renderOverview(state) {
  const pendingInbound = getPendingInboundRecords(state);
  const pendingPlans = state.production.filter((item) => item.status !== "已完成");
  const flowItems = [
    { step: "待转生产", title: "来料录入", count: pendingInbound.length, icon: "inbox", tone: "blue" },
    { step: "销售/客户", title: "出库记录", count: state.outbound.length, icon: "truck", tone: "purple" },
    { step: "生产计划", title: "生产计划", count: state.production.length, icon: "calendar", tone: "orange" },
    { step: "财务执行", title: "财务记录", count: state.finance.length, icon: "landmark", tone: "blue" },
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
    { title: "供应商/客户档案", text: "统一管理供应商和客户信息，建立完整信用体系。", icon: "users" },
    { title: "批次追溯与扫码", text: "支持批次追溯和扫码管理，提升库存准确性。", icon: "boxes" },
    { title: "质检与不良品", text: "质检流程管理，支持不良品记录与分析。", icon: "warning" },
    { title: "盘点与差异分析", text: "定期盘点，自动对比账面与实物差异。", icon: "chart" },
    { title: "设备 OEE 分析", text: "设备效率分析，优化生产设备利用率。", icon: "monitor" },
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>业务数据总览</h3>
              <p>核心业务流程数据概览，按当前待办、已流转单据和财务记录汇总。</p>
          </div>
          <button class="btn ghost" type="button">今日</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>业务模块</th>
                <th>今日数据</th>
                <th>较昨日</th>
                <th>较上周</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              ${flowItems
                .map(
                  (item) => `
                    <tr>
                      <td>
                        <div class="module-cell">
                          <span class="module-icon ${escapeHtml(item.tone)}">${icon(item.icon)}</span>
                          <strong>${escapeHtml(item.title)}</strong>
                        </div>
                      </td>
                      <td><strong>${formatNumber(item.count)}</strong></td>
                      <td><span class="trend-flat">— 0%</span></td>
                      <td><span class="trend-flat">— 0%</span></td>
                      <td>${badge("正常")}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="overview-subgrid">
          <div class="overview-metric">
            <span class="module-icon blue">${icon("boxes")}</span>
            <div>
              <strong>${formatNumber(state.inventory.length)}</strong>
              <span>物料总数</span>
            </div>
          </div>
          <div class="overview-metric">
            <span class="module-icon green">${icon("boxes")}</span>
            <div>
              <strong>${formatNumber(state.inventory.reduce((total, item) => total + Number(item.qty || 0), 0))}</strong>
              <span>库存总数</span>
            </div>
          </div>
          <div class="overview-metric">
            <span class="module-icon orange">${icon("warning")}</span>
            <div>
              <strong>${formatNumber(state.inventory.filter((item) => item.qty <= item.safe).length)}</strong>
              <span>预警物料</span>
            </div>
          </div>
          <div class="overview-metric">
            <span class="module-icon blue">${icon("chart")}</span>
            <div>
              <strong>${formatNumber(pendingPlans.length)}</strong>
              <span>在制计划</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>建议补充的功能</h3>
            <p>这是一个比较适合工厂 ERP 的扩展顺序，后面可以按优先级逐步做。</p>
          </div>
        </div>
        <div class="roadmap recommended-list">
          ${roadmap
            .map(
              (item) => `
                <div class="roadmap-item">
                  <span class="module-icon blue">${icon(item.icon)}</span>
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <div class="small">${escapeHtml(item.text)}</div>
                  </div>
                  <span class="checkmark">${icon("check")}</span>
                </div>
              `,
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;
}
