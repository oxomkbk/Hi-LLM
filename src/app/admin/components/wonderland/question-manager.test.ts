import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./question-manager.tsx', import.meta.url), 'utf8')

describe('wonderland question manager moderation UI', () => {
  it('offers a recycle bin and explicit delete and restore actions', () => {
    expect(source).toContain('<option value="deleted">回收站</option>')
    expect(source).toContain('requestDelete(item, \'answer\')')
    expect(source).toContain('移入回收站')
    expect(source).toContain('<ActionButton action="restore"')
  })

  it('uses action-specific reasons instead of a permanent reason field', () => {
    expect(source).toContain('DISCUSSION_ACTION_REASONS')
    expect(source).toContain('QUESTION_ACTION_REASONS')
    expect(source).not.toContain('aria-label="审核原因"')
    expect(source).toContain('<Label>操作原因</Label>')
  })
})
