import { NAV_ITEMS, getViewIcon } from "./data/navigation.js";
import { ROLE_LABELS } from "./data/seed.js";
import {
  canEdit,
  clearUi,
  getAuth,
  getCurrentUser,
  getState,
  login,
  logout,
  mutateState,
  restoreSeed,
  setActive,
  setUi,
} from "./lib/state.js";
import { icon } from "./lib/icons.js";
import { escapeHtml, formatCurrency, formatNumber, sum, timestampNow } from "./lib/format.js";
import {
  createFinance,
  createInbound,
  createInventory,
  createOutbound,
  createProduction,
  deleteInbound,
  deleteInventory,
  deleteOutbound,
  updateMachine,
} from "./domain/actions.js";
import { renderOverview } from "./views/overview.js";
import { renderInbound } from "./views/inbound.js";
import { renderInventory } from "./views/inventory.js";
import { renderOutbound } from "./views/outbound.js";
import { renderProduction } from "./views/production.js";
import { renderMachine } from "./views/machine.js";
import { renderFinance } from "./views/finance.js";
import { renderRoadmap } from "./views/roadmap.js";

const elements = {
  nav: document.getElementById("nav"),
  auth: document.getElementById("auth-bar"),
  title: document.getElementById("page-title"),
  desc: document.getElementById("page-desc"),
  kpis: document.getElementById("kpi-grid"),
  main: document.getElementById("main-content"),
};

const FORM_RESOURCE = {
  inbound: "inbound",
  inventory: "inventory",
  outbound: "outbound",
  production: "production",
  finance: "finance",
};

function currentNav(state) {
  return NAV_ITEMS.find((item) => item.key === state.active) || NAV_ITEMS[0];
}

function renderNav(state) {
  elements.nav.innerHTML = NAV_ITEMS.map(
    (item) => `
      <button class="nav-item ${state.active === item.key ? "active" : ""}" data-action="nav" data-view="${item.key}" type="button">
        <span class="icon">${icon(getViewIcon(item.key))}</span>
        <span>
          <div>${escapeHtml(item.label)}</div>
          <div class="small">${escapeHtml(item.desc)}</div>
        </span>
      </button>
    `,
  ).join("");
}

function renderAuthBar(auth, currentUser) {
  if (currentUser) {
    elements.auth.innerHTML = `
      <div class="auth-meta">
        <div class="auth-title">${escapeHtml(currentUser.name)} · ${escapeHtml(ROLE_LABELS[currentUser.role] || currentUser.role)}</div>
        <div class="auth-sub">当前账号：${escapeHtml(currentUser.username)}，${currentUser.role === "admin" ? "拥有全部操作权限" : "可查看、新增和编辑来料单"}</div>
      </div>
      <div class="auth-actions">
        <button class="btn ghost" data-action="logout" type="button">退出登录</button>
      </div>
    `;
    return;
  }

  elements.auth.innerHTML = `
    <div class="auth-meta">
      <div class="auth-title">登录账号</div>
      <div class="auth-sub">管理员：admin / admin123；录单人员：clerk / clerk123</div>
    </div>
    <form class="auth-actions login-form" data-form="login">
      <input name="username" type="text" placeholder="账号" autocomplete="username" required />
      <input name="password" type="password" placeholder="密码" autocomplete="current-password" required />
      <button class="btn primary" type="submit">登录</button>
      <button class="btn ghost" type="button" data-action="quick-login" data-username="admin" data-password="admin123">管理员</button>
      <button class="btn ghost" type="button" data-action="quick-login" data-username="clerk" data-password="clerk123">录单人员</button>
    </form>
  `;
}

