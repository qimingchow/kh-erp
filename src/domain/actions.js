import { makeId, parseNumber, timestampNow, todayString } from "../lib/format.js";

export function normalizeInventoryStatus(item) {
  if ((item.status || "") === "冻结") return "冻结";
  return item.qty <= item.safe ? "低库存" : "正常";
}

function productParts(value = "") {
  const [item = "", ...rest] = String(value || "").split("/");
  return {
    item: item.trim() || String(value || "").trim() || "生产成品",
    spec: rest.join("/").trim(),
  };
}

function findInventoryForOutbound(state, record) {
  if (!record) return null;
  if (record.inventoryId) {
    const exact = state.inventory.find((item) => item.id === record.inventoryId);
    if (exact) return exact;
  }

  const itemName = String(record.item || "");
  const spec = String(record.spec || "");
  const warehouse = String(record.warehouse || "");
  return (
    state.inventory.find(
      (item) => item.item === itemName && item.spec === spec && (item.location === warehouse || item.warehouse === warehouse),
    ) || state.inventory.find((item) => item.item === itemName && item.spec === spec) || null
  );
}

function findFinanceForOutbound(state, record) {
  if (!record) return null;
  if (record.financeId) {
    const exact = state.finance.find((item) => item.id === record.financeId);
    if (exact) return exact;
  }

  const source = `出库单 ${record.orderNo || ""}`;
  return (
    state.finance.find((item) => item.source === source) ||
    state.finance.find(
      (item) =>
        record.orderNo &&
        String(item.source || "").includes(record.orderNo) &&
        (!record.customer || item.counterparty === record.customer),
    ) ||
    null
  );
}

function normalizeSettlementAmounts(amount, settlement = "待收", paidValue = 0) {
  const total = Number(amount || 0);
  let nextSettlement = settlement || "待收";
  let paidAmount = parseNumber(paidValue);

  if (nextSettlement === "已收") {
    paidAmount = total;
  } else if (nextSettlement === "待收") {
    paidAmount = 0;
  } else if (nextSettlement === "部分收款") {
    paidAmount = Math.max(0, Math.min(total, paidAmount));
    if (paidAmount <= 0) nextSettlement = "待收";
    if (total > 0 && paidAmount >= total) nextSettlement = "已收";
  }

  const remainingAmount = Math.max(0, total - paidAmount);
  return {
    settlement: nextSettlement,
    paidAmount: Number(paidAmount.toFixed(2)),
    remainingAmount: Number(remainingAmount.toFixed(2)),
  };
}

function buildOutboundFinance(record, financeId) {
  return {
    id: financeId || makeId("fin"),
    outboundId: record.id,
    date: record.date,
    type: "应收",
    source: `出库单 ${record.orderNo}`,
    counterparty: record.customer,
    amount: record.amount,
    paidAmount: record.paidAmount,
    remainingAmount: record.remainingAmount,
    status: record.settlement,
    method: record.settlement === "已收" ? "转账" : "月结",
    note: `由出库自动生成；数量 ${record.qty}${record.unit || ""}，单价 ${record.unitPrice}`,
  };
}

function normalizeProductionProgressStatus(status = "待排产", progress = 0) {
  let nextStatus = status || "待排产";
  let nextProgress = Math.max(0, Math.min(100, Number(progress || 0)));

  if (nextStatus === "已完成" || nextProgress >= 100) {
    nextStatus = "已完成";
    nextProgress = 100;
  } else if (nextProgress <= 0) {
    nextStatus = "待排产";
    nextProgress = 0;
  } else if (nextStatus === "待排产") {
    nextStatus = "进行中";
  }

  return { status: nextStatus, progress: nextProgress };
}

export function getMachineName(state, id) {
  return state.machines.find((item) => item.id === id)?.name || "未指定";
}

