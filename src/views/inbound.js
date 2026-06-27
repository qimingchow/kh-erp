import { badge, renderCheckboxGroup, renderTable } from "../ui/components.js";
import { escapeHtml, formatDate, formatNumber } from "../lib/format.js";
import { canEdit } from "../lib/state.js";

const PROCESS_OPTIONS = [
  { label: "测试", value: "测试" },
  { label: "分选", value: "分选" },
  { label: "抽测出图", value: "抽测出图" },
  { label: "测试出图", value: "测试出图" },
  { label: "翻膜", value: "翻膜" },
  { label: "换标签", value: "换标签" },
  { label: "其他", value: "其他" },
];

const SHAPE_OPTIONS = [
  { label: "方形", value: "方形" },
  { label: "圆形", value: "圆形" },
];

const BIN_OPTIONS = [
  { label: "80000", value: "80000" },
  { label: "78000", value: "78000" },
  { label: "76000", value: "76000" },
];

const ELECTRODE_OPTIONS = [
  { label: "严卡", value: "严卡" },
  { label: "轻微卡", value: "轻微卡" },
];

const LABEL_FORMAT_OPTIONS = [
  { label: "中性标签", value: "中性标签" },
  { label: "特定标签", value: "特定标签" },
];

const LABEL_SIZE_OPTIONS = [
  { label: "60*40", value: "60*40" },
  { label: "70*50", value: "70*50" },
  { label: "80*50", value: "80*50" },
  { label: "其他", value: "其他" },
];

const LABEL_POSITION_OPTIONS = [
  { label: "左下", value: "左下" },
  { label: "右下", value: "右下" },
  { label: "右上", value: "右上" },
  { label: "左上", value: "左上" },
];

const DEFECT_OPTIONS = [
  { label: "收费排片方", value: "收费排片方" },
  { label: "残留蓝膜寄回客户", value: "残留蓝膜寄回客户" },
  { label: "我司自行处理", value: "我司自行处理" },
];

const INSPECTION_OPTIONS = [
  { label: "简单外观目检", value: "简单外观目检" },
  { label: "严格电极目检", value: "严格电极目检" },
];

const TEST_STANDARD_PROCESSES = ["测试", "抽测出图", "测试出图"];

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/[、,，;；]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function usesTestStandard(processes) {
  const values = listOf(processes);
  return TEST_STANDARD_PROCESSES.some((item) => values.includes(item));
}

function usesSortingStandard(processes) {
  return listOf(processes).includes("分选");
}

function renderBinOptions(selectedValues = [], binOther = "") {
  const values = new Set((selectedValues || []).map((value) => String(value)));
  return `
    <section class="check-panel">
      <div class="check-panel-head">
        <div class="check-panel-title">Bin 选择</div>
      </div>
      <div class="check-grid">
        ${BIN_OPTIONS.map((option, index) => {
          const id = `binOptions-${String(index + 1).padStart(2, "0")}-${String(option.value)}`;
          return `
            <label class="check-item">
              <input id="${escapeHtml(id)}" type="checkbox" name="binOptions" value="${escapeHtml(option.value)}" ${values.has(String(option.value)) ? "checked" : ""} />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `;
        }).join("")}
      </div>
      <div class="field full">
        <label for="binOther">其他</label>
        <input id="binOther" name="binOther" type="text" value="${escapeHtml(binOther || "")}" placeholder="按客户要求填写" />
      </div>
    </section>
  `;
}

function renderTextField(name, label, value, options = {}) {
  const fullClass = options.full ? " full" : "";
  const placeholder = options.placeholder || "";
  const required = options.required === false ? "" : "required";
  return `
    <div class="field${fullClass}">
      <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
      <input id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="text" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" ${required} />
    </div>
  `;
}

function checkedMark(values, value) {
  return listOf(values).includes(value) ? "☑" : "☐";
}

function textValue(value) {
  if (Array.isArray(value)) return escapeHtml(value.length ? value.join("、") : "");
  if (value === 0) return "0";
  return escapeHtml(value ? String(value) : "");
}

function renderSheetLine(label, value, className = "") {
  return `<div class="work-sheet-line ${className}"><span>${escapeHtml(label)}</span><strong>${textValue(value)}</strong></div>`;
}