function renderKpis(state) {
  const inboundQty = sum(state.inbound, (item) => item.orderQty || item.qty);
  const stockQty = sum(state.inventory, (item) => item.qty);
  const runningMachines = state.machines.filter((item) => item.status === "运行").length;
  const pendingPlans = state.production.filter((item) => item.status !== "已完成").length;
  const pendingReceivable = sum(state.finance, (item) => (item.type === "应收" && item.status !== "已收" ? item.amount : 0));
  const lowStock = state.inventory.filter((item) => item.qty <= item.safe).length;

  const items = [
    { label: "来料总量", value: formatNumber(inboundQty), hint: "近期开票批次合计" },
    { label: "当前库存", value: formatNumber(stockQty), hint: `${lowStock} 个物料低于安全库存` },
    { label: "在制计划", value: formatNumber(pendingPlans), hint: "排产中和待排产订单" },
    { label: "运行机台", value: formatNumber(runningMachines), hint: "在线设备状态" },
    { label: "待收账款", value: formatCurrency(pendingReceivable), hint: "出库后待回款金额" },
  ];

  elements.kpis.innerHTML = items
    .map(
      (item) => `
        <div class="kpi">
          <div class="label">${escapeHtml(item.label)}</div>
          <div class="value">${item.value}</div>
          <div class="hint">${escapeHtml(item.hint)}</div>
        </div>
      `,
    )
    .join("");
}

function renderMain(state) {
  const currentUser = getCurrentUser();
  elements.title.textContent = currentNav(state).label;
  elements.desc.textContent = currentNav(state).desc;

  try {
    switch (state.active) {
      case "overview":
        elements.main.innerHTML = renderOverview(state);
        break;
      case "inbound":
        elements.main.innerHTML = renderInbound(state, { currentUser });
        break;
      case "inventory":
        elements.main.innerHTML = renderInventory(state, { currentUser });
        break;
      case "outbound":
        elements.main.innerHTML = renderOutbound(state, { currentUser });
        break;
      case "production":
        elements.main.innerHTML = renderProduction(state);
        break;
      case "machine":
        elements.main.innerHTML = renderMachine(state);
        break;
      case "finance":
        elements.main.innerHTML = renderFinance(state);
        break;
      case "roadmap":
        elements.main.innerHTML = renderRoadmap(state);
        break;
      default:
        elements.main.innerHTML = renderOverview(state);
        break;
    }
  } catch (error) {
    console.error(error);
    elements.main.innerHTML = `
      <div class="empty">
        当前页面渲染失败：${escapeHtml(error?.message || error)}
      </div>
    `;
  }
}

function paintIcons() {
  document.querySelectorAll("[data-icon]").forEach((holder) => {
    holder.innerHTML = icon(holder.getAttribute("data-icon"));
  });
}

function render() {
  const state = getState();
  const auth = getAuth();
  const currentUser = getCurrentUser();
  renderAuthBar(auth, currentUser);
  renderNav(state);
  renderKpis(state);
  renderMain(state);
  paintIcons();
  window.__kunheBooted = true;
}

function listText(value) {
  if (Array.isArray(value)) return value.join("、");
  return value ?? "";
}

