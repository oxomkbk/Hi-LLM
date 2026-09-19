import { describe, expect, it } from 'vitest'

import { analyzePromptPayload } from '../ai-security/adapters/prompt-analysis'
import { DEVELOPMENT_TERMINOLOGY_COLLECTIONS } from './development-terminology-data'
import { DEVELOPMENT_TERMINOLOGY_SLUG_LIST } from './development-terminology-registry'
import {
  getGlossaryShowcaseDefinition,
  resolveGlossaryShowcase,
} from './glossary-showcase'

const FORBIDDEN_SOURCE_PATTERN = /vibe.?hub|\boil\b|oiloil\.org|https?:\/\/|www\./i

describe('glossary showcase registry', () => {
  it('uses the exact canonical seed slug set', () => {
    const seedSlugs = DEVELOPMENT_TERMINOLOGY_COLLECTIONS.map(collection => collection.slug).toSorted()
    expect(DEVELOPMENT_TERMINOLOGY_SLUG_LIST.toSorted()).toEqual(seedSlugs)
    expect(DEVELOPMENT_TERMINOLOGY_SLUG_LIST).toHaveLength(13)
  })

  it('resolves one safe example from the source glossary for every collection', () => {
    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      const definition = getGlossaryShowcaseDefinition(collection.slug)
      const resolved = resolveGlossaryShowcase(collection.slug, collection.document)
      expect(definition, collection.slug).not.toBeNull()
      expect(resolved, collection.slug).not.toBeNull()
      expect(resolved?.item.id).toBe(definition?.termId)

      const visibleAndCopiedContent = JSON.stringify({
        before: resolved?.before,
        outcome: resolved?.outcome,
        prompt: resolved?.item.prompt,
        term: resolved?.item.term,
      })
      expect(visibleAndCopiedContent, collection.slug).not.toMatch(FORBIDDEN_SOURCE_PATTERN)
      expect(analyzePromptPayload({
        assets: [],
        documents: [{
          content: resolved!.item.prompt,
          language: 'text',
          path: 'showcase.txt',
          role: 'prompt',
        }],
      }), collection.slug).toEqual([])
    }
  })
})
