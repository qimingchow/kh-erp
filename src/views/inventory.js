import { badge, renderForm, renderTable } from "../ui/components.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber } from "../lib/format.js";

export function renderInventory(state) {
  const fields = [
    { name: "code", label: "物料编码", placeholder: "例如：MAT-WF-005" },
    { name: "item", label: "物料名称", placeholder: "例如：晶圆" },
    { name: "spec", label: "规格", placeholder: "例如：8英寸 / Lot-A26" },
    { name: "location", label: "货位", placeholder: "例如：W1-05" },
    { name: "qty", label: "数量", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "reserved", label: "预留数量", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "safe", label: "安全库存", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "unit", label: "单位", placeholder: "片 / 卷 / 套 / 批" },
    {
      name: "status",
      label: "库存状态",
      type: "select",
      options: [
        { label: "正常", value: "正常" },
        { label: "低库存", value: "低库存" },
        { label: "冻结", value: "冻结" },
      ],
      defaultValue: "正常",
    },
    { name: "cost", label: "参考单价", type: "number", min: 0, step: 0.01, defaultValue: 0 },
    { name: "note", label: "备注", type: "textarea", full: true, required: false, placeholder: "补充说明" },
  ];

  const columns = [
    { label: "编码", render: (row) => escapeHtml(row.code) },
    { label: "物料", render: (row) => `${escapeHtml(row.item)}<div class="small">${escapeHtml(row.spec)}</div>` },
    { label: "货位", render: (row) => escapeHtml(row.location) },
    { label: "数量", render: (row) => `${formatNumber(row.qty)} ${escapeHtml(row.unit)}` },
    { label: "预留/安全", render: (row) => `${formatNumber(row.reserved)} / ${formatNumber(row.safe)}` },
    { label: "状态", render: (row) => badge(row.qty <= row.safe ? "低库存" : row.status) },
    { label: "成本", render: (row) => formatCurrency(row.cost) },
    { label: "更新", render: (row) => escapeHtml(formatDate(row.lastUpdate)) },
  ];

  const lowStockItems = state.inventory.filter((item) => item.qty <= item.safe).map((item) => item.item);

  return `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>库存管理</h3>
            <p>支持手动新增、调整和查看低库存预警。后续可以继续接条码、盘点和货位图。</p>
          </div>
          <div class="small">共 ${state.inventory.length} 条物料</div>
        </div>
        ${renderForm("inventory", fields, "保存库存")}
        ${renderTable(columns, state.inventory)}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h3>库存预警</h3>
            <p>这里先做最基础的安全库存提醒，后面可以扩展先进先出、批次和盘点差异。</p>
          </div>
        </div>
        <div class="mini-list">
          <div class="mini-item">
            <strong>低库存物料</strong>
            <div class="small">${lowStockItems.join("、") || "暂无"}</div>
          </div>
          <div class="mini-item">
            <strong>库存总量</strong>
            <div class="small">${formatNumber(state.inventory.reduce((total, item) => total + item.qty, 0))} 个单位</div>
          </div>
          <div class="mini-item">
            <strong>建议后续增加</strong>
            <div class="small">盘点单、差异单、库位地图、呆滞料、保质期提醒</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
