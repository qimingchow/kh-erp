import { escapeHtml } from "../lib/format.js";

export function renderRoadmap() {
  const phases = [
    { title: "第一阶段：基础骨架", text: "完成来料、库存、出库、生产、机台、财务和权限的基本页面与数据流。", dot: "blue" },
    { title: "第二阶段：扫码与追溯", text: "加入二维码、批次、序列号、质检和流转记录。", dot: "teal" },
    { title: "第三阶段：审批与报表", text: "把出库、退货、盘点、付款等关键动作做成审批流。", dot: "amber" },
    { title: "第四阶段：车间和设备", text: "接入工位、停机、维护、Andon 和节拍统计。", dot: "rose" },
  ];

  const extras = [
    "供应商/客户档案",
    "条码扫码",
    "批次追溯",
    "来料质检",
    "盘点差异",
    "报废/返工",
    "设备保养",
    "工时统计",
    "权限审批",
    "报表中心",
    "消息提醒",
    "附件上传",
  ];

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>扩展路线</h3>
            <p>先把主流程跑通，再一点点往纵深加功能，会比一口气堆很多模块更稳。</p>
          </div>
        </div>
        <div class="roadmap">
          ${phases
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
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>建议补充的模块</h3>
            <p>这些都是比较符合工厂管理真实场景的后续扩展方向。</p>
          </div>
        </div>
        <div class="mini-list">
          ${extras
            .map(
              (item) => `
                <div class="mini-item">
                  <strong>${escapeHtml(item)}</strong>
                  <div class="small">可在后续版本单独拆成一个模块或流程节点。</div>
                </div>
              `,
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;
}
