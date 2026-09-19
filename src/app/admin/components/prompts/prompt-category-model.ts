import { PROMPT_CONTENT_KINDS } from '../../../../lib/prompts'

import type { PromptCategory } from '@/types'

export interface PromptCategoryFormState {
  active: boolean
  description: string
  id: string
  kind: string
  name: string
  parentId: string
  slug: string
  sort: number
}

export interface PromptCategorySummary {
  children: number
  inactive: number
  roots: number
  total: number
}

export interface PromptCategoryTableRow {
  category: PromptCategory
  depth: 0 | 1
  kindLabel: string
  orphan: boolean
}

const kindLabels = new Map<string, string>(PROMPT_CONTENT_KINDS.map(kind => [kind.value, kind.label]))

export function buildPromptCategoryRows(categories: PromptCategory[]): PromptCategoryTableRow[] {
  const roots = categories.filter(category => !category.parent_id)
  const rootIds = new Set(roots.map(category => category.id))
  const rows: PromptCategoryTableRow[] = []

  for (const root of roots) {
    rows.push(toRow(root, 0, false))
    for (const child of categories.filter(category => category.parent_id === root.id))
      rows.push(toRow(child, 1, false))
  }

  for (const orphan of categories.filter(category => category.parent_id && !rootIds.has(category.parent_id)))
    rows.push(toRow(orphan, 1, true))

  return rows
}

export function createPromptCategoryFormState(category: PromptCategory): PromptCategoryFormState {
  return {
    active: category.active,
    description: category.description ?? '',
    id: category.id,
    kind: category.kind ?? 'web_ui',
    name: category.name,
    parentId: category.parent_id ?? '',
    slug: category.slug,
    sort: category.sort,
  }
}

export function promptCategoryNameGridTemplate(depth: 0 | 1) {
  return depth === 0 ? 'minmax(0, 1fr)' : '1.25rem minmax(0, 1fr)'
}

export function summarizePromptCategories(categories: PromptCategory[]): PromptCategorySummary {
  const roots = categories.filter(category => !category.parent_id).length
  return {
    children: categories.length - roots,
    inactive: categories.filter(category => !category.active).length,
    roots,
    total: categories.length,
  }
}

function toRow(category: PromptCategory, depth: 0 | 1, orphan: boolean): PromptCategoryTableRow {
  return {
    category,
    depth,
    kindLabel: depth === 1 ? '继承上级' : (kindLabels.get(category.kind ?? '') ?? '通用'),
    orphan,
  }
}
