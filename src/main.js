import { NAV_ITEMS, getViewIcon } from "./data/navigation.js";
import { RESOURCE_LABELS, ROLE_LABELS } from "./data/seed.js";
import {
  canEdit,
  clearUi,
  applyServerBootstrap,
  deleteUserLocal,
  getAuth,
  getAuthToken,
  getCurrentUser,
  getState,
  saveUserLocal,
  login,
  logout,
  mutateState,
  restoreSeed,
  setActive,
  setUi,
} from "./lib/state.js";
import { icon } from "./lib/icons.js";
import { escapeHtml, formatCompactCurrency, formatCompactNumber, formatCurrency, formatNumber, sum, timestampNow } from "./lib/format.js";
import {
  createFinance,
  createInbound,
  createInventory,
  createOutbound,
  createProduction,
  deleteProduction,
  deleteInbound,
  deleteInventory,
  deleteOutbound,
  deleteFinance,
  deleteMachine,
  getPendingInboundRecords,
  updateMachine,
  importMachines,
  productionToInventory,
  financeRecordFromForm,
  inboundRecordFromForm,
  inventoryRecordFromForm,
  productionRecordFromForm,
} from "./domain/actions.js";
import {
  bootstrap,
  deleteInboundRemote,
  deleteInventoryRemote,
  deleteOutboundRemote,
  deleteProductionRemote,
  deleteFinanceRemote,
  deleteMachineRemote,
  deleteUserRemote,
  isServerMode,
  loginRemote,
  logoutRemote,
  resetRemote,
  saveInboundRemote,
  saveInventoryRemote,
  saveOutboundRemote,
  saveProductionRemote,
  saveFinanceRemote,
  saveUserRemote,
  importMachinesRemote,
  stockInProductionRemote,
  updateMachineRemote,
} from "./lib/api.js";
import { renderOverview } from "./views/overview.js";
import { renderInbound } from "./views/inbound.js";
import { renderInventory } from "./views/inventory.js";
import { renderOutbound } from "./views/outbound.js";
import { renderProduction } from "./views/production.js";
import { renderMachine } from "./views/machine.js";
import { renderFinance } from "./views/finance.js";
import { renderUsers } from "./views/users.js";
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
  user: "users",
};

function currentNav(state) {
  return NAV_ITEMS.find((item) => item.key === state.active) || NAV_ITEMS[0];
}