export function inboundRecordFromForm(formData) {
  const id = String(formData.get("id") || "").trim();
  const orderDate = formData.get("orderDate") || todayString();
  const orderQty = parseNumber(formData.get("orderQty"));
  const unitPrice = parseNumber(formData.get("unitPrice"));
  const manualAmount = parseNumber(formData.get("amount"));
  return {
    id: id || makeId("in"),
    customerName: formData.get("customerName"),
    date: orderDate,
    orderDate,
    orderNo: formData.get("orderNo"),
    productSpec: formData.get("productSpec"),
    orderQty,
    unit: formData.get("unit") || "K",
    unitPrice: formData.get("unitPrice") ? unitPrice : "",
    amount: formData.get("amount") ? manualAmount : unitPrice ? Number((orderQty * unitPrice).toFixed(2)) : "",
    deliveryDate: formData.get("deliveryDate"),
    note: formData.get("note") || "",
    processes: formData.getAll("processes"),
    shapes: formData.getAll("shapes"),
    binOptions: formData.getAll("binOptions"),
    binOther: formData.get("binOther") || "",
    electrodeOptions: formData.getAll("electrodeOptions"),
    labelFormats: formData.getAll("labelFormats"),
    labelSizes: formData.getAll("labelSizes"),
    labelPositions: formData.getAll("labelPositions"),
    defectOptions: formData.getAll("defectOptions"),
    inspectionOptions: formData.getAll("inspectionOptions"),
    inspectionNote: formData.get("inspectionNote") || "",
    testCurrent: formData.get("testCurrent") || "",
    vz: formData.get("vz") || "",
    vf3: formData.get("vf3") || "",
    ir: formData.get("ir") || "",
    testOther: formData.get("testOther") || "",
    testStandardName: formData.get("testStandardName") || "",
    sortingVf1: formData.get("sortingVf1") || "",
    sortingVf3: formData.get("sortingVf3") || "",
    sortingLop: formData.get("sortingLop") || "",
    sortingWld: formData.get("sortingWld") || "",
    sortingIr: formData.get("sortingIr") || "",
    sortingOther: formData.get("sortingOther") || "",
    sortingRequirement: formData.get("sortingRequirement") || formData.get("sortingOther") || "",
    updatedAt: timestampNow(),
  };
}

export function createInbound(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const record = inboundRecordFromForm(formData);

  const existing = id ? state.inbound.find((item) => item.id === id) : null;

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.inbound.unshift(record);
  }

  state.ui = {
    ...(state.ui || {}),
    inboundEditingId: null,
    inboundViewingId: record.id,
  };

  return { ok: true, id: record.id };
}

export function deleteInbound(state, id) {
  const index = state.inbound.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "记录不存在" };
  state.inbound.splice(index, 1);
  if (state.ui?.inboundEditingId === id) state.ui.inboundEditingId = null;
  if (state.ui?.inboundViewingId === id) state.ui.inboundViewingId = null;
  return { ok: true };
}

export function inventoryRecordFromForm(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const record = {
    id: id || makeId("stock"),
    code: code || `MAT-${String(state.inventory.length + 1).padStart(3, "0")}`,
    item: formData.get("item"),
    spec: formData.get("spec"),
    location: formData.get("location"),
    qty: parseNumber(formData.get("qty")),
    reserved: parseNumber(formData.get("reserved")),
    safe: parseNumber(formData.get("safe")),
    unit: formData.get("unit"),
    status: formData.get("status"),
    cost: parseNumber(formData.get("cost")),
    note: formData.get("note") || "",
    lastUpdate: todayString(),
  };
  record.status = normalizeInventoryStatus(record);
  return record;
}

export function createInventory(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const record = inventoryRecordFromForm(state, formData);

  const existing = id
    ? state.inventory.find((item) => item.id === id)
    : state.inventory.find((item) => item.code === record.code);
  if (existing) {
    Object.assign(existing, record);
  } else {
    state.inventory.unshift(record);
  }

  state.ui = {
    ...(state.ui || {}),
    inventoryEditingId: null,
    inventoryViewingId: record.id,
  };

  return { ok: true, id: record.id };
}

export function deleteInventory(state, id) {
  const index = state.inventory.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "库存记录不存在" };
  const stock = state.inventory[index];
  const outboundUsingStock = state.outbound.some(
    (item) => item.inventoryId === stock.id || (item.item === stock.item && item.spec === stock.spec),
  );
  if (outboundUsingStock) return { ok: false, message: "该库存已有出库记录引用，建议先冻结，不建议删除。" };
  state.inventory.splice(index, 1);
  if (state.ui?.inventoryEditingId === id) state.ui.inventoryEditingId = null;
  if (state.ui?.inventoryViewingId === id) state.ui.inventoryViewingId = null;
  return { ok: true };
}