function excelText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function excelSheetName(name) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function excelCell(value, style = "") {
  const normalized = listText(value);
  const type = typeof normalized === "number" && Number.isFinite(normalized) ? "Number" : "String";
  const styleAttr = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${styleAttr}><Data ss:Type="${type}">${excelText(normalized)}</Data></Cell>`;
}

function excelRow(values, style = "") {
  return `<Row>${values.map((value) => excelCell(value, style)).join("")}</Row>`;
}

function excelWorksheet(name, columns, rows) {
  const header = excelRow(columns.map((column) => column.label), "Header");
  const body = rows
    .map((row) => excelRow(columns.map((column) => column.value(row))))
    .join("");

  return `
    <Worksheet ss:Name="${excelText(excelSheetName(name))}">
      <Table>
        ${columns.map(() => '<Column ss:AutoFitWidth="1" ss:Width="110"/>').join("")}
        ${header}
        ${body}
      </Table>
    </Worksheet>
  `;
}

function buildExcelWorkbook(state) {
  const sheets = [
    {
      name: "来料录入",
      rows: state.inbound,
      columns: [
        { label: "客户名称", value: (row) => row.customerName },
        { label: "来料日期", value: (row) => row.orderDate || row.date },
        { label: "订单编号", value: (row) => row.orderNo },
        { label: "品名/规格", value: (row) => row.productSpec },
        { label: "订单数量", value: (row) => row.orderQty },
        { label: "单位", value: (row) => row.unit },
        { label: "单价", value: (row) => row.unitPrice },
        { label: "金额", value: (row) => row.amount },
        { label: "交货日期", value: (row) => row.deliveryDate },
        { label: "加工方式", value: (row) => row.processes },
        { label: "形状要求", value: (row) => row.shapes },
        { label: "Bin选择", value: (row) => row.binOptions },
        { label: "电极卡控", value: (row) => row.electrodeOptions },
        { label: "标签格式", value: (row) => row.labelFormats },
        { label: "标签尺寸", value: (row) => row.labelSizes },
        { label: "贴标位置", value: (row) => row.labelPositions },
        { label: "不良处理", value: (row) => row.defectOptions },
        { label: "测试电流", value: (row) => row.testCurrent },
        { label: "VZ", value: (row) => row.vz },
        { label: "VF3", value: (row) => row.vf3 },
        { label: "IR", value: (row) => row.ir },
        { label: "测试标准档案", value: (row) => row.testStandardName },
        { label: "分选要求", value: (row) => row.sortingRequirement },
        { label: "备注", value: (row) => row.note },
        { label: "更新日期", value: (row) => row.updatedAt },
      ],
    },
    {
      name: "库存管理",
      rows: state.inventory,
      columns: [
        { label: "物料编码", value: (row) => row.code },
        { label: "物料名称", value: (row) => row.item },
        { label: "规格", value: (row) => row.spec },
        { label: "库位", value: (row) => row.location },
        { label: "数量", value: (row) => row.qty },
        { label: "占用", value: (row) => row.reserved },
        { label: "安全库存", value: (row) => row.safe },
        { label: "单位", value: (row) => row.unit },
        { label: "状态", value: (row) => row.status },
        { label: "成本", value: (row) => row.cost },
        { label: "最近更新", value: (row) => row.lastUpdate },
        { label: "备注", value: (row) => row.note },
      ],
    },
    {
      name: "出库记录",
      rows: state.outbound,
      columns: [
        { label: "日期", value: (row) => row.date },
        { label: "客户", value: (row) => row.customer },
        { label: "订单编号", value: (row) => row.orderNo },
        { label: "品名", value: (row) => row.item },
        { label: "规格", value: (row) => row.spec },
        { label: "数量", value: (row) => row.qty },
        { label: "单位", value: (row) => row.unit },
        { label: "单价", value: (row) => row.unitPrice },
        { label: "金额", value: (row) => row.amount },
        { label: "仓库/库位", value: (row) => row.warehouse },
        { label: "物流", value: (row) => row.logistics },
        { label: "结算状态", value: (row) => row.settlement },
        { label: "备注", value: (row) => row.note },
      ],
    },
    {
      name: "生产计划",
      rows: state.production,
      columns: [
        { label: "计划单号", value: (row) => row.planNo },
        { label: "订单编号", value: (row) => row.orderNo },
        { label: "品名", value: (row) => row.item },
        { label: "数量", value: (row) => row.qty },
        { label: "交期", value: (row) => row.dueDate },
        { label: "机台ID", value: (row) => row.machineId },
        { label: "优先级", value: (row) => row.priority },
        { label: "状态", value: (row) => row.status },
        { label: "进度", value: (row) => row.progress },
        { label: "备注", value: (row) => row.note },
      ],
    },
    {
      name: "机台看板",
      rows: state.machines,
      columns: [
        { label: "机台类型", value: (row) => row.type },
        { label: "机台名称", value: (row) => row.name },
        { label: "区域", value: (row) => row.area },
        { label: "状态", value: (row) => row.status },
        { label: "当前货/任务", value: (row) => row.job },
        { label: "操作员", value: (row) => row.operator },
        { label: "班次", value: (row) => row.shift },
        { label: "进度", value: (row) => row.progress },
        { label: "最近更新", value: (row) => row.updatedAt },
      ],
    },
    {
      name: "财务记录",
      rows: state.finance,
      columns: [
        { label: "日期", value: (row) => row.date },
        { label: "类型", value: (row) => row.type },
        { label: "来源", value: (row) => row.source },
        { label: "往来方", value: (row) => row.counterparty },
        { label: "金额", value: (row) => row.amount },
        { label: "状态", value: (row) => row.status },
        { label: "方式", value: (row) => row.method },
        { label: "备注", value: (row) => row.note },
      ],
    },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${sheets.map((sheet) => excelWorksheet(sheet.name, sheet.columns, sheet.rows)).join("")}
</Workbook>`;
}

