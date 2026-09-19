import type { PromptDocument } from '@/types'

export const PROMPT_GLOSSARY_LANGUAGE = 'prompt-glossary+json'
export const PROMPT_GLOSSARY_KIND = 'development-terminology'
export const PROMPT_GLOSSARY_SCHEMA_VERSION = 1

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface FilteredPromptGlossary {
  sections: PromptGlossarySection[]
  total: number
}

export interface PromptGlossaryDocument {
  intro: string
  kind: typeof PROMPT_GLOSSARY_KIND
  schemaVersion: typeof PROMPT_GLOSSARY_SCHEMA_VERSION
  sections: PromptGlossarySection[]
}

export interface PromptGlossaryItem {
  aliases: string[]
  description: string
  id: string
  label: string
  prompt: string
  term: string
}

export interface PromptGlossarySection {
  description: string
  id: string
  items: PromptGlossaryItem[]
  order: number
  title: string
}

export function filterPromptGlossary(
  document: PromptGlossaryDocument,
  query: string,
  sectionId = 'all',
): FilteredPromptGlossary {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  const sections = document.sections
    .filter(section => sectionId === 'all' || section.id === sectionId)
    .map(section => ({
      ...section,
      items: section.items.filter((item) => {
        if (!tokens.length)
          return true
        const searchable = normalizeSearchText([
          item.term,
          item.label,
          item.description,
          item.prompt,
          ...item.aliases,
        ].join(' '))
        return tokens.every(token => searchable.includes(token))
      }),
    }))
    .filter(section => section.items.length > 0)

  return {
    sections,
    total: sections.reduce((total, section) => total + section.items.length, 0),
  }
}

export function formatPromptGlossaryMarkdown(document: PromptGlossaryDocument, title: string) {
  const lines = [`# ${title}`, '', document.intro]
  for (const [sectionIndex, section] of document.sections.entries()) {
    lines.push('', `## ${String(sectionIndex + 1).padStart(2, '0')} · ${section.title}`, '', section.description)
    for (const item of section.items) {
      lines.push(
        '',
        `### ${item.label}（${item.term}）`,
        '',
        item.description,
        '',
        '可直接表达：',
        '',
        `> ${item.prompt.replace(/\n+/g, ' ')}`,
      )
    }
  }
  return `${lines.join('\n').trim()}\n`
}

export function parsePromptGlossaryContent(content: string): PromptGlossaryDocument | null {
  try {
    return normalizeDocument(JSON.parse(content) as unknown)
  }
  catch {
    return null
  }
}

export function parsePromptGlossaryDocument(document: PromptDocument | null | undefined) {
  if (!document || document.language.trim().toLowerCase() !== PROMPT_GLOSSARY_LANGUAGE)
    return null
  return parsePromptGlossaryContent(document.content)
}

export function promptGlossaryItemCount(document: PromptGlossaryDocument) {
  return document.sections.reduce((total, section) => total + section.items.length, 0)
}

function normalizeDocument(value: unknown): PromptGlossaryDocument {
  const input = requireRecord(value)
  if (input.kind !== PROMPT_GLOSSARY_KIND || input.schemaVersion !== PROMPT_GLOSSARY_SCHEMA_VERSION)
    throw new TypeError('Unsupported glossary document')
  if (!Array.isArray(input.sections) || input.sections.length === 0)
    throw new TypeError('Glossary sections are required')

  const sectionIds = new Set<string>()
  const itemIds = new Set<string>()
  const sections = input.sections.map((value, sourceIndex) => {
    const section = requireRecord(value)
    const id = normalizeId(section.id)
    if (sectionIds.has(id))
      throw new TypeError(`Duplicate glossary section id: ${id}`)
    sectionIds.add(id)
    if (!Number.isSafeInteger(section.order) || Number(section.order) < 0 || Number(section.order) > 999)
      throw new TypeError(`Invalid glossary section order: ${id}`)
    if (!Array.isArray(section.items) || section.items.length === 0)
      throw new TypeError(`Glossary section has no items: ${id}`)

    const items = section.items.map((value) => {
      const item = requireRecord(value)
      const itemId = normalizeId(item.id)
      if (itemIds.has(itemId))
        throw new TypeError(`Duplicate glossary item id: ${itemId}`)
      itemIds.add(itemId)
      if (!Array.isArray(item.aliases))
        throw new TypeError(`Glossary aliases are required: ${itemId}`)
      const aliases = [...new Set(item.aliases.map(normalizeRequiredString))]
      return {
        aliases,
        description: normalizeRequiredString(item.description),
        id: itemId,
        label: normalizeRequiredString(item.label),
        prompt: normalizeRequiredString(item.prompt),
        term: normalizeRequiredString(item.term),
      } satisfies PromptGlossaryItem
    })

    return {
      description: normalizeRequiredString(section.description),
      id,
      items,
      order: Number(section.order),
      sourceIndex,
      title: normalizeRequiredString(section.title),
    }
  }).sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex).map(({ sourceIndex: _sourceIndex, ...section }) => section)

  return {
    intro: normalizeRequiredString(input.intro),
    kind: PROMPT_GLOSSARY_KIND,
    schemaVersion: PROMPT_GLOSSARY_SCHEMA_VERSION,
    sections,
  }
}

function normalizeId(value: unknown) {
  const id = normalizeRequiredString(value).toLowerCase()
  if (!ID_PATTERN.test(id))
    throw new TypeError(`Invalid glossary id: ${id}`)
  return id
}

function normalizeRequiredString(value: unknown) {
  if (typeof value !== 'string')
    throw new TypeError('Expected glossary string')
  const normalized = value.normalize('NFC').trim()
  if (!normalized)
    throw new TypeError('Glossary string cannot be empty')
  return normalized
}

function normalizeSearchText(value: string) {
  return value.normalize('NFC').trim().toLocaleLowerCase('zh-CN')
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected glossary object')
  return value as Record<string, unknown>
}
