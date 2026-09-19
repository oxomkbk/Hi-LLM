import { describe, expect, it } from 'vitest'

import {
  buildPromptCategoryRows,
  createPromptCategoryFormState,
  promptCategoryNameGridTemplate,
  summarizePromptCategories,
} from './prompt-category-model'

import type { PromptCategory } from '@/types'

const timestamp = '2026-08-31T12:00:00.000Z'

function category(overrides: Partial<PromptCategory> & Pick<PromptCategory, 'id' | 'name'>): PromptCategory {
  return {
    active: true,
    created_at: timestamp,
    description: null,
    kind: null,
    parent_id: null,
    slug: overrides.id,
    sort: 1,
    updated_at: timestamp,
    ...overrides,
  }
}

describe('buildPromptCategoryRows', () => {
  it('preserves API order while placing each root children directly after it', () => {
    const rows = buildPromptCategoryRows([
      category({ id: 'child-b', name: 'B 子分类', parent_id: 'root-b' }),
      category({ id: 'root-a', name: 'A 根分类', kind: 'image' }),
      category({ id: 'child-a-2', name: 'A 子分类二', parent_id: 'root-a' }),
      category({ id: 'root-b', name: 'B 根分类', kind: 'video' }),
      category({ id: 'child-a-1', name: 'A 子分类一', parent_id: 'root-a' }),
    ])

    expect(rows.map(row => row.category.id)).toEqual([
      'root-a',
      'child-a-2',
      'child-a-1',
      'root-b',
      'child-b',
    ])
    expect(rows.map(row => row.depth)).toEqual([0, 1, 1, 0, 1])
  })

  it('appends missing-parent categories as orphan rows after complete root groups', () => {
    const rows = buildPromptCategoryRows([
      category({ id: 'orphan', name: '失联分类', parent_id: 'missing-root' }),
      category({ id: 'root', name: '根分类', kind: 'web_ui' }),
      category({ id: 'child', name: '子分类', parent_id: 'root' }),
    ])

    expect(rows.map(row => ({ id: row.category.id, orphan: row.orphan }))).toEqual([
      { id: 'root', orphan: false },
      { id: 'child', orphan: false },
      { id: 'orphan', orphan: true },
    ])
  })

  it('shows root type labels and lets child rows inherit their parent type', () => {
    const rows = buildPromptCategoryRows([
      category({ id: 'known-root', name: '图片', kind: 'image' }),
      category({ id: 'child', name: '图片子分类', parent_id: 'known-root' }),
      category({ id: 'general-root', name: '通用', kind: null }),
      category({ id: 'legacy-root', name: '旧数据', kind: 'legacy' as PromptCategory['kind'] }),
    ])

    expect(rows.map(row => row.kindLabel)).toEqual([
      '图片',
      '继承上级',
      '通用',
      '通用',
    ])
  })
})

describe('promptCategoryNameGridTemplate', () => {
  it('keeps root category content in a visible column', () => {
    expect(promptCategoryNameGridTemplate(0)).toBe('minmax(0, 1fr)')
  })

  it('reserves a separate tree marker column for child categories', () => {
    expect(promptCategoryNameGridTemplate(1)).toBe('1.25rem minmax(0, 1fr)')
  })
})

describe('createPromptCategoryFormState', () => {
  it('maps every editable root field without losing its content type', () => {
    expect(createPromptCategoryFormState(category({
      active: false,
      description: '根分类说明',
      id: 'root',
      kind: 'general',
      name: '根分类',
      slug: 'root-slug',
      sort: 88,
    }))).toEqual({
      active: false,
      description: '根分类说明',
      id: 'root',
      kind: 'general',
      name: '根分类',
      parentId: '',
      slug: 'root-slug',
      sort: 88,
    })
  })

  it('maps a child parent while supplying the hidden root-kind fallback', () => {
    expect(createPromptCategoryFormState(category({
      id: 'child',
      name: '子分类',
      parent_id: 'root',
    }))).toMatchObject({
      id: 'child',
      kind: 'web_ui',
      parentId: 'root',
    })
  })
})

describe('summarizePromptCategories', () => {
  it('counts all records including inactive and orphan children', () => {
    const summary = summarizePromptCategories([
      category({ id: 'root-a', name: '根分类 A' }),
      category({ active: false, id: 'child-a', name: '子分类 A', parent_id: 'root-a' }),
      category({ id: 'root-b', name: '根分类 B' }),
      category({ active: false, id: 'orphan', name: '失联分类', parent_id: 'missing-root' }),
    ])

    expect(summary).toEqual({
      children: 2,
      inactive: 2,
      roots: 2,
      total: 4,
    })
  })
})