export function createOutbound(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const inventoryId = String(formData.get("inventoryId") || "");
  const stock = state.inventory.find((item) => item.id === inventoryId);
  if (!stock) return { ok: false, message: "请选择一个库存物料。" };

  const qty = parseNumber(formData.get("qty"));
  const existing = id ? state.outbound.find((item) => item.id === id) : null;
  const previousStock = existing ? findInventoryForOutbound(state, existing) : null;
  if (existing && !previousStock) return { ok: false, message: "原出库关联库存不存在，无法自动回滚。" };

  const availableQty = Number(stock.qty || 0) + (previousStock?.id === stock.id ? Number(existing.qty || 0) : 0);
  if (!qty || qty > availableQty) return { ok: false, message: "出库数量不能大于可用库存。" };

  const unitPrice = parseNumber(formData.get("unitPrice"));
  const amount = Number((qty * unitPrice).toFixed(2));
  const settlementAmounts = normalizeSettlementAmounts(amount, formData.get("settlement"), formData.get("paidAmount"));
  const record = {
    id: existing?.id || makeId("out"),
    inventoryId,
    financeId: existing?.financeId || "",
    date: formData.get("date"),
    customer: formData.get("customer"),
    orderNo: formData.get("orderNo"),
    item: stock.item,
    spec: stock.spec,
    qty,
    unit: stock.unit,
    unitPrice,
    amount,
    paidAmount: settlementAmounts.paidAmount,
    remainingAmount: settlementAmounts.remainingAmount,
    warehouse: stock.location,
    logistics: formData.get("logistics"),
    settlement: settlementAmounts.settlement,
    note: formData.get("note") || "",
    updatedAt: timestampNow(),
  };

  if (previousStock) {
    previousStock.qty += Number(existing.qty || 0);
    previousStock.lastUpdate = record.date;
    previousStock.status = normalizeInventoryStatus(previousStock);
  }

  stock.qty -= qty;
  stock.lastUpdate = record.date;
  stock.status = normalizeInventoryStatus(stock);

  const linkedFinance = existing ? findFinanceForOutbound(state, existing) : null;
  const financeRecord = buildOutboundFinance(record, linkedFinance?.id || record.financeId);
  record.financeId = financeRecord.id;

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.outbound.unshift(record);
  }

  if (linkedFinance) {
    Object.assign(linkedFinance, financeRecord);
  } else {
    state.finance.unshift(financeRecord);
  }

  state.ui = {
    ...(state.ui || {}),
    outboundEditingId: null,
    outboundViewingId: record.id,
  };

  return { ok: true, id: record.id };
}

export function deleteOutbound(state, id) {
  const index = state.outbound.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "出库记录不存在" };

  const record = state.outbound[index];
  const stock = findInventoryForOutbound(state, record);
  if (!stock) return { ok: false, message: "原出库关联库存不存在，无法自动回滚。" };

  stock.qty += Number(record.qty || 0);
  stock.lastUpdate = todayString();
  stock.status = normalizeInventoryStatus(stock);

  const finance = findFinanceForOutbound(state, record);
  if (finance) {
    const financeIndex = state.finance.findIndex((item) => item.id === finance.id);
    if (financeIndex >= 0) state.finance.splice(financeIndex, 1);
  }

  state.outbound.splice(index, 1);
  if (state.ui?.outboundEditingId === id) state.ui.outboundEditingId = null;
  if (state.ui?.outboundViewingId === id) state.ui.outboundViewingId = null;
  return { ok: true };
}

export function assignMachineToPlan(state, plan) {
  if (!plan.machineId) return;
  const machine = state.machines.find((item) => item.id === plan.machineId);
  if (!machine) return;

  machine.job = `${plan.item} / ${plan.planNo}`;
  machine.status = plan.status === "已完成" ? "待机" : "运行";
  machine.progress = plan.progress;
  machine.updatedAt = timestampNow();
}

export function createProduction(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const record = productionRecordFromForm(formData, id);
  const existing = id ? state.production.find((item) => item.id === id) : null;
  if (existing) {
    record.inventoryId = existing.inventoryId || record.inventoryId;
    record.stockedQty = Number(existing.stockedQty || record.stockedQty || 0);
    record.stockedAt = existing.stockedAt || record.stockedAt;
  }

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.production.unshift(record);
  }
  assignMachineToPlan(state, record);
  state.ui = {
    ...(state.ui || {}),
    productionEditingId: null,
    productionViewingId: record.id,
  };
  return { ok: true, id: record.id };
}

