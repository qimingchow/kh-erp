import { escapeHtml } from "../lib/format.js";
import { icon } from "../lib/icons.js";

const statusTone = {
  正常: "ok",
  运行: "ok",
  已完成: "ok",
  合格: "ok",
  已收: "ok",
  已付: "ok",
  待检: "warn",
  待收: "warn",
  待付: "warn",
  待排产: "info",
  待入库: "warn",
  进行中: "info",
  已入库: "ok",
  暂停: "warn",
  维护: "danger",
  维护中: "warn",
  异常: "danger",
  故障: "danger",
  低库存: "warn",
  偏低: "warn",
  缺货: "danger",
  启用: "ok",
  停用: "danger",
  在线: "ok",
  离线: "neutral",
  紧急: "danger",
  加急: "danger",
  高: "warn",
  中: "info",
  标准: "info",
  普通: "ok",
  低: "ok",
  已发货: "info",
  运输中: "warn",
  已签收: "ok",
  待发货: "warn",
  部分收款: "warn",
  逾期: "danger",
  分选机: "info",
  测试机: "ok",
};

export function badge(text) {
  const tone = statusTone[text] || "neutral";
  return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
}

export function fieldOptionsHtml(options, selectedValue) {
  return options
    .map(
      (option) => `
        <option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>
          ${escapeHtml(option.label)}
        </option>
      `,
    )
    .join("");
}

export function renderField(field, value = "") {
  const label = `<label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>`;
  const common = `id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" ${field.required === false ? "" : "required"}`;
  const wrapperClass = `field ${field.full ? "full" : ""}`;

  let control = "";
  if (field.type === "select") {
    control = `<select ${common}>${fieldOptionsHtml(field.options, value ?? field.defaultValue ?? "")}</select>`;
  } else if (field.type === "textarea") {
    control = `<textarea ${common} placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value ?? field.defaultValue ?? "")}</textarea>`;
  } else {
    const inputType = field.type || "text";
    const currentValue = value ?? field.defaultValue ?? "";
    const min = field.min !== undefined ? `min="${field.min}"` : "";
    const max = field.max !== undefined ? `max="${field.max}"` : "";
    const step = field.step !== undefined ? `step="${field.step}"` : "";
    control = `<input ${common} type="${escapeHtml(inputType)}" value="${escapeHtml(currentValue)}" placeholder="${escapeHtml(field.placeholder || "")}" ${min} ${max} ${step} />`;
  }

  return `<div class="${wrapperClass}">${label}${control}</div>`;
}

export function renderCheckboxGroup(name, label, options, selectedValues = [], description = "") {
  const values = new Set((selectedValues || []).map((value) => String(value)));
  return `
    <section class="check-panel">
      <div class="check-panel-head">
        <div class="check-panel-title">${escapeHtml(label)}</div>
        ${description ? `<div class="small">${escapeHtml(description)}</div>` : ""}
      </div>
      <div class="check-grid">
        ${options
          .map(
            (option, index) => {
              const id = `${name}-${String(index + 1).padStart(2, "0")}-${String(option.value).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "")}`;
              return `
              <label class="check-item">
                <input id="${escapeHtml(id)}" type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(option.value)}" ${values.has(String(option.value)) ? "checked" : ""} />
                <span>${escapeHtml(option.label)}</span>
              </label>
            `;
            },
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderForm(formKey, fields, submitLabel, values = {}) {
  return `
    <form class="stack" data-form="${escapeHtml(formKey)}">
      <div class="field-grid">
        ${fields.map((field) => renderField(field, values[field.name])).join("")}
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit">
          <span class="icon">${icon("plus")}</span>
          ${escapeHtml(submitLabel)}
        </button>
      </div>
    </form>
  `;
}

export function renderTable(columns, rows) {
  if (!rows.length) return `<div class="empty">当前还没有记录。</div>`;

  return `
    <div class="record-list">
      ${rows
        .map(
          (row) => `
            <article class="record-card">
              ${columns
                .map((column) => {
                  const isAction = column.label === "操作";
                  return `
                    <div class="record-card-field ${isAction ? "record-card-actions" : ""}">
                      <span>${escapeHtml(column.label)}</span>
                      <div>${column.render(row)}</div>
                    </div>
                  `;
                })
                .join("")}
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="table-wrap responsive-table" aria-label="桌面表格">
      <table>
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${columns.map((column) => `<td>${column.render(row)}</td>`).join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function panel(title, description, body, aside = "") {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        ${aside}
      </div>
      ${body}
    </section>
  `;
}