function renderNav(state) {
  const currentUser = getCurrentUser();
  const items = NAV_ITEMS.filter((item) => item.key !== "users" || currentUser?.role === "admin");
  elements.nav.innerHTML = items.map(
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
      <button class="header-icon-btn" type="button" aria-label="折叠菜单">
        <span class="icon">${icon("menu")}</span>
      </button>
      <div class="auth-meta">
        <div class="auth-title">${escapeHtml(currentUser.name)} · ${escapeHtml(ROLE_LABELS[currentUser.role] || currentUser.role)}</div>
        <div class="auth-sub">当前账号：${escapeHtml(currentUser.username)}，${currentUser.role === "admin" ? "拥有全部操作权限" : `可编辑：${escapeHtml((currentUser.editableResources || ["inbound"]).map((item) => RESOURCE_LABELS[item] || item).join("、"))}`}</div>
      </div>
      <div class="auth-actions">
        <button class="header-icon-btn" type="button" aria-label="通知">
          <span class="icon">${icon("bell")}</span>
          <span class="notify-dot">3</span>
        </button>
        <button class="header-icon-btn" type="button" aria-label="帮助">
          <span class="icon">${icon("help")}</span>
        </button>
        <button class="header-icon-btn" type="button" aria-label="设置">
          <span class="icon">${icon("settings")}</span>
        </button>
        <div class="user-chip">
          <span>${escapeHtml((currentUser.name || currentUser.username || "KH").slice(0, 2).toUpperCase())}</span>
        </div>
        <button class="btn ghost" data-action="logout" type="button">退出登录</button>
      </div>
    `;
    return;
  }

  const localQuickButtons = isServerMode()
    ? ""
    : `
      <button class="btn ghost" type="button" data-action="quick-login" data-username="admin" data-password="admin123">管理员</button>
      <button class="btn ghost" type="button" data-action="quick-login" data-username="clerk" data-password="clerk123">录单人员</button>
    `;

  elements.auth.innerHTML = `
    <button class="header-icon-btn" type="button" aria-label="折叠菜单">
      <span class="icon">${icon("menu")}</span>
    </button>
    <div class="auth-meta">
      <div class="auth-title">登录账号</div>
      <div class="auth-sub">${isServerMode() ? "服务器模式已启用，数据将保存到后端。" : "当前为本地预览模式，数据只保存在浏览器。管理员：admin / admin123；录单人员：clerk / clerk123"}</div>
    </div>
    <form class="auth-actions login-form" data-form="login">
      <input name="username" type="text" placeholder="账号" autocomplete="username" required />
      <input name="password" type="password" placeholder="密码" autocomplete="current-password" required />
      <button class="btn primary" type="submit">登录</button>
      ${localQuickButtons}
    </form>
  `;
}

function renderKpis(state) {
  if (state.active !== "overview") {
    elements.kpis.hidden = true;
    elements.kpis.innerHTML = "";
    return;
  }

  elements.kpis.hidden = false;
  const pendingInbound = getPendingInboundRecords(state);
  const inboundQty = sum(pendingInbound, (item) => item.orderQty || item.qty);
  const stockQty = sum(state.inventory, (item) => item.qty);
  const runningMachines = state.machines.filter((item) => item.status === "运行").length;
  const pendingPlans = state.production.filter((item) => item.status !== "已完成").length;
  const knownFinanceOutbound = new Set((state.finance || []).filter((item) => item.outboundId).map((item) => item.outboundId));
  const knownFinanceSources = (state.finance || []).map((item) => String(item.source || ""));
  const financeRecords = [
    ...(state.finance || []),
    ...(state.outbound || [])
      .filter(
        (item) =>
          item.id &&
          !knownFinanceOutbound.has(item.id) &&
          !knownFinanceSources.some((source) => item.orderNo && source.includes(item.orderNo)),
      )
      .map((item) => ({
        type: "应收",
        amount: Number(item.amount || 0),
        paidAmount: Number(item.paidAmount || 0),
        status: item.settlement || "待收",
      })),
  ];
  const pendingReceivable = sum(financeRecords, (item) => {
    if (item.type !== "应收") return 0;
    const amount = Number(item.amount || 0);
    const paid =
      item.status === "已收"
        ? amount
        : item.status === "部分收款"
          ? Math.max(0, Math.min(amount, Number(item.paidAmount || 0)))
          : 0;
    return Math.max(0, amount - paid);
  });
  const receivedReceivable = sum(financeRecords, (item) => {
    const amount = Number(item.amount || 0);
    if (item.type === "收款") return amount;
    if (item.type !== "应收") return 0;
    if (item.status === "已收") return amount;
    if (item.status === "部分收款") return Math.max(0, Math.min(amount, Number(item.paidAmount || 0)));
    return Math.max(0, Math.min(amount, Number(item.paidAmount || 0)));
  });
  const lowStock = state.inventory.filter((item) => item.qty <= item.safe).length;

  const items = [
    { label: "待处理来料", value: formatCompactNumber(inboundQty), hint: `${formatNumber(pendingInbound.length)} 条未转生产`, icon: "inbox", tone: "blue" },
    { label: "当前库存", value: formatCompactNumber(stockQty), hint: `${lowStock} 个物料预警`, icon: "boxes", tone: "green" },
    { label: "在制计划", value: formatCompactNumber(pendingPlans), hint: "排产中和待排产", icon: "calendar", tone: "amber" },
    { label: "运行机台", value: formatNumber(runningMachines), hint: "在线设备状态", icon: "monitor", tone: "blue" },
    { label: "已收账款", value: formatCompactCurrency(receivedReceivable), hint: "实际已回款", icon: "check", tone: "green" },
    { label: "待收账款", value: formatCompactCurrency(pendingReceivable), hint: "出库后待回款", icon: "landmark", tone: "red" },
  ];

  elements.kpis.innerHTML = items
    .map(
      (item) => `
        <div class="kpi ${escapeHtml(item.tone)}">
          <div class="kpi-icon"><span class="icon">${icon(item.icon)}</span></div>
          <div>
            <div class="label">${escapeHtml(item.label)}</div>
            <div class="value">${item.value}</div>
            <div class="hint">${escapeHtml(item.hint)} <span>— 0%</span></div>
          </div>
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
        elements.main.innerHTML = renderProduction(state, { currentUser });
        break;
      case "machine":
        elements.main.innerHTML = renderMachine(state, { currentUser });
        break;
      case "finance":
        elements.main.innerHTML = renderFinance(state, { currentUser });
        break;
      case "users":
        elements.main.innerHTML = renderUsers(state, { currentUser, users: getAuth().users });
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

function syncInboundStandardSections(root = document) {
  const form = root.querySelector?.('form[data-form="inbound"]');
  if (!form) return;

  const selectedProcesses = new Set(
    Array.from(form.querySelectorAll('input[name="processes"]:checked')).map((item) => item.value),
  );
  const showTest = ["测试", "抽测出图", "测试出图"].some((item) => selectedProcesses.has(item));
  const showSorting = selectedProcesses.has("分选");
  const visibility = {
    test: showTest,
    sorting: showSorting,
  };

  form.querySelectorAll("[data-standard-section]").forEach((section) => {
    const key = section.getAttribute("data-standard-section");
    const visible = Boolean(visibility[key]);
    section.hidden = !visible;
    section.querySelectorAll("input, select, textarea, button").forEach((control) => {
      control.disabled = !visible;
    });
  });
}

function updateInboundFiltersFromDom() {
  const activeFilter = document.activeElement?.getAttribute?.("data-filter") || "";
  const activeSelectionStart =
    typeof document.activeElement?.selectionStart === "number" ? document.activeElement.selectionStart : null;
  setUi({
    inboundFilters: {
      customer: document.querySelector('[data-filter="inbound-customer"]')?.value || "",
      dateStart: document.querySelector('[data-filter="inbound-date-start"]')?.value || "",
      dateEnd: document.querySelector('[data-filter="inbound-date-end"]')?.value || "",
      status: document.querySelector('[data-filter="inbound-status"]')?.value || "",
      keyword: document.querySelector('[data-filter="inbound-keyword"]')?.value || "",
    },
    tablePages: { ...(getState().ui?.tablePages || {}), inbound: 1 },
  });
  render();
  if (!activeFilter) return;
  const nextActive = document.querySelector(`[data-filter="${CSS.escape(activeFilter)}"]`);
  nextActive?.focus();
  if (activeSelectionStart !== null && typeof nextActive?.setSelectionRange === "function") {
    nextActive.setSelectionRange(activeSelectionStart, activeSelectionStart);
  }
}

function updateMachineFiltersFromDom() {
  const activeFilter = document.activeElement?.getAttribute?.("data-machine-filter") || "";
  const activeSelectionStart =
    typeof document.activeElement?.selectionStart === "number" ? document.activeElement.selectionStart : null;
  setUi({
    machineFilters: {
      keyword: document.querySelector('[data-machine-filter="keyword"]')?.value || "",
      type: document.querySelector('[data-machine-filter="type"]')?.value || "",
      status: document.querySelector('[data-machine-filter="status"]')?.value || "",
      group: document.querySelector('[data-machine-filter="group"]')?.value || "",
    },
    tablePages: { ...(getState().ui?.tablePages || {}), machine: 1 },
  });
  render();
  if (!activeFilter) return;
  const nextActive = document.querySelector(`[data-machine-filter="${CSS.escape(activeFilter)}"]`);
  nextActive?.focus();
  if (activeSelectionStart !== null && typeof nextActive?.setSelectionRange === "function") {
    nextActive.setSelectionRange(activeSelectionStart, activeSelectionStart);
  }
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
  syncInboundStandardSections();
  window.__kunheBooted = true;
}

function assignRecordState(payload) {
  if (!payload?.state) return;
  applyServerBootstrap(payload);
}

async function syncFromServer() {
  try {
    const payload = await bootstrap(getAuthToken());
    assignRecordState(payload);
  } catch {
    // no-op; local fallback remains available
  }
}

function listText(value) {
  if (Array.isArray(value)) return value.join("、");
  return value ?? "";
}

function numericInputValue(input) {
  const raw = String(input?.value || "").trim();
  if (!raw) return 0;
  const normalized = raw.replaceAll(",", "").replace(/\s+/g, "").toLowerCase();
  const kkMatch = normalized.match(/^(-?\d+(?:\.\d+)?)kk$/);
  if (kkMatch) return Number(kkMatch[1]) * 1000;
  const kMatch = normalized.match(/^(-?\d+(?:\.\d+)?)k$/);
  if (kMatch) return Number(kMatch[1]);
  const numeric = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function syncQuantityAmount(form) {
  if (!form || !["inbound", "production", "outbound"].includes(form.dataset.form)) return;
  const qtyInput = form.querySelector('input[name="orderQty"], input[name="qty"]');
  const priceInput = form.querySelector('input[name="unitPrice"]');
  const amountInput = form.querySelector('input[name="amount"]');
  const computedAmount = form.querySelector("[data-computed-amount]");
  const paidInput = form.querySelector('input[name="paidAmount"]');
  const settlementInput = form.querySelector('select[name="settlement"]');
  if (!qtyInput || !priceInput || (!amountInput && !computedAmount)) return;
  const qty = numericInputValue(qtyInput);
  const unitPrice = numericInputValue(priceInput);
  if (!qty || !unitPrice) {
    if (computedAmount) computedAmount.textContent = `预计应收金额：${formatCurrency(0)}`;
    return;
  }
  const amount = Number((qty * unitPrice).toFixed(2));
  if (amountInput) amountInput.value = String(amount);
  if (paidInput && settlementInput) {
    if (settlementInput.value === "已收") {
      paidInput.value = String(amount);
    } else if (settlementInput.value === "待收") {
      paidInput.value = "0";
    }
  }
  const paidAmount = paidInput ? Math.max(0, Math.min(amount, numericInputValue(paidInput))) : 0;
  const remainingAmount = Math.max(0, amount - paidAmount);
  if (computedAmount) {
    computedAmount.textContent = `预计应收金额：${formatCurrency(amount)}；已收：${formatCurrency(paidAmount)}；未收：${formatCurrency(remainingAmount)}`;
  }
}

function syncProductionStatusProgress(form, changedName = "") {
  if (!form || form.dataset.form !== "production") return;
  const statusInput = form.querySelector('select[name="status"]');
  const progressInput = form.querySelector('input[name="progress"]');
  if (!statusInput || !progressInput) return;

  let progress = Math.max(0, Math.min(100, Number(progressInput.value || 0)));
  let status = statusInput.value || "待排产";

  if (changedName === "status") {
    if (status === "已完成") progress = 100;
    if (status === "待排产") progress = 0;
    if (status === "进行中" && progress <= 0) progress = 1;
  } else {
    if (progress >= 100) {
      progress = 100;
      status = "已完成";
    } else if (progress <= 0) {
      progress = 0;
      status = "待排产";
    } else if (status === "待排产" || status === "已完成") {
      status = "进行中";
    }
  }

  progressInput.value = String(progress);
  statusInput.value = status;
}

function syncOutboundInventoryPrice(form) {
  if (!form || form.dataset.form !== "outbound") return;
  const inventorySelect = form.querySelector('select[name="inventoryId"]');
  const priceInput = form.querySelector('input[name="unitPrice"]');
  if (!inventorySelect || !priceInput) return;
  const stock = getState().inventory.find((item) => item.id === inventorySelect.value);
  if (stock) priceInput.value = String(stock.cost || 0);
  syncQuantityAmount(form);
}

function formatQuantityInput(input) {
  const value = numericInputValue(input);
  if (!value) return;
  input.value = formatNumber(value);
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
        { label: "测试电流", value: (row) => row.testCurrent },
        { label: "VZ", value: (row) => row.vz },
        { label: "VF3", value: (row) => row.vf3 },
        { label: "IR", value: (row) => row.ir },
        { label: "测试其他", value: (row) => row.testOther },
        { label: "测试标准档案", value: (row) => row.testStandardName },
        { label: "分选VF1", value: (row) => row.sortingVf1 },
        { label: "分选VF3", value: (row) => row.sortingVf3 },
        { label: "分选LOP", value: (row) => row.sortingLop },
        { label: "分选WLD", value: (row) => row.sortingWld },
        { label: "分选IR", value: (row) => row.sortingIr },
        { label: "Bin选择", value: (row) => row.binOptions },
        { label: "Bin其他", value: (row) => row.binOther },
        { label: "电极卡控", value: (row) => row.electrodeOptions },
        { label: "分选其他", value: (row) => row.sortingOther || row.sortingRequirement },
        { label: "目检标准", value: (row) => row.inspectionOptions },
        { label: "目检备注", value: (row) => row.inspectionNote },
        { label: "标签格式", value: (row) => row.labelFormats },
        { label: "标签尺寸", value: (row) => row.labelSizes },
        { label: "贴标位置", value: (row) => row.labelPositions },
        { label: "不良处理", value: (row) => row.defectOptions },
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
        { label: "单位", value: (row) => row.unit },
        { label: "单价", value: (row) => row.unitPrice },
        { label: "金额", value: (row) => row.amount },
        { label: "交期", value: (row) => row.dueDate },
        { label: "机台ID", value: (row) => row.machineId },
        { label: "优先级", value: (row) => row.priority },
        { label: "状态", value: (row) => row.status },
        { label: "进度", value: (row) => row.progress },
        { label: "库存ID", value: (row) => row.inventoryId },
        { label: "入库数量", value: (row) => row.stockedQty },
        { label: "入库日期", value: (row) => row.stockedAt },
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

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function machineTemplateCsv() {
  return [
    "机台ID,机台类型,机台名称,生产组,区域,状态,当前任务,操作员,班次,进度,最近更新",
    "sorter-001,分选机,分选机 S-001,一组,分选区,待机,等待排产,张工,白班,0,2026-06-24 08:00",
    "tester-001,测试机,测试机 T-001,一组,测试区,待机,等待排产,李工,白班,0,2026-06-24 08:00",
  ].join("\n");
}

function exportMachineCsv() {
  const rows = getState().machines.map((machine) => [
    machine.id,
    machine.type,
    machine.name,
    machine.group || machine.area || "",
    machine.area,
    machine.status,
    machine.job,
    machine.operator,
    machine.shift,
    machine.progress,
    machine.updatedAt,
  ]);
  const csv = [
    "机台ID,机台类型,机台名称,生产组,区域,状态,当前任务,操作员,班次,进度,最近更新",
    ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")),
  ].join("\n");
  downloadTextFile(`坤禾半导体机台清单-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseMachineCsv(text) {
  const lines = String(text || "")
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const findIndex = (...names) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    id: findIndex("机台ID", "id", "ID"),
    type: findIndex("机台类型", "类型", "type"),
    name: findIndex("机台名称", "名称", "name"),
    group: findIndex("生产组", "分组", "group", "productionGroup"),
    area: findIndex("区域", "area"),
    status: findIndex("状态", "status"),
    job: findIndex("当前任务", "任务", "job"),
    operator: findIndex("操作员", "负责人", "operator"),
    shift: findIndex("班次", "shift"),
    progress: findIndex("进度", "progress"),
    updatedAt: findIndex("最近更新", "更新时间", "updatedAt"),
  };

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const pick = (key) => (indexes[key] >= 0 ? cells[indexes[key]] || "" : "");
    return {
      id: pick("id") || `machine-${String(index + 1).padStart(3, "0")}`,
      type: pick("type"),
      name: pick("name"),
      group: pick("group"),
      area: pick("area"),
      status: pick("status"),
      job: pick("job"),
      operator: pick("operator"),
      shift: pick("shift"),
      progress: Number(pick("progress") || 0),
      updatedAt: pick("updatedAt"),
    };
  });
}

function financeDraftForQuickAction(kind) {
  const presets = {
    receipt: { type: "收款", status: "已收", source: "快捷收款", method: "转账" },
    payment: { type: "付款", status: "已付", source: "快捷付款", method: "转账" },
    expense: { type: "付款", status: "待付", source: "费用报销", method: "转账" },
    transfer: { type: "付款", status: "已付", source: "转账记录", method: "转账" },
    invoice: { type: "应收", status: "待收", source: "开票管理", method: "月结" },
    reconcile: { type: "应收", status: "待收", source: "对账管理", method: "月结" },
  };
  return {
    date: new Date().toISOString().slice(0, 10),
    counterparty: "",
    amount: 0,
    note: "",
    ...(presets[kind] || presets.receipt),
  };
}

function ensureCanEdit(resource) {
  const currentUser = getCurrentUser();
  if (canEdit(currentUser, resource)) return true;
  alert(currentUser ? "当前账号没有该操作权限。" : "请先登录账号。");
  return false;
}

function confirmDangerAction(button) {
  if (button.getAttribute("data-confirmed") === "true") return true;
  button.setAttribute("data-confirmed", "true");
  button.textContent = "确认删除";
  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.removeAttribute("data-confirmed");
    button.textContent = "删除";
  }, 3000);
  return false;
}

function userPayloadFromForm(formData) {
  return {
    id: String(formData.get("id") || "").trim(),
    username: String(formData.get("username") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    password: String(formData.get("password") || ""),
    role: formData.get("role") === "admin" ? "admin" : "clerk",
    active: formData.get("active") !== "false",
    editableResources: formData.getAll("editableResources"),
  };
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
    if (isServerMode()) {
      const token = getAuthToken();
      resetRemote(token)
        .then((payload) => {
          applyServerBootstrap(payload);
          render();
        })
        .catch((error) => alert(error.message || "恢复失败"));
    } else {
      restoreSeed();
      render();
    }
    return;
  }

  if (action === "logout") {
    if (isServerMode()) {
      logoutRemote(getAuthToken())
        .then((payload) => {
          applyServerBootstrap(payload);
        })
        .catch(() => {
          logout();
        })
        .finally(() => {
          render();
        });
    } else {
      logout();
      render();
    }
    return;
  }

  if (action === "quick-login") {
    const username = button.getAttribute("data-username");
    const password = button.getAttribute("data-password");
    const runner = isServerMode() ? loginRemote(username, password) : Promise.resolve(login(username, password));
    runner
      .then((payload) => {
        if (payload?.ok === false) {
          alert(payload.message || "登录失败");
          return;
        }
        if (payload?.state) {
          applyServerBootstrap(payload);
        }
        render();
      })
      .catch((error) => alert(error.message || "登录失败"));
    return;
  }

  if (action === "export-excel") {
    exportExcel();
    return;
  }

  if (action === "table-page") {
    const pageKey = button.getAttribute("data-page-key") || "";
    const page = Math.max(1, Number(button.getAttribute("data-page") || 1));
    if (!pageKey) return;
    setUi({
      tablePages: {
        ...(getState().ui?.tablePages || {}),
        [pageKey]: page,
      },
    });
    render();
    return;
  }

  if (action === "machine-export") {
    exportMachineCsv();
    return;
  }

  if (action === "machine-template") {
    downloadTextFile("坤禾半导体机台导入模板.csv", `\ufeff${machineTemplateCsv()}`, "text/csv;charset=utf-8");
    return;
  }

  if (action === "machine-filter-reset") {
    setUi({
      machineFilters: {
        keyword: "",
        type: "",
        status: "",
        group: "",
      },
      tablePages: { ...(getState().ui?.tablePages || {}), machine: 1 },
    });
    render();
    return;
  }

  if (action === "machine-group-filter") {
    const group = button.getAttribute("data-group") || "";
    setUi({
      machineFilters: {
        ...(getState().ui?.machineFilters || {}),
        group,
      },
      tablePages: { ...(getState().ui?.tablePages || {}), machine: 1 },
    });
    render();
    return;
  }

  if (action === "machine-show-more") {
    const ui = getState().ui || {};
    const currentPage = Number(ui.tablePages?.machine || 1);
    setUi({ tablePages: { ...(ui.tablePages || {}), machine: currentPage + 1 } });
    render();
    return;
  }

  if (action === "print-inbound") {
    window.print();
    return;
  }

  if (action === "inbound-filter-reset") {
    setUi({
      inboundFilters: {
        customer: "",
        dateStart: "",
        dateEnd: "",
        status: "",
        keyword: "",
      },
    });
    render();
    return;
  }

  if (action === "inbound-new") {
    if (!ensureCanEdit("inbound")) return;
    setUi({
      inboundViewingId: null,
      inboundEditingId: null,
      inboundFormOpen: true,
    });
    render();
    document.getElementById("inbound-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inbound-view") {
    setUi({
      inboundViewingId: button.getAttribute("data-id"),
      inboundEditingId: null,
      inboundFormOpen: false,
    });
    render();
    document.getElementById("inbound-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inbound-edit") {
    if (!ensureCanEdit("inbound")) return;
    const id = button.getAttribute("data-id");
    setUi({
      inboundViewingId: id,
      inboundEditingId: id,
      inboundFormOpen: true,
    });
    render();
    document.getElementById("inbound-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inbound-cancel") {
    clearUi(["inboundEditingId", "inboundFormOpen"]);
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
    const id = button.getAttribute("data-id");
    const afterDelete = () => {
      if (isServerMode()) {
        deleteInboundRemote(id, getAuthToken())
          .then((payload) => {
            assignRecordState(payload);
            render();
          })
          .catch((error) => alert(error.message || "删除失败"));
      } else {
        const result = mutateState((draft) => deleteInbound(draft, id));
        if (result.ok === false) alert(result.message || "删除失败");
        render();
      }
    };
    afterDelete();
    return;
  }

  if (action === "inventory-view") {
    setUi({
      inventoryViewingId: button.getAttribute("data-id"),
      inventoryEditingId: null,
      inventoryFormOpen: false,
    });
    render();
    return;
  }

  if (action === "inventory-new") {
    if (!ensureCanEdit("inventory")) return;
    setUi({
      inventoryViewingId: null,
      inventoryEditingId: null,
      inventoryFormOpen: true,
    });
    render();
    document.getElementById("inventory-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inventory-edit") {
    if (!ensureCanEdit("inventory")) return;
    const id = button.getAttribute("data-id");
    setUi({
      inventoryViewingId: id,
      inventoryEditingId: id,
      inventoryFormOpen: true,
    });
    render();
    document.getElementById("inventory-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "inventory-cancel") {
    clearUi(["inventoryEditingId", "inventoryFormOpen"]);
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
    const id = button.getAttribute("data-id");
    if (isServerMode()) {
      deleteInventoryRemote(id, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "删除失败"));
    } else {
      const result = mutateState((draft) => deleteInventory(draft, id));
      if (result.ok === false) alert(result.message || "删除失败");
      render();
    }
    return;
  }

  if (action === "outbound-view") {
    setUi({
      outboundViewingId: button.getAttribute("data-id"),
      outboundEditingId: null,
      outboundFormOpen: false,
    });
    render();
    document.getElementById("outbound-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "outbound-new") {
    if (!ensureCanEdit("outbound")) return;
    setUi({
      outboundViewingId: null,
      outboundEditingId: null,
      outboundFormOpen: true,
    });
    render();
    document.getElementById("outbound-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "outbound-edit") {
    if (!ensureCanEdit("outbound")) return;
    const id = button.getAttribute("data-id");
    setUi({
      outboundViewingId: id,
      outboundEditingId: id,
      outboundFormOpen: true,
    });
    render();
    document.getElementById("outbound-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "outbound-cancel") {
    clearUi(["outboundEditingId", "outboundFormOpen"]);
    render();
    return;
  }

  if (action === "outbound-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除出库记录。");
      return;
    }
    if (!confirmDangerAction(button)) return;
    const id = button.getAttribute("data-id");
    if (isServerMode()) {
      deleteOutboundRemote(id, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "删除失败"));
    } else {
      const result = mutateState((draft) => deleteOutbound(draft, id));
      if (result.ok === false) alert(result.message || "删除失败");
      render();
    }
    return;
  }

  if (action === "production-view") {
    setUi({
      productionViewingId: button.getAttribute("data-id"),
      productionEditingId: null,
      productionFormOpen: false,
      productionDraftInboundId: null,
    });
    render();
    document.getElementById("production-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "production-view-mode") {
    setUi({ productionViewMode: button.getAttribute("data-mode") === "gantt" ? "gantt" : "list" });
    render();
    return;
  }

  if (action === "production-new") {
    if (!ensureCanEdit("production")) return;
    setUi({
      productionViewingId: null,
      productionEditingId: null,
      productionFormOpen: true,
      productionDraftInboundId: null,
    });
    render();
    document.getElementById("production-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "production-from-inbound") {
    if (!ensureCanEdit("production")) return;
    setActive("production");
    setUi({
      productionViewingId: null,
      productionEditingId: null,
      productionFormOpen: true,
      productionDraftInboundId: button.getAttribute("data-id"),
    });
    render();
    document.getElementById("production-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "production-edit") {
    if (!ensureCanEdit("production")) return;
    const id = button.getAttribute("data-id");
    setUi({
      productionViewingId: id,
      productionEditingId: id,
      productionFormOpen: true,
      productionDraftInboundId: null,
    });
    render();
    document.getElementById("production-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "production-cancel") {
    clearUi(["productionEditingId", "productionFormOpen", "productionDraftInboundId"]);
    render();
    return;
  }

  if (action === "production-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除生产计划。");
      return;
    }
    if (!confirmDangerAction(button)) return;
    const id = button.getAttribute("data-id");
    if (isServerMode()) {
      deleteProductionRemote(id, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "删除失败"));
    } else {
      const result = mutateState((draft) => deleteProduction(draft, id));
      if (result.ok === false) alert(result.message || "删除失败");
      render();
    }
    return;
  }

  if (action === "production-stock-in") {
    if (!ensureCanEdit("production") || !ensureCanEdit("inventory")) return;
    const id = button.getAttribute("data-id");
    if (!confirm("确认将该生产计划转入库存？转入后不能重复入库。")) return;

    if (isServerMode()) {
      stockInProductionRemote(id, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          setActive("inventory");
          render();
        })
        .catch((error) => alert(error.message || "转库存失败"));
    } else {
      const result = mutateState((draft) => productionToInventory(draft, id));
      if (result.ok === false) {
        alert(result.message || "转库存失败");
        return;
      }
      setActive("inventory");
      render();
    }
    return;
  }

  if (action === "machine-status") {
    if (!ensureCanEdit("machine")) return;
    const machineId = button.getAttribute("data-machine");
    const nextStatus = button.getAttribute("data-status");
    const currentMachine = getState().machines.find((item) => item.id === machineId);
    const patch = {
      status: nextStatus,
      updatedAt: timestampNow(),
      job:
        nextStatus === "待机"
          ? "等待排产"
          : nextStatus === "维护"
            ? "点检中"
            : currentMachine?.job || "生产中",
    };
    if (isServerMode()) {
      updateMachineRemote(machineId, patch, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "机台更新失败"));
    } else {
      mutateState((draft) => updateMachine(draft, machineId, patch));
      render();
    }
    return;
  }

  if (action === "machine-step") {
    if (!ensureCanEdit("machine")) return;
    const machineId = button.getAttribute("data-machine");
    const machine = getState().machines.find((item) => item.id === machineId);
    if (!machine) return;
    const step = Number(button.getAttribute("data-step").replace("%", ""));
    const progress = Math.max(0, Math.min(100, Number(machine.progress || 0) + step));
    const patch = {
      progress,
      status: progress >= 100 ? "待机" : machine.status === "维护" ? "待机" : "运行",
      updatedAt: timestampNow(),
    };
    if (isServerMode()) {
      updateMachineRemote(machineId, patch, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "机台更新失败"));
    } else {
      mutateState((draft) => updateMachine(draft, machineId, patch));
      render();
    }
    return;
  }

  if (action === "machine-complete") {
    if (!ensureCanEdit("machine")) return;
    const machineId = button.getAttribute("data-machine");
    const patch = { progress: 100, status: "待机", updatedAt: timestampNow() };
    if (isServerMode()) {
      updateMachineRemote(machineId, patch, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "机台更新失败"));
    } else {
      mutateState((draft) => updateMachine(draft, machineId, patch));
      render();
    }
    return;
  }

  if (action === "machine-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除机台。");
      return;
    }
    if (!confirmDangerAction(button)) return;
    const machineId = button.getAttribute("data-machine");
    if (isServerMode()) {
      deleteMachineRemote(machineId, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "删除失败"));
    } else {
      const result = mutateState((draft) => deleteMachine(draft, machineId));
      if (result.ok === false) alert(result.message || "删除失败");
      render();
    }
    return;
  }

  if (action === "finance-view") {
    setUi({ financeViewingId: button.getAttribute("data-id"), financeEditingId: null, financeFormOpen: false, financeDraft: null });
    render();
    return;
  }

  if (action === "finance-new") {
    if (!ensureCanEdit("finance")) return;
    setUi({ financeViewingId: null, financeEditingId: null, financeFormOpen: true, financeDraft: null });
    render();
    document.getElementById("finance-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "finance-report") {
    setUi({ financeReportOpen: true });
    render();
    document.getElementById("finance-report-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "finance-report-close") {
    setUi({ financeReportOpen: false });
    render();
    return;
  }

  if (action === "finance-quick") {
    if (!ensureCanEdit("finance")) return;
    setUi({
      financeViewingId: null,
      financeEditingId: null,
      financeFormOpen: true,
      financeDraft: financeDraftForQuickAction(button.getAttribute("data-kind")),
    });
    render();
    document.getElementById("finance-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "finance-edit") {
    if (!ensureCanEdit("finance")) return;
    setUi({
      financeViewingId: button.getAttribute("data-id"),
      financeEditingId: button.getAttribute("data-id"),
      financeFormOpen: true,
      financeDraft: null,
    });
    render();
    document.getElementById("finance-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "finance-cancel") {
    clearUi(["financeEditingId", "financeFormOpen", "financeDraft"]);
    render();
    return;
  }

  if (action === "finance-delete") {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "admin") {
      alert("只有管理员可以删除财务记录。");
      return;
    }
    if (!confirmDangerAction(button)) return;
    const id = button.getAttribute("data-id");
    if (isServerMode()) {
      deleteFinanceRemote(id, getAuthToken())
        .then((payload) => {
          assignRecordState(payload);
          render();
        })
        .catch((error) => alert(error.message || "删除失败"));
    } else {
      const result = mutateState((draft) => deleteFinance(draft, id));
      if (result.ok === false) alert(result.message || "删除失败");
      render();
    }
    return;
  }

  if (action === "user-view") {
    setUi({ userViewingId: button.getAttribute("data-id"), userEditingId: null });
    render();
    return;
  }

  if (action === "user-new") {
    if (!ensureCanEdit("users")) return;
    setUi({ userViewingId: null, userEditingId: null });
    render();
    const panel = document.getElementById("user-form-panel");
    if (panel) panel.open = true;
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "user-edit") {
    if (!ensureCanEdit("users")) return;
    setUi({ userViewingId: button.getAttribute("data-id"), userEditingId: button.getAttribute("data-id") });
    render();
    document.querySelector('form[data-form="user"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "user-cancel") {
    clearUi(["userEditingId"]);
    render();
    return;
  }

  if (action === "user-delete") {
    if (!ensureCanEdit("users")) return;
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
    const id = button.getAttribute("data-id");
    const commit = isServerMode()
      ? deleteUserRemote(id, getAuthToken())
      : Promise.resolve(deleteUserLocal(id));
    commit
      .then((payload) => {
        if (payload?.state) applyServerBootstrap(payload);
        render();
      })
      .catch((error) => alert(error.message || "删除失败"));
    return;
  }
});

document.addEventListener("change", (event) => {
  const outboundStockForm = event.target.closest('form[data-form="outbound"]');
  if (outboundStockForm && event.target.name === "inventoryId") {
    syncOutboundInventoryPrice(outboundStockForm);
  }

  const amountForm = event.target.closest('form[data-form="inbound"], form[data-form="production"], form[data-form="outbound"]');
  if (amountForm && ["orderQty", "qty", "unitPrice", "paidAmount", "settlement"].includes(event.target.name)) {
    syncQuantityAmount(amountForm);
  }
  if (amountForm?.dataset.form === "production" && ["status", "progress"].includes(event.target.name)) {
    syncProductionStatusProgress(amountForm, event.target.name);
  }
  if (amountForm && ["orderQty", "qty"].includes(event.target.name)) {
    formatQuantityInput(event.target);
  }

  const input = event.target.closest('form[data-form="inbound"] input[name="processes"]');
  if (input) {
    syncInboundStandardSections();
    return;
  }

  const machineImport = event.target.closest("[data-machine-import]");
  if (machineImport) {
    const file = machineImport.files?.[0];
    if (!file) return;
    if (!ensureCanEdit("machine")) {
      machineImport.value = "";
      return;
    }
    file
      .text()
      .then((text) => {
        const records = parseMachineCsv(text);
        if (!records.length) {
          alert("没有识别到机台记录，请使用模板填写后再导入。");
          return null;
        }
        if (isServerMode()) {
          return importMachinesRemote(records, getAuthToken()).then((payload) => {
            applyServerBootstrap(payload);
            return records.length;
          });
        }
        const result = mutateState((draft) => importMachines(draft, records));
        if (result.ok === false) {
          alert(result.message || "导入失败");
          return null;
        }
        return records.length;
      })
      .then((count) => {
        if (!count) return;
        setUi({ tablePages: { ...(getState().ui?.tablePages || {}), machine: 1 } });
        render();
        alert(`已导入 ${count} 台机台。`);
      })
      .catch((error) => alert(error.message || "导入失败"))
      .finally(() => {
        machineImport.value = "";
      });
    return;
  }

  const machineFilter = event.target.closest("[data-machine-filter]");
  if (machineFilter) {
    updateMachineFiltersFromDom();
    return;
  }

  const tablePageSize = event.target.closest("[data-table-page-size]");
  if (tablePageSize) {
    const pageKey = tablePageSize.getAttribute("data-page-key") || "";
    if (!pageKey) return;
    const pageSize = Number(tablePageSize.value || 10);
    const ui = getState().ui || {};
    setUi({
      tablePageSizes: {
        ...(ui.tablePageSizes || {}),
        [pageKey]: pageSize,
      },
      tablePages: {
        ...(ui.tablePages || {}),
        [pageKey]: 1,
      },
    });
    render();
    return;
  }

  const inboundFilter = event.target.closest("[data-filter]");
  if (!inboundFilter) return;
  updateInboundFiltersFromDom();
});

document.addEventListener("input", (event) => {
  const amountForm = event.target.closest('form[data-form="inbound"], form[data-form="production"], form[data-form="outbound"]');
  if (amountForm && ["orderQty", "qty", "unitPrice", "paidAmount"].includes(event.target.name)) {
    syncQuantityAmount(amountForm);
    if (amountForm.dataset.form === "production" && event.target.name === "qty") syncProductionStatusProgress(amountForm, event.target.name);
    return;
  }
  if (amountForm?.dataset.form === "production" && event.target.name === "progress") {
    syncProductionStatusProgress(amountForm, event.target.name);
    return;
  }

  const machineFilter = event.target.closest("[data-machine-filter]");
  if (machineFilter) {
    updateMachineFiltersFromDom();
    return;
  }

  const inboundFilter = event.target.closest("[data-filter]");
  if (!inboundFilter) return;
  updateInboundFiltersFromDom();
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  const formData = new FormData(form);
  const formKey = form.getAttribute("data-form");

  if (formKey === "login") {
    const username = formData.get("username");
    const password = formData.get("password");
    const runner = isServerMode() ? loginRemote(username, password) : Promise.resolve(login(username, password));
    runner
      .then((payload) => {
        if (payload?.ok === false) {
          alert(payload.message || "登录失败");
          return;
        }
        if (payload?.state) applyServerBootstrap(payload);
        render();
      })
      .catch((error) => alert(error.message || "登录失败"));
    return;
  }

  const resource = FORM_RESOURCE[formKey];
  if (resource && !ensureCanEdit(resource)) return;

  if (formKey === "user") {
    const userPayload = userPayloadFromForm(formData);
    const runner = isServerMode()
      ? saveUserRemote(userPayload, getAuthToken())
      : Promise.resolve(saveUserLocal(userPayload));
    runner
      .then((payload) => {
        if (payload?.ok === false) {
          alert(payload.message || "保存失败");
          return;
        }
        if (payload?.state) applyServerBootstrap(payload);
        clearUi(["userEditingId"]);
        render();
      })
      .catch((error) => alert(error.message || "保存失败"));
    return;
  }

  if (isServerMode() && ["inbound", "inventory", "outbound", "production", "finance"].includes(formKey)) {
    const state = getState();
    const recordMakers = {
      inbound: () => inboundRecordFromForm(formData),
      inventory: () => inventoryRecordFromForm(state, formData),
      outbound: () => {
        const inventoryId = String(formData.get("inventoryId") || "");
        const stock = state.inventory.find((item) => item.id === inventoryId);
        return {
          id: String(formData.get("id") || "").trim(),
          inventoryId,
          date: formData.get("date"),
          customer: formData.get("customer"),
          orderNo: formData.get("orderNo"),
          qty: formData.get("qty"),
          unitPrice: formData.get("unitPrice"),
          paidAmount: formData.get("paidAmount"),
          logistics: formData.get("logistics"),
          settlement: formData.get("settlement"),
          note: formData.get("note") || "",
          item: stock?.item || "",
          spec: stock?.spec || "",
          unit: stock?.unit || "",
          warehouse: stock?.location || "",
        };
      },
      production: () => productionRecordFromForm(formData),
      finance: () => financeRecordFromForm(formData),
    };
    const remoteSavers = {
      inbound: saveInboundRemote,
      inventory: saveInventoryRemote,
      outbound: saveOutboundRemote,
      production: saveProductionRemote,
      finance: saveFinanceRemote,
    };
    const record = recordMakers[formKey]();
    const runner = remoteSavers[formKey](record, getAuthToken());
    runner
      .then((payload) => {
        applyServerBootstrap(payload);
        if (formKey === "inbound") clearUi(["inboundEditingId", "inboundFormOpen"]);
        if (formKey === "inventory") clearUi(["inventoryEditingId", "inventoryFormOpen"]);
        if (formKey === "outbound") clearUi(["outboundEditingId", "outboundFormOpen"]);
        if (formKey === "production") clearUi(["productionEditingId", "productionFormOpen", "productionDraftInboundId"]);
        if (formKey === "finance") clearUi(["financeEditingId", "financeFormOpen", "financeDraft"]);
        render();
      })
      .catch((error) => alert(error.message || "保存失败"));
    return;
  }

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

  if (formKey === "inbound") clearUi(["inboundEditingId", "inboundFormOpen"]);
  if (formKey === "inventory") clearUi(["inventoryEditingId", "inventoryFormOpen"]);
  if (formKey === "outbound") clearUi(["outboundEditingId", "outboundFormOpen"]);
  if (formKey === "production") clearUi(["productionEditingId", "productionFormOpen", "productionDraftInboundId"]);
  if (formKey === "finance") clearUi(["financeEditingId", "financeFormOpen", "financeDraft"]);
  render();
});

syncFromServer().finally(() => render());