function renderInboundDetail(record) {
  if (!record) return `<div class="empty">暂无记录</div>`;
  const showTestStandard = usesTestStandard(record.processes);
  const showSortingStandard = usesSortingStandard(record.processes);
  const processes = listOf(record.processes);
  const shapes = listOf(record.shapes);
  const binOptions = listOf(record.binOptions);
  const electrodeOptions = listOf(record.electrodeOptions);
  const inspectionOptions = listOf(record.inspectionOptions);
  const labelFormats = listOf(record.labelFormats);
  const labelSizes = listOf(record.labelSizes);
  const labelPositions = listOf(record.labelPositions);
  const defectOptions = listOf(record.defectOptions);
  const binOtherChecked = record.binOther ? "☑" : "☐";

  return `
    <div class="work-sheet-wrap" id="inbound-detail">
      <div class="work-sheet">
      <div class="work-sheet-title">
        <h3>坤禾半导体（东莞）有限公司</h3>
        <h4>客户加工接单表</h4>
      </div>

      <div class="work-sheet-customer">
        <span>客户名称：</span>
        <strong>${textValue(record.customerName)}</strong>
      </div>

      <div class="work-sheet-order">
        <div>序号</div>
        <div>来料日期</div>
        <div>订单编号</div>
        <div>品名/规格</div>
        <div>订单数量</div>
        <div>单位</div>
        <div>单价</div>
        <div>金额</div>
        <div>交货日期</div>
        <div>备注</div>
        <div>1</div>
        <div>${escapeHtml(formatDate(record.orderDate || record.date))}</div>
        <div>${textValue(record.orderNo)}</div>
        <div>${textValue(record.productSpec)}</div>
        <div>${formatNumber(record.orderQty || 0)}</div>
        <div>${textValue(record.unit)}</div>
        <div>${textValue(record.unitPrice)}</div>
        <div>${textValue(record.amount)}</div>
        <div>${escapeHtml(formatDate(record.deliveryDate))}</div>
        <div>${textValue(record.note)}</div>
      </div>

      <div class="work-sheet-row">
        <div class="work-sheet-label">加工方式：</div>
        <div class="work-sheet-content">
          <span>${checkedMark(processes, "测试")} 1. 测试</span>
          <span>${checkedMark(processes, "分选")} 2. 分选（形状要求：${checkedMark(shapes, "方形")} 方形　${checkedMark(shapes, "圆形")} 圆形）</span>
          <span>${checkedMark(processes, "抽测出图")} 3. 抽测出图</span>
          <span>${checkedMark(processes, "测试出图")} 4. 测试出图</span>
          <span>${checkedMark(processes, "翻膜")} 5. 翻膜</span>
          <span>${checkedMark(processes, "换标签")} 6. 换标签</span>
          <span>${checkedMark(processes, "其他")} 7. 其他</span>
        </div>
      </div>

      ${showTestStandard ? `
      <div class="work-sheet-row">
        <div class="work-sheet-label">测试标准：</div>
        <div class="work-sheet-content sheet-grid">
          ${renderSheetLine("测试电流", record.testCurrent)}
          ${renderSheetLine("VZ", record.vz)}
          ${renderSheetLine("VF3", record.vf3)}
          ${renderSheetLine("IR", record.ir)}
          ${renderSheetLine("其他", record.testOther)}
          ${renderSheetLine("测试标准档案名称", record.testStandardName, "wide")}
        </div>
      </div>
      ` : ""}
      ${showSortingStandard ? `
      <div class="work-sheet-row">
        <div class="work-sheet-label">分选要求：</div>
        <div class="work-sheet-content">
          <div class="sheet-lines">
            ${renderSheetLine("VF1", record.sortingVf1)}
            ${renderSheetLine("VF3", record.sortingVf3)}
            ${renderSheetLine("LOP", record.sortingLop)}
            ${renderSheetLine("WLD", record.sortingWld)}
            ${renderSheetLine("IR", record.sortingIr)}
          </div>
          <div class="sheet-check-line">
            2. 分选满 Bin 直径：
            <span>${checkedMark(binOptions, "80000")} 80000</span>
            <span>${checkedMark(binOptions, "78000")} 78000</span>
            <span>${checkedMark(binOptions, "76000")} 76000</span>
            <span>${binOtherChecked} 其他：${textValue(record.binOther)}</span>
          </div>
          <div class="sheet-check-line">
            3. 表面电极卡控：
            <span>${checkedMark(electrodeOptions, "严卡")} 严卡</span>
            <span>${checkedMark(electrodeOptions, "轻微卡")} 轻微卡</span>
          </div>
          ${renderSheetLine("4. 其他", record.sortingOther || record.sortingRequirement, "wide")}
        </div>
      </div>
      ` : ""}

      <div class="work-sheet-row">
        <div class="work-sheet-label">目检标准：</div>
        <div class="work-sheet-content sheet-check-line">
          <span>${checkedMark(inspectionOptions, "简单外观目检")} 简单外观目检</span>
          <span>${checkedMark(inspectionOptions, "严格电极目检")} 严格电极目检</span>
          <span>备注：${textValue(record.inspectionNote)}</span>
        </div>
      </div>

      <div class="work-sheet-row">
        <div class="work-sheet-label">标签打印：</div>
        <div class="work-sheet-content">
          <div class="sheet-check-line">
            1. 成品标签格式：
            <span>${checkedMark(labelFormats, "中性标签")} 中性标签</span>
            <span>${checkedMark(labelFormats, "特定标签")} 特定标签</span>
          </div>
          <div class="sheet-check-line">
            2. 成品标签尺寸：
            <span>${checkedMark(labelSizes, "60*40")} 60*40</span>
            <span>${checkedMark(labelSizes, "70*50")} 70*50</span>
            <span>${checkedMark(labelSizes, "80*50")} 80*50</span>
            <span>${checkedMark(labelSizes, "其他")} 其他</span>
          </div>
          <div class="sheet-check-line">
            3. 成品贴标位置：
            <span>${checkedMark(labelPositions, "左下")} 左下</span>
            <span>${checkedMark(labelPositions, "右下")} 右下</span>
            <span>${checkedMark(labelPositions, "右上")} 右上</span>
            <span>${checkedMark(labelPositions, "左上")} 左上</span>
          </div>
        </div>
      </div>

      <div class="work-sheet-row single">
        <div class="work-sheet-content sheet-check-line">
          不符合分选条件的芯片处理：
          <span>${checkedMark(defectOptions, "收费排片方")} 收费排片方</span>
          <span>${checkedMark(defectOptions, "残留蓝膜寄回客户")} 残留蓝膜寄回客户</span>
          <span>${checkedMark(defectOptions, "我司自行处理")} 我司自行处理</span>
        </div>
      </div>

      <div class="work-sheet-row single">
        <div class="work-sheet-content">备注：${textValue(record.note)}</div>
      </div>

      <div class="work-sheet-sign">
        <span>客户确认：</span>
        <span>日期：　　 年　　 月　　 日</span>
      </div>
      </div>
    </div>
  `;
}

