import { describe, expect, it, vi } from 'vitest'

import { DEVELOPMENT_TERMINOLOGY_COLLECTIONS } from './development-terminology-data'
import { buildDevelopmentTerminologyPreviewDocuments } from './development-terminology-previews'
import { parseAndValidateGlossaryPreviewBundle } from './glossary-preview-security'

vi.mock('server-only', () => ({}))

describe('development terminology previews', () => {
  it('builds a complete safe backend preview for all 281 terms', () => {
    let total = 0
    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      const bundle = parseAndValidateGlossaryPreviewBundle(
        buildDevelopmentTerminologyPreviewDocuments(collection),
        collection.document,
        { requireComplete: true },
      )
      expect(bundle).not.toBeNull()
      expect(Object.keys(bundle!.items)).toHaveLength(collection.expectedCount)
      total += Object.keys(bundle!.items).length
    }
    expect(total).toBe(281)
  })

  it('uses content-specific previews for the comparison terms', () => {
    const collection = DEVELOPMENT_TERMINOLOGY_COLLECTIONS.find(item => item.slug.includes('content'))!
    const bundle = parseAndValidateGlossaryPreviewBundle(buildDevelopmentTerminologyPreviewDocuments(collection), collection.document, { requireComplete: true })!
    expect(bundle.items.table?.html).toContain('<table')
    expect(bundle.items.table?.html).toContain('官网改版')
    expect(bundle.items.list?.html).toContain('评论者提交了一条评论')
    expect(bundle.items.card?.html).toContain('轻量双肩包')
  })

  it('never falls back to generic diagrams or duplicate preview HTML', () => {
    const previews = DEVELOPMENT_TERMINOLOGY_COLLECTIONS.flatMap((collection) => {
      const bundle = parseAndValidateGlossaryPreviewBundle(
        buildDevelopmentTerminologyPreviewDocuments(collection),
        collection.document,
        { requireComplete: true },
      )!
      return Object.values(bundle.items).map(item => item.html)
    })

    expect(previews).toHaveLength(281)
    expect(new Set(previews).size).toBe(281)
    for (const html of previews) {
      expect(html).not.toMatch(/原始需求|表达清楚|视觉规则应用后的结果|输入数据|可用结果/)
    }
  })

  it('gives every design style its own identifiable visual composition', () => {
    const collection = DEVELOPMENT_TERMINOLOGY_COLLECTIONS.find(item => item.slug.includes('design-styles'))!
    const bundle = parseAndValidateGlossaryPreviewBundle(
      buildDevelopmentTerminologyPreviewDocuments(collection),
      collection.document,
      { requireComplete: true },
    )!

    for (const item of collection.document.sections.flatMap(section => section.items)) {
      expect(bundle.items[item.id]?.html).toContain(`data-name="${item.id}"`)
    }
    expect(bundle.items['dark-ui']?.html).toContain('pv-dark-chart')
    expect(bundle.items['playful-illustration']?.html).toContain('pv-play-character')
    expect(bundle.items['organic-design']?.html).toContain('pv-leaf')
    expect(bundle.items.y2k?.html).toContain('ENTER.exe')
    expect(bundle.items.memphis?.html).toContain('pv-memphis-shape')
    expect(bundle.items['terminal-aesthetic']?.html).toContain('$ pnpm build')
  })
})