function exportExcel() {
  const state = getState();
  const workbook = buildExcelWorkbook(state);
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `坤禾半导体ERP-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function newRecord() {
  const state = getState();
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("请先登录账号。");
    return;
  }
  const formViews = ["inbound", "inventory", "outbound", "production", "finance"];
  const currentTarget = formViews.includes(state.active) ? state.active : "inbound";
  const target = canEdit(currentUser, FORM_RESOURCE[currentTarget]) ? currentTarget : "inbound";
  setActive(target);
  render();
  document.querySelector(`form[data-form="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ensureCanEdit(resource) {
  const currentUser = getCurrentUser();
  if (canEdit(currentUser, resource)) return true;
  alert(currentUser ? "当前账号没有该操作权限。" : "请先登录账号。");
  return false;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.getAttribute("data-action");
  const state = getState();

  if (action === "nav") {
    setActive(button.getAttribute("data-view"));
    render();
    return;
  }

  if (action === "restore-seed") {
    restoreSeed();
    render();
    return;
  }

  if (action === "logout") {
    logout();
    render();
    return;
  }

  if (action === "quick-login") {
    const result = login(button.getAttribute("data-username"), button.getAttribute("data-password"));
    if (result.ok === false) alert(result.message || "登录失败");
    render();
    return;
  }

  if (action === "export-excel") {
    exportExcel();
    return;
  }

  if (action === "new-record") {
    newRecord();
    return;
  }

  if (action === "inbound-view") {
    setUi({
      inboundViewingId: button.getAttribute("data-id"),
      inboundEditingId: null,
    });
    render();
    return;
  }

  if (action === "inbound-edit") {
    if (!ensureCanEdit("inbound")) return;
    const id = button.getAttribute("data-id");
    setUi({
      inboundViewingId: id,
      inboundEditingId: id,
    });
    render();
    document.querySelector('form[data-form="inbound"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inbound-cancel") {
    clearUi(["inboundEditingId"]);
    render();
    return;
  }

  if (action === "inbound-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除来料单。");
      return;
    }
    if (button.getAttribute("data-confirmed") !== "true") {
      button.setAttribute("data-confirmed", "true");
      button.textContent = "确认删除";
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.removeAttribute("data-confirmed");
        button.textContent = "删除";
      }, 3000);
      return;
    }
    const result = mutateState((draft) => deleteInbound(draft, button.getAttribute("data-id")));
    if (result.ok === false) alert(result.message || "删除失败");
    render();
    return;
  }

  if (action === "inventory-view") {
    setUi({
      inventoryViewingId: button.getAttribute("data-id"),
      inventoryEditingId: null,
    });
    render();
    return;
  }

  if (action === "inventory-edit") {
    if (!ensureCanEdit("inventory")) return;
    const id = button.getAttribute("data-id");
    setUi({
      inventoryViewingId: id,
      inventoryEditingId: id,
    });
    render();
    document.querySelector('form[data-form="inventory"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inventory-cancel") {
    clearUi(["inventoryEditingId"]);
    render();
    return;
  }

  if (action === "inventory-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除库存记录。");
      return;
    }
    if (button.getAttribute("data-confirmed") !== "true") {
      button.setAttribute("data-confirmed", "true");
      button.textContent = "确认删除";
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.removeAttribute("data-confirmed");
        button.textContent = "删除";
      }, 3000);
      return;
    }
    const result = mutateState((draft) => deleteInventory(draft, button.getAttribute("data-id")));
    if (result.ok === false) alert(result.message || "删除失败");
    render();
    return;
  }

  if (action === "outbound-view") {
    setUi({
      outboundViewingId: button.getAttribute("data-id"),
      outboundEditingId: null,
    });
    render();
    return;
  }

  if (action === "outbound-edit") {
    if (!ensureCanEdit("outbound")) return;
    const id = button.getAttribute("data-id");
    setUi({
      outboundViewingId: id,
      outboundEditingId: id,
    });
    render();
    document.querySelector('form[data-form="outbound"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "outbound-cancel") {
    clearUi(["outboundEditingId"]);
    render();
    return;
  }

  if (action === "outbound-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除出库记录。");
      return;
    }
    if (button.getAttribute("data-confirmed") !== "true") {
      button.setAttribute("data-confirmed", "true");
      button.textContent = "确认删除";
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.removeAttribute("data-confirmed");
        button.textContent = "删除";
      }, 3000);
      return;
    }
    const result = mutateState((draft) => deleteOutbound(draft, button.getAttribute("data-id")));
    if (result.ok === false) alert(result.message || "删除失败");
    render();
    return;
  }

  if (action === "machine-status") {
    if (!ensureCanEdit("machine")) return;
    mutateState((draft) =>
      updateMachine(draft, button.getAttribute("data-machine"), {
        status: button.getAttribute("data-status"),
        updatedAt: timestampNow(),
        job:
          button.getAttribute("data-status") === "待机"
            ? "等待排产"
            : button.getAttribute("data-status") === "维护"
              ? "点检中"
              : draft.machines.find((item) => item.id === button.getAttribute("data-machine"))?.job || "生产中",
      }),
    );
    render();
    return;
  }

  if (action === "machine-step") {
    if (!ensureCanEdit("machine")) return;
    mutateState((draft) => {
      const machineId = button.getAttribute("data-machine");
      const machine = draft.machines.find((item) => item.id === machineId);
      if (!machine) return { ok: true };
      const step = Number(button.getAttribute("data-step").replace("%", ""));
      const progress = Math.max(0, Math.min(100, machine.progress + step));
      return updateMachine(draft, machineId, {
        progress,
        status: progress >= 100 ? "待机" : machine.status === "维护" ? "待机" : "运行",
        updatedAt: timestampNow(),
      });
    });
    render();
    return;
  }

  if (action === "machine-complete") {
    if (!ensureCanEdit("machine")) return;
    mutateState((draft) => updateMachine(draft, button.getAttribute("data-machine"), { progress: 100, status: "待机", updatedAt: timestampNow() }));
    render();
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  const formData = new FormData(form);
  const formKey = form.getAttribute("data-form");

  if (formKey === "login") {
    const result = login(formData.get("username"), formData.get("password"));
    if (result.ok === false) {
      alert(result.message || "登录失败");
      return;
    }
    render();
    return;
  }

  const resource = FORM_RESOURCE[formKey];
  if (resource && !ensureCanEdit(resource)) return;

  const result = mutateState((draft) => {
    if (formKey === "inbound") return createInbound(draft, formData);
    if (formKey === "inventory") return createInventory(draft, formData);
    if (formKey === "outbound") return createOutbound(draft, formData);
    if (formKey === "production") return createProduction(draft, formData);
    if (formKey === "finance") return createFinance(draft, formData);
    return { ok: true };
  });

  if (result.ok === false) {
    alert(result.message || "保存失败");
    return;
  }

  render();
});

render();
