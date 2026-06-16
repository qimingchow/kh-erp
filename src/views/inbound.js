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

function detailValue(value) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "未填写";
  if (value === 0) return "0";
  return value ? String(value) : "未填写";
}

function renderDetailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(detailValue(value))}</strong>
    </div>
  `;
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

function renderInboundDetail(record) {
  if (!record) return `<div class="empty">暂无记录</div>`;
  const showTestStandard = usesTestStandard(record.processes);
  const showSortingStandard = usesSortingStandard(record.processes);

  return `
    <div class="detail-sheet" id="inbound-detail">
      <div class="detail-section">
        <div class="section-title">客户 / 订单信息</div>
        <div class="detail-grid">
          ${renderDetailItem("客户名称", record.customerName)}
          ${renderDetailItem("来料日期", formatDate(record.orderDate || record.date))}
          ${renderDetailItem("订单编号", record.orderNo)}
          ${renderDetailItem("品名 / 规格", record.productSpec)}
          ${renderDetailItem("订单数量", `${formatNumber(record.orderQty || 0)} ${record.unit || ""}`)}
          ${renderDetailItem("单价", record.unitPrice)}
          ${renderDetailItem("金额", record.amount)}
          ${renderDetailItem("交货日期", formatDate(record.deliveryDate))}
        </div>
      </div>
      <div class="detail-section">
        <div class="section-title">加工方式</div>
        <div class="detail-grid">
          ${renderDetailItem("加工方式", listOf(record.processes))}
          ${renderDetailItem("形状要求", listOf(record.shapes))}
        </div>
      </div>
      ${showTestStandard ? `
      <div class="detail-section">
        <div class="section-title">测试标准</div>
        <div class="detail-grid">
          ${renderDetailItem("测试电流", record.testCurrent)}
          ${renderDetailItem("VZ", record.vz)}
          ${renderDetailItem("VF3", record.vf3)}
          ${renderDetailItem("IR", record.ir)}
          ${renderDetailItem("其他", record.testOther)}
          ${renderDetailItem("测试标准档案名称", record.testStandardName)}
        </div>
      </div>
      ` : ""}
      ${showSortingStandard ? `
      <div class="detail-section">
        <div class="section-title">分选标准</div>
        <div class="detail-grid">
          ${renderDetailItem("VF1", record.sortingVf1)}
          ${renderDetailItem("VF3", record.sortingVf3)}
          ${renderDetailItem("LOP", record.sortingLop)}
          ${renderDetailItem("WLD", record.sortingWld)}
          ${renderDetailItem("IR", record.sortingIr)}
          ${renderDetailItem("Bin 选择", listOf(record.binOptions))}
          ${renderDetailItem("Bin 其他", record.binOther)}
          ${renderDetailItem("表面电极卡控", listOf(record.electrodeOptions))}
          ${renderDetailItem("其他", record.sortingOther || record.sortingRequirement)}
        </div>
      </div>
      ` : ""}
      <div class="detail-section">
        <div class="section-title">目检标准</div>
        <div class="detail-grid">
          ${renderDetailItem("目检方式", listOf(record.inspectionOptions))}
          ${renderDetailItem("备注", record.inspectionNote)}
        </div>
      </div>
      <div class="detail-section">
        <div class="section-title">标签打印 / 不良处理</div>
        <div class="detail-grid">
          ${renderDetailItem("成品标签格式", listOf(record.labelFormats))}
          ${renderDetailItem("成品标签尺寸", listOf(record.labelSizes))}
          ${renderDetailItem("成品贴标位置", listOf(record.labelPositions))}
          ${renderDetailItem("不良处理", listOf(record.defectOptions))}
        </div>
      </div>
      <div class="detail-section">
        <div class="section-title">备注</div>
        <div class="small">${escapeHtml(record.note || "未填写")}</div>
      </div>
    </div>
  `;
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
  const formRecord = state.inbound.find((item) => item.id === state.ui?.inboundEditingId) || null;
  const selectedRecord =
    state.inbound.find((item) => item.id === state.ui?.inboundViewingId) || formRecord || state.inbound[0] || null;

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
    { name: "orderQty", label: "订单数量", type: "number", min: 0, step: 1, defaultValue: 0 },
    { name: "unit", label: "单位", placeholder: "K / PCS / 批" },
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
          ${auth?.currentUser?.role === "admin" ? `<button class="btn mini danger" type="button" data-action="inbound-delete" data-id="${escapeHtml(row.id)}">删除</button>` : ""}
        </div>
      `,
    },
  ];

  const inboundQty = state.inbound.reduce((total, item) => total + Number(item.orderQty || item.qty || 0), 0);
  const formOpen = Boolean(state.ui?.inboundFormOpen || formRecord);
  const formTitle = formRecord ? "编辑来料单" : "新增来料单";

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
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>来料单据列表</h3>
            <p>先查看已经录入的接单记录，再从列表进入查看、编辑或删除。</p>
          </div>
          <div class="module-header-actions">
            <div class="module-stat">
              <span>来料总量</span>
              <strong>${formatNumber(inboundQty)}</strong>
              <span>共 ${state.inbound.length} 条</span>
            </div>
            ${editable ? `
              <button class="btn primary" type="button" data-action="inbound-new">
                新增来料
              </button>
            ` : ""}
          </div>
        </div>
        ${!editable ? `<div class="empty">当前账号没有录入权限，可查看来料单据。</div>` : ""}
        ${renderTable(columns, state.inbound)}
      </section>

      ${formOpen ? inboundForm : ""}

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>单据详情</h3>
            <p>点击表格里的查看后，这里会显示完整的接单单据内容。</p>
          </div>
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
