import { describe, expect, it } from 'vitest'

import { resolveDetailLink } from './detail-open-mode'

describe('resolveDetailLink', () => {
  it('keeps return context in the current tab', () => {
    expect(resolveDetailLink('same_tab', '/skills/a', '/skills/a?returnTo=%2Fskills')).toEqual({
      href: '/skills/a?returnTo=%2Fskills',
      rel: undefined,
      target: undefined,
    })
  })

  it('opens a clean URL in a protected new tab', () => {
    expect(resolveDetailLink('new_tab', '/skills/a', '/skills/a?returnTo=%2Fskills')).toEqual({
      href: '/skills/a',
      rel: 'noopener noreferrer',
      target: '_blank',
    })
  })
})
