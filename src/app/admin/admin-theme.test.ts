import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')

describe('admin stylesheet boundaries', () => {
  it('keeps admin namespace rules out of the public stylesheet', () => {
    const selectors: string[] = []
    postcss.parse(read('../globals.css')).walkRules((rule) => {
      selectors.push(...rule.selectors)
    })
    expect(selectors.filter(selector => /\.admin-/.test(selector))).toEqual([])
  })

  it('has only one owner for the sidebar and dashboard', () => {
    const selectors: string[] = []
    postcss.parse(read('./admin-workspaces.css')).walkRules((rule) => {
      selectors.push(...rule.selectors)
    })
    expect(selectors.filter(selector => /\.admin-(?:sidebar|dashboard|analytics|kpi|nav-link)/.test(selector))).toEqual([])
  })

  it('does not leak generic dialog styling into public routes', () => {
    const unscoped: string[] = []
    for (const file of ['./admin-theme.css', './admin-workspaces.css']) {
      postcss.parse(read(file)).walkRules((rule) => {
        for (const selector of rule.selectors) {
          if (/^:where\(\.(?:modal|alert-dialog|drawer)__/.test(selector))
            unscoped.push(selector)
        }
      })
    }
    expect(unscoped).toEqual([])
  })
})
