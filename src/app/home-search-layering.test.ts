import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const stylesheet = postcss.parse(
  readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8'),
)

function readZIndex(selector: string) {
  const values: number[] = []

  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector))
      return

    rule.walkDecls('z-index', (declaration) => {
      values.push(Number(declaration.value))
    })
  })

  expect(values, `Expected one z-index declaration for ${selector}`).toHaveLength(1)
  expect(Number.isFinite(values[0])).toBe(true)
  return values[0]
}

describe('home search stacking order', () => {
  it('raises the open AI search above the sticky category rail', () => {
    const restingSearch = readZIndex('.home-search-panel')
    const categoryRail = readZIndex('.home-category-rail')
    const openAiSearch = readZIndex('.home-search-panel:has(.navigation-ai-root[data-open="true"])')

    expect(restingSearch).toBeLessThan(categoryRail)
    expect(openAiSearch).toBeGreaterThan(categoryRail)
  })
})
