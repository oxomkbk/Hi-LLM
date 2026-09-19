import { describe, expect, it } from 'vitest'

import { getAuthoringCompletion, getAuthoringStageSections } from './workspace-model'

describe('authoring workspace model', () => {
  it('returns only the sections that belong to the current stage', () => {
    const sections = [
      { key: 'content', stage: 'write' as const },
      { key: 'metadata', stage: 'publish' as const },
      { key: 'review', stage: 'publish' as const },
    ]

    expect(getAuthoringStageSections(sections, 'write')).toEqual(['content'])
    expect(getAuthoringStageSections(sections, 'publish')).toEqual(['metadata', 'review'])
  })

  it('calculates completion without treating an empty checklist as complete', () => {
    expect(getAuthoringCompletion([])).toEqual({ completed: 0, percent: 0, total: 0 })
    expect(getAuthoringCompletion([{ completed: true }, { completed: false }, { completed: true }])).toEqual({ completed: 2, percent: 67, total: 3 })
  })
})
