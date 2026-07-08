import { badge, renderTable } from "../ui/components.js";
import { escapeHtml, formatNumber } from "../lib/format.js";
import { canEdit } from "../lib/state.js";

function percent(value) {
  return `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}%`;
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${formatNumber(size)} B`;
}

function statusLabel(status) {
  const map = {
    imported: "已导入",
    skipped: "已跳过",
    unsupported: "暂不支持",
    error: "异常",
  };
  return map[status] || status || "未知";
}

function filterRuns(runs = [], filters = {}) {
  const date = filters.date || "";
  const shift = filters.shift || "";
  const machineType = filters.machineType || "";
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  return runs.filter((run) => {
    if (date && run.shiftDate !== date) return false;
    if (shift && run.shift !== shift) return false;
    if (machineType && run.machineType !== machineType) return false;
    if (keyword) {
      const haystack = [
        run.machineId,
        run.machineName,
        run.machineType,
        run.planNo,
        run.orderNo,
        run.batchNo,
        run.operator,
        run.sourceFileName,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function runTotals(runs = []) {
  const inputQty = runs.reduce((total, run) => total + Number(run.inputQty || 0), 0);
  const outputQty = runs.reduce((total, run) => total + Number(run.outputQty || 0), 0);
  const goodQty = runs.reduce((total, run) => total + Number(run.goodQty || 0), 0);
  const ngQty = runs.reduce((total, run) => total + Number(run.ngQty || 0), 0);
  return {
    inputQty,
    outputQty,
    goodQty,
    ngQty,
    yieldRate: inputQty ? (goodQty / inputQty) * 100 : 0,
  };
}

function groupByMachine(runs = []) {
  const map = new Map();
  runs.forEach((run) => {
    const key = run.machineId || run.machineName || "未识别机台";
    const existing = map.get(key) || {
      machineId: run.machineId || "",
      machineName: run.machineName || key,
      machineType: run.machineType || "",
      runCount: 0,
      inputQty: 0,
      outputQty: 0,
      goodQty: 0,
      ngQty: 0,
    };
    existing.runCount += 1;
    existing.inputQty += Number(run.inputQty || 0);
    existing.outputQty += Number(run.outputQty || 0);
    existing.goodQty += Number(run.goodQty || 0);
    existing.ngQty += Number(run.ngQty || 0);
    map.set(key, existing);
  });
  return [...map.values()]
    .map((item) => ({
      ...item,
      yieldRate: item.inputQty ? (item.goodQty / item.inputQty) * 100 : 0,
    }))
    .sort((a, b) => b.outputQty - a.outputQty);
}

function uniqueDates(runs = []) {
  return [...new Set(runs.map((run) => run.shiftDate).filter(Boolean))].sort().reverse();
}

function fileStats(files = []) {
  return {
    total: files.length,
    imported: files.filter((file) => file.status === "已导入").length,
    pending: files.filter((file) => file.status === "待扫描").length,
    unsupported: files.filter((file) => file.status === "暂不支持").length,
  };
}

export function renderMachineStats(state, auth = {}) {
  const editable = canEdit(auth?.currentUser, "machine") && auth?.currentUser?.role === "admin";
  const config = state.machineDataConfig || {};
  const filters = state.ui?.machineRunFilters || {};
  const runs = filterRuns(state.machineRuns || [], filters);
  const totals = runTotals(runs);
  const machineRows = groupByMachine(runs);
  const logs = (state.machineDataLogs || []).slice(0, 80);
  const dates = uniqueDates(state.machineRuns || []);
  const lastSummary = logs[0];
  const fileFilters = state.ui?.machineDataFileFilters || {};
  const hasLoadedUiFiles = state.ui?.machineDataFilesLoaded === true;
  const files = hasLoadedUiFiles ? state.ui?.machineDataFiles || [] : state.machineDataFiles || [];
  const filesTotal = state.ui?.machineDataFileTotal || files.length;
  const fileSummary = fileStats(files);
  const testerPath = [config.nasPath, config.testerDir || "测试机", config.testerDataDir || "测试档"].filter(Boolean).join("/");
  const sorterPath = [config.nasPath, config.sorterDir || "分选机", config.sorterDataDir || "CN"].filter(Boolean).join("/");

  const runColumns = [
    { label: "完工时间", render: (row) => `${escapeHtml(row.finishedAt || "-")}<div class="small">${escapeHtml(row.shiftDate || "-")} · ${escapeHtml(row.shift || "-")}</div>` },
    { label: "机台", render: (row) => `${escapeHtml(row.machineName || row.machineId || "-")}<div class="small">${escapeHtml(row.machineType || "-")}</div>` },
    { label: "计划 / 批次", render: (row) => `${escapeHtml(row.planNo || row.orderNo || "-")}<div class="small">${escapeHtml(row.batchNo || "-")}</div>` },
    { label: "数量", render: (row) => `投入 ${formatNumber(row.inputQty)}<div class="small">产出 ${formatNumber(row.outputQty)} · 良品 ${formatNumber(row.goodQty)} · NG ${formatNumber(row.ngQty)}</div>` },
    { label: "良率", render: (row) => `<strong>${percent(row.yieldRate)}</strong>` },
    { label: "来源", render: (row) => `${escapeHtml(row.sourceFileName || "-")}<div class="small">${escapeHtml(row.operator || "")}</div>` },
  ];

  const machineColumns = [
    { label: "机台", render: (row) => `${escapeHtml(row.machineName || row.machineId)}<div class="small">${escapeHtml(row.machineType || "-")}</div>` },
    { label: "运行次数", render: (row) => formatNumber(row.runCount) },
    { label: "投入", render: (row) => formatNumber(row.inputQty) },
    { label: "产出", render: (row) => formatNumber(row.outputQty) },
    { label: "良品 / NG", render: (row) => `${formatNumber(row.goodQty)} / ${formatNumber(row.ngQty)}` },
    { label: "良率", render: (row) => `<strong>${percent(row.yieldRate)}</strong>` },
  ];

  const logColumns = [
    { label: "时间", render: (row) => escapeHtml(row.scannedAt || "-") },
    { label: "文件", render: (row) => `${escapeHtml(row.fileName || "-")}<div class="small">${escapeHtml(row.filePath || "")}</div>` },
    { label: "状态", render: (row) => badge(statusLabel(row.status)) },
    { label: "结果", render: (row) => `${escapeHtml(row.message || "-")}<div class="small">导入 ${formatNumber(row.importedCount || 0)} 条</div>` },
  ];

  const fileColumns = [
    {
      label: "文件",
      render: (row) => `${escapeHtml(row.fileName || "-")}<div class="small">${escapeHtml(row.relativePath || "")}</div>`,
    },
    {
      label: "机台",
      render: (row) => `${escapeHtml(row.machineFolder || "-")}<div class="small">${escapeHtml(row.machineType || "-")}${row.dataDir ? ` · ${escapeHtml(row.dataDir)}` : ""}</div>`,
    },
    { label: "格式", render: (row) => `${escapeHtml(row.ext || "-")}<div class="small">${formatBytes(row.size)}</div>` },
    { label: "修改时间", render: (row) => escapeHtml(row.modifiedAt || "-") },
    { label: "状态", render: (row) => badge(row.status || "未知") },
    {
      label: "操作",
      render: (row) =>
        row.canOpen
          ? `<button class="btn mini" type="button" data-action="machine-data-open-folder" data-path="${escapeHtml(row.folderPath || "")}">打开目录</button>`
          : `<span class="small">采集器同步</span>`,
    },
  ];

  return `
    <div class="page-stack machine-stats-page">
      <section class="panel machine-stats-hero">
        <div class="panel-header">
          <div>
            <h3>NAS 机台数据采集</h3>
            <p>正式环境推荐由 NAS Docker 采集器读取文件并上传统计结果；本机扫描只用于同局域网调试。</p>
          </div>
          <div class="header-actions">
            <button class="btn" type="button" data-action="machine-data-open-folder" data-path="${escapeHtml(config.nasPath || "")}" ${editable && config.nasPath ? "" : "disabled"}>打开 NAS</button>
            <button class="btn primary" type="button" data-action="machine-data-scan" ${editable && config.nasPath ? "" : "disabled"}>扫描本机文件</button>
          </div>
        </div>
        <form class="machine-data-config" data-form="machine-data-config">
          <div class="field full">
            <label for="nasPath">NAS 团队空间路径</label>
            <input id="nasPath" name="nasPath" type="text" value="${escapeHtml(config.nasPath || "")}" placeholder="/Users/stephen/kh-erp-nas" ${editable ? "" : "disabled"} required />
          </div>
          <div class="field">
            <label for="testerDir">测试机大类文件夹</label>
            <input id="testerDir" name="testerDir" type="text" value="${escapeHtml(config.testerDir || "测试机")}" ${editable ? "" : "disabled"} />
          </div>
          <div class="field">
            <label for="sorterDir">分选机大类文件夹</label>
            <input id="sorterDir" name="sorterDir" type="text" value="${escapeHtml(config.sorterDir || "分选机")}" ${editable ? "" : "disabled"} />
          </div>
          <div class="field">
            <label for="testerDataDir">测试机数据子目录</label>
            <input id="testerDataDir" name="testerDataDir" type="text" value="${escapeHtml(config.testerDataDir || "测试档")}" placeholder="测试档" ${editable ? "" : "disabled"} />
          </div>
          <div class="field">
            <label for="sorterDataDir">分选机数据子目录</label>
            <input id="sorterDataDir" name="sorterDataDir" type="text" value="${escapeHtml(config.sorterDataDir || "CN")}" placeholder="CN" ${editable ? "" : "disabled"} />
          </div>
          <div class="field">
            <label for="dayShiftStart">白班开始</label>
            <input id="dayShiftStart" name="dayShiftStart" type="time" value="${escapeHtml(config.dayShiftStart || "08:00")}" ${editable ? "" : "disabled"} />
          </div>
          <div class="field">
            <label for="nightShiftStart">夜班开始</label>
            <input id="nightShiftStart" name="nightShiftStart" type="time" value="${escapeHtml(config.nightShiftStart || "20:00")}" ${editable ? "" : "disabled"} />
          </div>
          <div class="form-actions">
            <button class="btn" type="submit" ${editable ? "" : "disabled"}>保存配置</button>
          </div>
        </form>
        <div class="machine-data-note">
          <span>最近扫描：${escapeHtml(config.lastScanAt || "未扫描")}</span>
          <span>最近结果：${escapeHtml(lastSummary?.message || "暂无导入日志")}</span>
          <span>目录结构示例：团队空间 / 测试机 / 测试档 / P41 / CSV；团队空间 / 分选机 / CN / S034 / 数据文件。</span>
          <span>Docker 采集器会上传文件索引、班次统计和异常日志，不会把原始 CSV 全量存到服务器。</span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>NAS 文件浏览</h3>
            <p>线上展示采集器上传的文件索引；本机同局域网调试时也可以直接读取挂载目录。</p>
          </div>
          <div class="header-actions">
            <button class="btn" type="button" data-action="machine-data-open-folder" data-path="${escapeHtml(testerPath)}" ${editable && config.nasPath ? "" : "disabled"}>打开测试机</button>
            <button class="btn" type="button" data-action="machine-data-open-folder" data-path="${escapeHtml(sorterPath)}" ${editable && config.nasPath ? "" : "disabled"}>打开分选机</button>
            <button class="btn primary" type="button" data-action="machine-data-refresh-files" ${editable ? "" : "disabled"}>刷新文件列表</button>
          </div>
        </div>
        <div class="filter-bar compact">
          <label class="filter-field">
            <span>机台类型</span>
            <select data-machine-file-filter="machineType">
              <option value="">全部类型</option>
              ${["测试机", "分选机"].map((type) => `<option value="${escapeHtml(type)}" ${fileFilters.machineType === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>机台 / 文件</span>
            <input type="search" data-machine-file-filter="machineKeyword" value="${escapeHtml(fileFilters.machineKeyword || "")}" placeholder="p09、文件名、批次" />
          </label>
          <label class="filter-field">
            <span>格式</span>
            <select data-machine-file-filter="ext">
              <option value="">全部格式</option>
              ${[".csv", ".tsv", ".txt", ".xlsx", ".xls"].map((ext) => `<option value="${escapeHtml(ext)}" ${fileFilters.ext === ext ? "selected" : ""}>${escapeHtml(ext)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>导入状态</span>
            <select data-machine-file-filter="status">
              <option value="">全部状态</option>
              ${["待扫描", "已导入", "暂不支持", "已跳过"].map((status) => `<option value="${escapeHtml(status)}" ${fileFilters.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>修改起始</span>
            <input type="datetime-local" data-machine-file-filter="modifiedFrom" value="${escapeHtml(fileFilters.modifiedFrom || "")}" />
          </label>
          <label class="filter-field">
            <span>修改结束</span>
            <input type="datetime-local" data-machine-file-filter="modifiedTo" value="${escapeHtml(fileFilters.modifiedTo || "")}" />
          </label>
          <button class="btn ghost" type="button" data-action="machine-file-filter-reset">重置</button>
        </div>
        <div class="stats-grid compact-stats">
          <div class="stats-card"><span>筛选文件</span><strong>${formatNumber(fileSummary.total)}</strong><small>NAS 总数 ${formatNumber(filesTotal)}</small></div>
          <div class="stats-card"><span>待扫描</span><strong>${formatNumber(fileSummary.pending)}</strong><small>CSV/TSV/TXT</small></div>
          <div class="stats-card"><span>已导入</span><strong>${formatNumber(fileSummary.imported)}</strong><small>已有运行记录</small></div>
          <div class="stats-card"><span>暂不支持</span><strong>${formatNumber(fileSummary.unsupported)}</strong><small>Excel 原文件</small></div>
        </div>
        ${renderTable(fileColumns, files, { pageKey: "machineDataFiles", ui: state.ui, pageSize: 10, pageSizes: [10, 20, 50, 100] })}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>班次统计</h3>
            <p>按完工时间归属班次，夜班凌晨数据归到前一生产日期。</p>
          </div>
        </div>
        <div class="filter-bar compact">
          <label class="filter-field">
            <span>生产日期</span>
            <select data-machine-run-filter="date">
              <option value="">全部日期</option>
              ${dates.map((date) => `<option value="${escapeHtml(date)}" ${filters.date === date ? "selected" : ""}>${escapeHtml(date)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>班次</span>
            <select data-machine-run-filter="shift">
              <option value="">全部班次</option>
              ${["白班", "夜班", "未识别"].map((shift) => `<option value="${escapeHtml(shift)}" ${filters.shift === shift ? "selected" : ""}>${escapeHtml(shift)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>机台类型</span>
            <select data-machine-run-filter="machineType">
              <option value="">全部类型</option>
              ${["测试机", "分选机"].map((type) => `<option value="${escapeHtml(type)}" ${filters.machineType === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>关键词</span>
            <input type="search" data-machine-run-filter="keyword" value="${escapeHtml(filters.keyword || "")}" placeholder="机台、计划、批次、文件名" />
          </label>
          <button class="btn ghost" type="button" data-action="machine-run-filter-reset">重置</button>
        </div>
        <div class="stats-grid compact-stats">
          <div class="stats-card"><span>运行记录</span><strong>${formatNumber(runs.length)}</strong><small>筛选范围内</small></div>
          <div class="stats-card"><span>投入数量</span><strong>${formatNumber(totals.inputQty)}</strong><small>原始报表汇总</small></div>
          <div class="stats-card"><span>产出数量</span><strong>${formatNumber(totals.outputQty)}</strong><small>完成量</small></div>
          <div class="stats-card"><span>综合良率</span><strong>${percent(totals.yieldRate)}</strong><small>良品 / 投入</small></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>机台产出排行</h3>
            <p>用于快速看出班次内哪些机台产出高、良率异常。</p>
          </div>
        </div>
        ${renderTable(machineColumns, machineRows, { pageKey: "machineRunMachines", ui: state.ui, pageSize: 10 })}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>机台运行记录</h3>
            <p>每个文件可导入一条或多条运行记录，保留原始文件名用于追溯。</p>
          </div>
        </div>
        ${renderTable(runColumns, runs, { pageKey: "machineRuns", ui: state.ui, pageSize: 20 })}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>导入日志与异常文件</h3>
            <p>用于检查 Excel 未解析、文件格式不识别或表头缺失的问题。</p>
          </div>
        </div>
        ${renderTable(logColumns, logs, { pageKey: "machineDataLogs", ui: state.ui, pageSize: 10 })}
      </section>
    </div>
  `;
}
