import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('wonderland home navigation contract', () => {
  it('keeps the community works entry in the hero actions', () => {
    const heroActions = pageSource.match(/<div className="wonderland-community-actions">([\s\S]*?)<\/div>/)?.[1] ?? ''

    expect(heroActions).toContain('href="/wonderland/works"')
    expect(heroActions).toContain('浏览社区作品')
  })
})
