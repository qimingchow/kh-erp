import { makeId, timestampNow, todayString } from "../lib/format.js";

export function normalizeInventoryStatus(item) {
  if ((item.status || "") === "冻结") return "冻结";
  return item.qty <= item.safe ? "低库存" : "正常";
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

function buildOutboundFinance(record, financeId) {
  return {
    id: financeId || makeId("fin"),
    outboundId: record.id,
    date: record.date,
    type: "应收",
    source: `出库单 ${record.orderNo}`,
    counterparty: record.customer,
    amount: record.amount,
    status: record.settlement,
    method: record.settlement === "已收" ? "转账" : "月结",
    note: "由出库自动生成",
  };
}

export function getMachineName(state, id) {
  return state.machines.find((item) => item.id === id)?.name || "未指定";
}

export function inboundRecordFromForm(formData) {
  const id = String(formData.get("id") || "").trim();
  const orderDate = formData.get("orderDate") || todayString();
  return {
    id: id || makeId("in"),
    customerName: formData.get("customerName"),
    date: orderDate,
    orderDate,
    orderNo: formData.get("orderNo"),
    productSpec: formData.get("productSpec"),
    orderQty: Number(formData.get("orderQty") || 0),
    unit: formData.get("unit") || "K",
    unitPrice: formData.get("unitPrice") ? Number(formData.get("unitPrice")) : "",
    amount: formData.get("amount") ? Number(formData.get("amount")) : "",
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
    qty: Number(formData.get("qty") || 0),
    reserved: Number(formData.get("reserved") || 0),
    safe: Number(formData.get("safe") || 0),
    unit: formData.get("unit"),
    status: formData.get("status"),
    cost: Number(formData.get("cost") || 0),
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

  const qty = Number(formData.get("qty") || 0);
  const existing = id ? state.outbound.find((item) => item.id === id) : null;
  const previousStock = existing ? findInventoryForOutbound(state, existing) : null;
  if (existing && !previousStock) return { ok: false, message: "原出库关联库存不存在，无法自动回滚。" };

  const availableQty = Number(stock.qty || 0) + (previousStock?.id === stock.id ? Number(existing.qty || 0) : 0);
  if (!qty || qty > availableQty) return { ok: false, message: "出库数量不能大于可用库存。" };

  const unitPrice = Number(formData.get("unitPrice") || 0);
  const amount = Number((qty * unitPrice).toFixed(2));
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
    warehouse: stock.location,
    logistics: formData.get("logistics"),
    settlement: formData.get("settlement"),
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
  return {
    id: existingId || String(formData.get("id") || "").trim() || makeId("plan"),
    planNo: formData.get("planNo"),
    orderNo: formData.get("orderNo"),
    item: formData.get("item"),
    qty: Number(formData.get("qty") || 0),
    dueDate: formData.get("dueDate"),
    machineId: formData.get("machineId"),
    priority: formData.get("priority"),
    status: formData.get("status"),
    progress: Number(formData.get("progress") || 0),
    note: formData.get("note") || "",
    updatedAt: timestampNow(),
  };
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
  return {
    id: existingId || String(formData.get("id") || "").trim() || makeId("fin"),
    date: formData.get("date"),
    type: formData.get("type"),
    source: formData.get("source"),
    counterparty: formData.get("counterparty"),
    amount: Number(formData.get("amount") || 0),
    status: formData.get("status"),
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
    if (outbound) outbound.settlement = record.status;
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
