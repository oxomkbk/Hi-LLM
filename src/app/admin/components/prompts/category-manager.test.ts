import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { CategoryTable } from './category-manager'

import type { PromptCategory } from '@/types'

vi.mock('@/lib/prompts', () => ({
  PROMPT_CONTENT_KINDS: [
    { label: '网页 UI', value: 'web_ui' },
    { label: '图片', value: 'image' },
  ],
}))

vi.mock('@/lib/request', () => ({ request: vi.fn() }))

const category: PromptCategory = {
  active: true,
  created_at: '2026-08-31T12:00:00.000Z',
  description: '测试分类',
  id: 'root-a',
  kind: 'web_ui',
  name: '根分类 A',
  parent_id: null,
  slug: 'root-a',
  sort: 10,
  updated_at: '2026-08-31T12:00:00.000Z',
}

function renderTable(options: { deleteError?: string | null, mutationPending?: boolean } = {}) {
  return renderToStaticMarkup(createElement(CategoryTable, {
    deleteCandidateId: '',
    deleteError: options.deleteError ?? null,
    deletingId: '',
    editButtonsRef: { current: new Map() },
    editingId: '',
    mutationPending: options.mutationPending ?? false,
    rows: [{ category, depth: 0, kindLabel: '网页 UI', orphan: false }],
    onDismissDeleteError: () => {},
    onEdit: () => {},
    onRemove: async () => {},
  }))
}

describe('categoryTable', () => {
  it('renders delete failures politely before the category grid', () => {
    const html = renderTable({ deleteError: '分类删除失败' })

    expect(html).toContain('aria-live="polite"')
    expect(html.indexOf('分类删除失败')).toBeLessThan(html.indexOf('aria-label="Prompt 分类列表"'))
  })

  it('disables every row action while a category mutation is pending', () => {
    const html = renderTable({ mutationPending: true })

    expect(html.match(/disabled=""/g)).toHaveLength(2)
  })

  it('keeps the category column as the row header in the five-column grid', () => {
    const html = renderTable()

    expect(html).toContain('aria-label="Prompt 分类列表"')
    expect(html).toContain('根分类 A')
    expect(html.match(/role="columnheader"/g)).toHaveLength(5)
    expect(html.match(/role="rowheader"/g)).toHaveLength(1)
  })
})
