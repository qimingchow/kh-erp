import { makeId, timestampNow, todayString } from "../lib/format.js";

export function normalizeInventoryStatus(item) {
  if ((item.status || "") === "冻结") return "冻结";
  return item.qty <= item.safe ? "低库存" : "正常";
}

export function getMachineName(state, id) {
  return state.machines.find((item) => item.id === id)?.name || "未指定";
}

export function createInbound(state, formData) {
  const id = String(formData.get("id") || "").trim();
  const orderDate = formData.get("orderDate") || todayString();
  const record = {
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
    electrodeOptions: formData.getAll("electrodeOptions"),
    labelFormats: formData.getAll("labelFormats"),
    labelSizes: formData.getAll("labelSizes"),
    labelPositions: formData.getAll("labelPositions"),
    defectOptions: formData.getAll("defectOptions"),
    testCurrent: formData.get("testCurrent") || "",
    vz: formData.get("vz") || "",
    vf3: formData.get("vf3") || "",
    ir: formData.get("ir") || "",
    testStandardName: formData.get("testStandardName") || "",
    sortingRequirement: formData.get("sortingRequirement") || "",
    updatedAt: timestampNow(),
  };

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

export function createInventory(state, formData) {
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
  const outboundUsingStock = state.outbound.some((item) => item.item === stock.item && item.spec === stock.spec);
  if (outboundUsingStock) return { ok: false, message: "该库存已有出库记录引用，建议先冻结，不建议删除。" };
  state.inventory.splice(index, 1);
  if (state.ui?.inventoryEditingId === id) state.ui.inventoryEditingId = null;
  if (state.ui?.inventoryViewingId === id) state.ui.inventoryViewingId = null;
  return { ok: true };
}

export function createOutbound(state, formData) {
  const inventoryId = String(formData.get("inventoryId") || "");
  const stock = state.inventory.find((item) => item.id === inventoryId);
  if (!stock) return { ok: false, message: "请选择一个库存物料。" };

  const qty = Number(formData.get("qty") || 0);
  if (!qty || qty > stock.qty) return { ok: false, message: "出库数量不能大于可用库存。" };

  const unitPrice = Number(formData.get("unitPrice") || 0);
  const amount = Number((qty * unitPrice).toFixed(2));
  const record = {
    id: makeId("out"),
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
  };

  stock.qty -= qty;
  stock.lastUpdate = record.date;
  stock.status = normalizeInventoryStatus(stock);
  state.outbound.unshift(record);
  state.finance.unshift({
    id: makeId("fin"),
    date: record.date,
    type: "应收",
    source: `出库单 ${record.orderNo}`,
    counterparty: record.customer,
    amount,
    status: record.settlement,
    method: record.settlement === "已收" ? "转账" : "月结",
    note: "由出库自动生成",
  });

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
  const record = {
    id: makeId("plan"),
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
  };

  state.production.unshift(record);
  assignMachineToPlan(state, record);
  return { ok: true };
}

export function createFinance(state, formData) {
  state.finance.unshift({
    id: makeId("fin"),
    date: formData.get("date"),
    type: formData.get("type"),
    source: formData.get("source"),
    counterparty: formData.get("counterparty"),
    amount: Number(formData.get("amount") || 0),
    status: formData.get("status"),
    method: formData.get("method"),
    note: formData.get("note") || "",
  });

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
