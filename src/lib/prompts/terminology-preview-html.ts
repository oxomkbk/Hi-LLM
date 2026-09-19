import type { PromptGlossaryItem } from './glossary'

export type TerminologyPreviewCatalog = Readonly<Record<string, string>>

export function codePreview(lines: readonly string[], result?: string) {
  const code = `<div class="pv-code">${lines.map(line => `<span>${escapeText(line)}</span>`).join('')}</div>`
  return result
    ? stage(`${code}<span class="pv-arrow">→</span><div class="pv-pane pv-pane-accent"><strong>${escapeText(result)}</strong></div>`)
    : stage(code)
}

export function comparePreview(before: string, after: string, beforeDetail: string, afterDetail: string) {
  return stage(`<div class="pv-compare"><div class="pv-pane"><small>之前</small><strong>${escapeHtml(before)}</strong><span>${escapeHtml(beforeDetail)}</span></div><span class="pv-arrow">→</span><div class="pv-pane pv-pane-accent"><small>之后</small><strong>${escapeHtml(after)}</strong><span>${escapeHtml(afterDetail)}</span></div></div>`)
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

export function flowPreview(steps: readonly string[], activeIndex = -1, successIndex = -1) {
  return stage(steps.map((step, index) => {
    const stateClass = index === activeIndex
      ? ' pv-node-accent'
      : index === successIndex ? ' pv-node-success' : ''
    const arrow = index < steps.length - 1 ? '<span class="pv-arrow">→</span>' : ''
    return `<span class="pv-node${stateClass}">${escapeHtml(step)}</span>${arrow}`
  }).join(''))
}

export function formPreview(fields: readonly (readonly [string, string])[], action = '提交') {
  return stage(`<div class="pv-form">${fields.map(([label, value]) => `<div class="pv-form-row"><small>${escapeHtml(label)}</small><span class="pv-field">${escapeHtml(value)}</span></div>`).join('')}<span class="pv-button">${escapeHtml(action)}</span></div>`)
}

export function itemSummary(item: PromptGlossaryItem) {
  return `${item.label}：${item.description}`
}

export function layoutPreview(name: string, content: string) {
  return stage(`<div class="pv-layout" data-name="${escapeHtml(name)}">${content}</div>`)
}

export function listPreview(rows: readonly (readonly [string, string])[]) {
  return stage(`<div class="pv-list">${rows.map(([title, detail]) => `<div class="pv-list-item"><div class="pv-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div></div>`).join('')}</div>`)
}

export function metricPreview(metrics: readonly (readonly [string, string, string?])[]) {
  return stage(metrics.map(([label, value, detail]) => `<div class="pv-stat"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</div>`).join(''))
}

export function stage(content: string, name?: string) {
  const dataName = name ? ` data-name="${escapeHtml(name)}"` : ''
  return `<div class="pv-stage"${dataName}>${content}</div>`
}

export function windowPreview(title: string, body: string, action?: string) {
  return stage(`<div class="pv-window"><div class="pv-bar"><span class="pv-dot"></span><span class="pv-dot"></span><span class="pv-dot"></span><strong>${escapeHtml(title)}</strong></div><div class="pv-body">${body}${action ? `<span class="pv-button">${escapeHtml(action)}</span>` : ''}</div></div>`)
}

function escapeText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
