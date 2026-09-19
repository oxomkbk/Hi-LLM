import { describe, expect, it } from 'vitest'

import { analyzePromptPayload } from '../ai-security/adapters/prompt-analysis'
import {
  DEVELOPMENT_TERMINOLOGY_CATEGORIES,
  DEVELOPMENT_TERMINOLOGY_COLLECTIONS,
  DEVELOPMENT_TERMINOLOGY_ROOT_CATEGORY_SLUG,
} from './development-terminology-data'
import { parsePromptGlossaryContent, promptGlossaryItemCount } from './glossary'

const FORBIDDEN_SOURCE_PATTERN = /vibe.?hub|\boil\b|oiloil\.org|https?:\/\/|www\./i

describe('development terminology seed data', () => {
  it('contains thirteen valid collections and exactly 281 unique terms', () => {
    expect(DEVELOPMENT_TERMINOLOGY_COLLECTIONS).toHaveLength(13)
    const terms = new Set<string>()
    const ids = new Set<string>()
    let total = 0

    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      const parsed = parsePromptGlossaryContent(JSON.stringify(collection.document))
      expect(parsed, collection.slug).not.toBeNull()
      const count = promptGlossaryItemCount(parsed!)
      expect(count, collection.slug).toBe(collection.expectedCount)
      total += count
      for (const section of parsed!.sections) {
        for (const item of section.items) {
          expect(terms.has(item.term), item.term).toBe(false)
          expect(ids.has(`${collection.slug}:${item.id}`), item.id).toBe(false)
          terms.add(item.term)
          ids.add(`${collection.slug}:${item.id}`)
        }
      }
    }

    expect(total).toBe(281)
    expect(terms.size).toBe(281)
  })

  it('uses a stable non-public ownership id and maps every collection to a child category', () => {
    const categorySlugs = new Set(DEVELOPMENT_TERMINOLOGY_CATEGORIES.map(category => category.slug))
    const sourceIds = DEVELOPMENT_TERMINOLOGY_COLLECTIONS.map(collection => collection.sourceImportId)
    expect(new Set(sourceIds).size).toBe(13)
    expect(DEVELOPMENT_TERMINOLOGY_CATEGORIES).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'adaptation', parentSlug: null, slug: DEVELOPMENT_TERMINOLOGY_ROOT_CATEGORY_SLUG }),
    ]))
    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      expect(categorySlugs.has(collection.childCategorySlug), collection.childCategorySlug).toBe(true)
      expect(collection.sourceImportId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })

  it('does not carry source branding, domains or links into public content', () => {
    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      const publicContent = JSON.stringify({
        compatibility: collection.compatibility,
        document: collection.document,
        summary: collection.summary,
        tags: collection.tags,
        title: collection.title,
      })
      expect(publicContent, collection.slug).not.toMatch(FORBIDDEN_SOURCE_PATTERN)
    }
  })

  it('passes the built-in static prompt safety analysis', () => {
    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      const findings = analyzePromptPayload({
        assets: [],
        documents: [{
          content: JSON.stringify(collection.document),
          language: 'prompt-glossary+json',
          path: 'glossary.json',
          role: 'primary',
        }],
      })
      expect(findings, collection.slug).toEqual([])
    }
  })
})