export function productionRecordFromForm(formData, existingId = "") {
  const qty = parseNumber(formData.get("qty"));
  const unitPrice = parseNumber(formData.get("unitPrice"));
  const manualAmount = parseNumber(formData.get("amount"));
  const progressStatus = normalizeProductionProgressStatus(formData.get("status"), formData.get("progress"));
  return {
    id: existingId || String(formData.get("id") || "").trim() || makeId("plan"),
    planNo: formData.get("planNo"),
    orderNo: formData.get("orderNo"),
    item: formData.get("item"),
    qty,
    unit: formData.get("unit") || "K",
    unitPrice: formData.get("unitPrice") ? unitPrice : "",
    amount: formData.get("amount") ? manualAmount : unitPrice ? Number((qty * unitPrice).toFixed(2)) : "",
    dueDate: formData.get("dueDate"),
    machineId: formData.get("machineId"),
    priority: formData.get("priority"),
    status: progressStatus.status,
    progress: progressStatus.progress,
    note: formData.get("note") || "",
    inventoryId: formData.get("inventoryId") || "",
    stockedQty: Number(formData.get("stockedQty") || 0),
    stockedAt: formData.get("stockedAt") || "",
    updatedAt: timestampNow(),
  };
}

export function productionToInventory(state, planId) {
  const plan = state.production.find((item) => item.id === planId);
  if (!plan) return { ok: false, message: "生产计划不存在。" };
  if (plan.inventoryId) return { ok: false, message: "该生产计划已经转入库存，不能重复入库。" };
  if (plan.status !== "已完成" || Number(plan.progress || 0) < 100) {
    return { ok: false, message: "请先将生产计划状态改为已完成，且进度为 100%。" };
  }

  const { item, spec } = productParts(plan.item);
  const existing = state.inventory.find(
    (stock) => stock.item === item && stock.spec === spec && String(stock.note || "").includes(plan.planNo),
  );
  const stockedAt = todayString();
  const qty = Number(plan.qty || 0);
  const stock = existing || {
    id: makeId("stock"),
    code: `FG-${String(state.inventory.length + 1).padStart(3, "0")}`,
    item,
    spec,
    location: "成品仓-待定",
    qty: 0,
    reserved: 0,
    safe: 0,
    unit: plan.unit || "K",
    status: "正常",
    cost: Number(plan.unitPrice || 0),
    note: `由生产计划 ${plan.planNo} 入库，订单 ${plan.orderNo || "-"}`,
    lastUpdate: stockedAt,
  };

  stock.qty = Number(stock.qty || 0) + qty;
  stock.lastUpdate = stockedAt;
  stock.status = normalizeInventoryStatus(stock);
  if (!existing) state.inventory.unshift(stock);

  Object.assign(plan, {
    inventoryId: stock.id,
    stockedQty: qty,
    stockedAt,
    updatedAt: timestampNow(),
  });
  state.ui = {
    ...(state.ui || {}),
    inventoryViewingId: stock.id,
    productionViewingId: plan.id,
  };

  return { ok: true, id: stock.id };
}

export function deleteProduction(state, id) {
  const index = state.production.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "生产计划不存在" };
  const plan = state.production[index];
  const machine = state.machines.find((item) => item.id === plan.machineId);
  if (machine && String(machine.job || "").includes(plan.planNo)) {
    Object.assign(machine, {
      job: "等待排产",
      status: "待机",
      progress: 0,
      updatedAt: timestampNow(),
    });
  }
  state.production.splice(index, 1);
  if (state.ui?.productionEditingId === id) state.ui.productionEditingId = null;
  if (state.ui?.productionViewingId === id) state.ui.productionViewingId = null;
  return { ok: true };
}