function inboundStatus(record) {
  if (record.status) return record.status;
  if (record.completedAt) return "已完成";
  const deliveryDate = record.deliveryDate || record.orderDate || record.date || "";
  if (deliveryDate && deliveryDate < new Date().toISOString().slice(0, 10)) return "已到期";
  return "待处理";
}

function matchesInboundFilters(record, filters = {}) {
  const customer = filters.customer || "";
  const start = filters.dateStart || "";
  const end = filters.dateEnd || "";
  const status = filters.status || "";
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  const orderDate = record.orderDate || record.date || "";
  const haystack = [
    record.customerName,
    record.orderNo,
    record.productSpec,
    record.note,
    record.unit,
    ...(Array.isArray(record.processes) ? record.processes : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (customer && record.customerName !== customer) return false;
  if (start && orderDate < start) return false;
  if (end && orderDate > end) return false;
  if (status && inboundStatus(record) !== status) return false;
  if (keyword && !haystack.includes(keyword)) return false;
  return true;
}

function defaultFormValues(record = {}) {
  const current = record || {};
  return {
    customerName: current.customerName || "",
    orderDate: current.orderDate || new Date().toISOString().slice(0, 10),
    orderNo: current.orderNo || "",
    productSpec: current.productSpec || "",
    orderQty: current.orderQty || 0,
    unit: current.unit || "K",
    unitPrice: current.unitPrice || "",
    amount: current.amount || "",
    deliveryDate: current.deliveryDate || "",
    note: current.note || "",
    testCurrent: current.testCurrent || "150mA",
    vz: current.vz || "",
    vf3: current.vf3 || "",
    ir: current.ir || "",
    testOther: current.testOther || "",
    testStandardName: current.testStandardName || "",
    sortingVf1: current.sortingVf1 || "",
    sortingVf3: current.sortingVf3 || "",
    sortingLop: current.sortingLop || "",
    sortingWld: current.sortingWld || "",
    sortingIr: current.sortingIr || "",
    sortingOther: current.sortingOther || "",
    sortingRequirement: current.sortingRequirement || "",
    binOther: current.binOther || "",
    inspectionNote: current.inspectionNote || "",
  };
}

export function renderInbound(state, auth) {
  const editable = canEdit(auth?.currentUser, "inbound");
  const canCreateProduction = canEdit(auth?.currentUser, "production");
  const formRecord = state.inbound.find((item) => item.id === state.ui?.inboundEditingId) || null;

  const formValues = {
    ...defaultFormValues(formRecord),
    processes: listOf(formRecord?.processes),
    shapes: listOf(formRecord?.shapes),
    binOptions: listOf(formRecord?.binOptions),
    electrodeOptions: listOf(formRecord?.electrodeOptions),
    labelFormats: listOf(formRecord?.labelFormats),
    labelSizes: listOf(formRecord?.labelSizes),
    labelPositions: listOf(formRecord?.labelPositions),
    defectOptions: listOf(formRecord?.defectOptions),
    inspectionOptions: listOf(formRecord?.inspectionOptions),
    currentEditId: formRecord?.id || "",
  };
  const showTestStandard = usesTestStandard(formValues.processes);
  const showSortingStandard = usesSortingStandard(formValues.processes);

  const formFields = [
    { name: "customerName", label: "客户名称", placeholder: "例如：深圳市金凯半导体科技有限公司" },
    { name: "orderDate", label: "来料日期", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    { name: "orderNo", label: "订单编号", placeholder: "例如：MO-20260614-001" },
    { name: "productSpec", label: "品名 / 规格", placeholder: "例如：Y3N3" },
    { name: "orderQty", label: "订单数量", placeholder: "例如：100,000 或 100kk" },
    { name: "unit", label: "单位", placeholder: "K / KK / PCS / 批" },
    { name: "unitPrice", label: "单价", type: "number", min: 0, step: 0.01, defaultValue: "", required: false },
    { name: "amount", label: "金额", type: "number", min: 0, step: 0.01, defaultValue: "", required: false },
    { name: "deliveryDate", label: "交货日期", type: "date", defaultValue: "", required: false },
    { name: "note", label: "备注", type: "textarea", full: true, required: false, placeholder: "补充说明" },
  ];

  const columns = [
    { label: "客户", render: (row) => escapeHtml(row.customerName) },
    { label: "日期", render: (row) => escapeHtml(formatDate(row.orderDate)) },
    { label: "订单", render: (row) => escapeHtml(row.orderNo || "-") },
    { label: "品名/规格", render: (row) => `${escapeHtml(row.productSpec || "-")}<div class="small">${escapeHtml(row.unit || "-")} · ${formatNumber(row.orderQty || 0)}</div>` },
    { label: "交货日期", render: (row) => escapeHtml(formatDate(row.deliveryDate)) },
    { label: "加工方式", render: (row) => badge(listOf(row.processes)[0] || "测试") },
    { label: "备注", render: (row) => escapeHtml(row.note || "-") },
    {
      label: "操作",
      render: (row) => `
        <div class="row-actions">
          <button class="btn mini" type="button" data-action="inbound-view" data-id="${escapeHtml(row.id)}">查看</button>
          ${editable ? `<button class="btn mini" type="button" data-action="inbound-edit" data-id="${escapeHtml(row.id)}">编辑</button>` : ""}
          ${canCreateProduction ? `<button class="btn mini" type="button" data-action="production-from-inbound" data-id="${escapeHtml(row.id)}">转计划</button>` : ""}
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="inbound-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  const inboundQty = state.inbound.reduce((total, item) => total + Number(item.orderQty || item.qty || 0), 0);
  const formOpen = Boolean(state.ui?.inboundFormOpen || formRecord);
  const formTitle = formRecord ? "编辑来料单" : "新增来料单";
  const customerOptions = [...new Set(state.inbound.map((item) => item.customerName).filter(Boolean))];
  const filters = state.ui?.inboundFilters || {};
  const filteredInbound = state.inbound.filter((item) => matchesInboundFilters(item, filters));
  const filteredQty = filteredInbound.reduce((total, item) => total + Number(item.orderQty || item.qty || 0), 0);
  const activeSelection = state.inbound.find((item) => item.id === state.ui?.inboundViewingId) || null;
  const selectedRecord =
    (activeSelection && matchesInboundFilters(activeSelection, filters) ? activeSelection : null) ||
    formRecord ||
    filteredInbound[0] ||
    null;

  const inboundForm = editable ? `
    <section class="panel" id="inbound-form-panel">
      <div class="panel-header">
        <div>
          <h3>${formTitle}</h3>
          <p>根据客户加工接单表录入客户、订单、加工方式和测试/分选标准。</p>
        </div>
      </div>
      <form class="stack" data-form="inbound">
        <input type="hidden" name="id" value="${escapeHtml(formValues.currentEditId || "")}" />
        <section class="sheet-section">
          <div class="section-title">客户 / 订单信息</div>
          <div class="field-grid">
            ${renderFormFields(formFields, formValues)}
          </div>
        </section>
        <section class="sheet-section">
          <div class="section-title">加工方式</div>
          ${renderCheckboxGroup("processes", "加工方式", PROCESS_OPTIONS, formValues.processes, "多选")}
          ${renderCheckboxGroup("shapes", "形状要求", SHAPE_OPTIONS, formValues.shapes, "适用于分选要求")}
        </section>
        <section class="sheet-section conditional-section" data-standard-section="test" ${showTestStandard ? "" : "hidden"}>
          <div class="section-title">测试标准</div>
          <div class="field-grid">
            ${renderTextField("testCurrent", "测试电流", formValues.testCurrent, { placeholder: "例如：150 mA" })}
            ${renderTextField("vz", "VZ", formValues.vz, { placeholder: "例如：uA", required: false })}
            ${renderTextField("vf3", "VF3", formValues.vf3, { placeholder: "例如：uA", required: false })}
            ${renderTextField("ir", "IR", formValues.ir, { placeholder: "例如：V", required: false })}
            ${renderTextField("testOther", "其他", formValues.testOther, { required: false })}
            ${renderTextField("testStandardName", "测试标准档案名称", formValues.testStandardName, { full: true, required: false })}
          </div>
        </section>
        <section class="sheet-section conditional-section" data-standard-section="sorting" ${showSortingStandard ? "" : "hidden"}>
          <div class="section-title">分选标准</div>
          <div class="field-grid">
            ${renderTextField("sortingVf1", "VF1", formValues.sortingVf1, { placeholder: "例如：2.8-2.9-3.1", required: false })}
            ${renderTextField("sortingVf3", "VF3", formValues.sortingVf3, { placeholder: "例如：2.15-2.35", required: false })}
            ${renderTextField("sortingLop", "LOP", formValues.sortingLop, { placeholder: "例如：230-250-300", required: false })}
            ${renderTextField("sortingWld", "WLD", formValues.sortingWld, { placeholder: "例如：447.5-450-452.5", required: false })}
            ${renderTextField("sortingIr", "IR", formValues.sortingIr, { placeholder: "例如：0-0.5", required: false })}
            ${renderTextField("sortingOther", "其他", formValues.sortingOther || formValues.sortingRequirement, { full: true, required: false })}
          </div>
          ${renderBinOptions(formValues.binOptions, formValues.binOther)}
          ${renderCheckboxGroup("electrodeOptions", "表面电极卡控", ELECTRODE_OPTIONS, formValues.electrodeOptions, "")}
        </section>
        <section class="sheet-section">
          <div class="section-title">目检标准</div>
          ${renderCheckboxGroup("inspectionOptions", "目检标准", INSPECTION_OPTIONS, formValues.inspectionOptions, "")}
          <div class="field-grid">
            ${renderTextField("inspectionNote", "备注", formValues.inspectionNote, { full: true, required: false })}
          </div>
        </section>
        <section class="sheet-section">
          <div class="section-title">标签打印 / 不良处理</div>
          ${renderCheckboxGroup("labelFormats", "成品标签格式", LABEL_FORMAT_OPTIONS, formValues.labelFormats, "")}
          ${renderCheckboxGroup("labelSizes", "成品标签尺寸", LABEL_SIZE_OPTIONS, formValues.labelSizes, "")}
          ${renderCheckboxGroup("labelPositions", "成品贴标位置", LABEL_POSITION_OPTIONS, formValues.labelPositions, "")}
          ${renderCheckboxGroup("defectOptions", "不符合分选条件的芯片处理", DEFECT_OPTIONS, formValues.defectOptions, "")}
        </section>
        <div class="form-actions">
          <button class="btn primary" type="submit">${formRecord ? "保存修改" : "保存来料"}</button>
          <button class="btn ghost" type="button" data-action="inbound-cancel">${formRecord ? "取消编辑" : "收起表单"}</button>
        </div>
      </form>
    </section>
  ` : "";

  return `
    <div class="page-stack">
      <section class="query-panel inbound-query-panel">
        <div class="query-panel-header">
          <div>
            <h3>筛选查询</h3>
            <p>按客户、日期、状态和关键词快速定位来料单据。</p>
          </div>
          <div class="stats-card compact-stat inbound-stat">
            <span>本月来料</span>
            <strong>${formatNumber(inboundQty)}</strong>
            <small>较上月 ↑ 12.5%</small>
          </div>
        </div>
        <div class="query-grid">
          <label class="filter-field">
            <span>客户</span>
            <select data-filter="inbound-customer">
              <option value="">全部客户</option>
              ${customerOptions.map((item) => `<option value="${escapeHtml(item)}" ${filters.customer === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>开始日期</span>
            <input data-filter="inbound-date-start" type="date" value="${escapeHtml(filters.dateStart || "")}" />
          </label>
          <label class="filter-field">
            <span>结束日期</span>
            <input data-filter="inbound-date-end" type="date" value="${escapeHtml(filters.dateEnd || "")}" />
          </label>
          <label class="filter-field">
            <span>状态</span>
            <select data-filter="inbound-status">
              <option value="">全部状态</option>
              <option value="待处理" ${filters.status === "待处理" ? "selected" : ""}>待处理</option>
              <option value="已到期" ${filters.status === "已到期" ? "selected" : ""}>已到期</option>
              <option value="已完成" ${filters.status === "已完成" ? "selected" : ""}>已完成</option>
            </select>
          </label>
          <label class="filter-field wide">
            <span>搜索订单、品名、备注</span>
            <input data-filter="inbound-keyword" type="search" value="${escapeHtml(filters.keyword || "")}" placeholder="请输入关键词" />
          </label>
          <div class="query-actions">
            <button class="btn ghost" type="button" data-action="inbound-filter-reset">重置</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>来料单据列表</h3>
            <p>先查看已经录入的接单记录，再从列表进入查看、编辑或删除。</p>
          </div>
          <div class="module-header-actions">
            <div class="module-stat">
              <span>来料总量</span>
              <strong>${formatNumber(filteredQty)}</strong>
              <span>共 ${filteredInbound.length} / ${state.inbound.length} 条</span>
            </div>
            ${editable ? `
              <button class="btn primary" type="button" data-action="inbound-new">
                新增来料
              </button>
            ` : ""}
          </div>
        </div>
        ${!editable ? `<div class="empty">当前账号没有录入权限，可查看来料单据。</div>` : ""}
        ${renderTable(columns, filteredInbound, { pageKey: "inbound", ui: state.ui })}
      </section>

      ${formOpen ? inboundForm : ""}

      <section class="panel inbound-detail-panel">
        <div class="panel-header">
          <div>
            <h3>单据详情</h3>
            <p>点击表格里的查看后，这里会显示完整的接单单据内容。</p>
          </div>
          ${selectedRecord ? `
            <button class="btn ghost" type="button" data-action="print-inbound">
              打印单据
            </button>
          ` : ""}
        </div>
        ${renderInboundDetail(selectedRecord)}
      </section>
    </div>
  `;
}

function renderFormFields(fields, values) {
  return fields.map((field) => {
    const value = values[field.name];
    const label = `<label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>`;
    const common = `id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" ${field.required === false ? "" : "required"}`;
    const currentValue = value ?? field.defaultValue ?? "";
    if (field.type === "textarea") {
      return `<div class="field ${field.full ? "full" : ""}">${label}<textarea ${common}>${escapeHtml(currentValue)}</textarea></div>`;
    }
    const inputType = field.type || "text";
    const min = field.min !== undefined ? `min="${field.min}"` : "";
    const step = field.step !== undefined ? `step="${field.step}"` : "";
    return `<div class="field ${field.full ? "full" : ""}">${label}<input ${common} type="${escapeHtml(inputType)}" value="${escapeHtml(currentValue)}" placeholder="${escapeHtml(field.placeholder || "")}" ${min} ${step} /></div>`;
  }).join("");
}
