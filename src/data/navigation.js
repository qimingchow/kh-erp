export const NAV_ITEMS = [
  { key: "overview", label: "总览", desc: "看板、流程、预警、扩展建议" },
  { key: "inbound", label: "来料录入", desc: "客户接单、加工要求、检验标准" },
  { key: "inventory", label: "库存管理", desc: "库存、货位、预警、盘点" },
  { key: "outbound", label: "出库记录", desc: "出库、客户、金额、对账" },
  { key: "production", label: "生产计划", desc: "工单、交期、排产、进度" },
  { key: "machine", label: "机台看板", desc: "分选机、测试机和设备状态" },
  { key: "finance", label: "财务记录", desc: "应收、应付、收款、付款" },
  { key: "users", label: "用户权限", desc: "账号、角色、模块权限" },
  { key: "roadmap", label: "扩展路线", desc: "后续还能补哪些功能" },
];

export function getViewIcon(key) {
  const iconMap = {
    overview: "dashboard",
    inbound: "inbox",
    inventory: "boxes",
    outbound: "truck",
    production: "calendar",
    machine: "monitor",
    finance: "landmark",
    users: "users",
    roadmap: "sparkle",
  };
  return iconMap[key] || "dashboard";
}