export function financeRecordFromForm(formData, existingId = "") {
  const type = formData.get("type");
  const amount = parseNumber(formData.get("amount"));
  const status = formData.get("status");
  const paidInfo = normalizeSettlementAmounts(
    amount,
    status === "已付" ? "已收" : status === "待付" ? "待收" : status,
    formData.get("paidAmount"),
  );
  const paidAmount = type === "付款" || status === "已付" ? amount : type === "应付" && status === "待付" ? 0 : paidInfo.paidAmount;
  const remainingAmount = Math.max(0, amount - paidAmount);
  const normalizedStatus = type === "应收" ? paidInfo.settlement : status;

  return {
    id: existingId || String(formData.get("id") || "").trim() || makeId("fin"),
    outboundId: formData.get("outboundId") || "",
    date: formData.get("date"),
    type,
    source: formData.get("source"),
    counterparty: formData.get("counterparty"),
    amount,
    paidAmount: Number(paidAmount.toFixed(2)),
    remainingAmount: Number(remainingAmount.toFixed(2)),
    status: normalizedStatus,
    method: formData.get("method"),
    note: formData.get("note") || "",
    updatedAt: timestampNow(),
  };
}

export function createFinance(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const record = financeRecordFromForm(formData, id);
  const existing = id ? state.finance.find((item) => item.id === id) : null;

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.finance.unshift(record);
  }

  if (record.outboundId) {
    const outbound = state.outbound.find((item) => item.id === record.outboundId);
    if (outbound) {
      const settlementStatus =
        record.status === "已收" ? "已收" : record.status === "部分收款" ? "部分收款" : "待收";
      const settlementAmounts = normalizeSettlementAmounts(outbound.amount, settlementStatus, record.paidAmount);
      outbound.settlement = settlementAmounts.settlement;
      outbound.paidAmount = settlementAmounts.paidAmount;
      outbound.remainingAmount = settlementAmounts.remainingAmount;
    }
  }

  state.ui = {
    ...(state.ui || {}),
    financeEditingId: null,
    financeViewingId: record.id,
  };
  return { ok: true, id: record.id };
}

export function deleteFinance(state, id) {
  const index = state.finance.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, message: "财务记录不存在" };
  const finance = state.finance[index];
  if (finance.outboundId) {
    const outbound = state.outbound.find((item) => item.id === finance.outboundId);
    if (outbound) {
      outbound.financeId = "";
      outbound.settlement = "待收";
      outbound.paidAmount = 0;
      outbound.remainingAmount = Number(outbound.amount || 0);
    }
  }
  state.finance.splice(index, 1);
  if (state.ui?.financeEditingId === id) state.ui.financeEditingId = null;
  if (state.ui?.financeViewingId === id) state.ui.financeViewingId = null;
  return { ok: true };
}

export function updateMachine(state, machineId, patch) {
  const index = state.machines.findIndex((item) => item.id === machineId);
  if (index < 0) return { ok: true };

  state.machines[index] = { ...state.machines[index], ...patch };
  const machine = state.machines[index];
  const plan = state.production.find((item) => item.machineId === machine.id && item.status !== "已完成");

  if (plan) {
    plan.progress = machine.progress;
    plan.status = machine.progress >= 100 ? "已完成" : machine.status === "运行" ? "进行中" : plan.status;
  }

  return { ok: true };
}

function normalizeMachineImportRecord(record, index = 0) {
  const type = record.type === "测试机" ? "测试机" : "分选机";
  const fallbackPrefix = type === "测试机" ? "T" : "S";
  const fallbackNo = String(index + 1).padStart(3, "0");
  return {
    id: String(record.id || `${type === "测试机" ? "test" : "sorter"}-${fallbackNo}`).trim(),
    type,
    name: String(record.name || `${type} ${fallbackPrefix}-${fallbackNo}`).trim(),
    area: String(record.area || (type === "测试机" ? "测试区" : "分选区")).trim(),
    status: ["运行", "待机", "维护", "故障", "异常"].includes(record.status) ? record.status : "待机",
    job: String(record.job || "等待排产").trim(),
    operator: String(record.operator || "").trim(),
    shift: String(record.shift || "").trim(),
    progress: Math.max(0, Math.min(100, Number(record.progress || 0))),
    updatedAt: String(record.updatedAt || new Date().toISOString().slice(0, 10)).trim(),
  };
}

export function importMachines(state, records = []) {
  if (!Array.isArray(records) || !records.length) {
    return { ok: false, message: "没有可导入的机台记录。" };
  }

  records.forEach((item, index) => {
    const record = normalizeMachineImportRecord(item, index);
    const existingIndex = state.machines.findIndex((machine) => machine.id === record.id);
    if (existingIndex >= 0) {
      state.machines[existingIndex] = { ...state.machines[existingIndex], ...record };
    } else {
      state.machines.push(record);
    }
  });

  return { ok: true, count: records.length };
}
