import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('./about-dialog.module.css', import.meta.url), 'utf8')

describe('about dialog presentation contract', () => {
  it('uses outside modal scrolling without an internal content scroller', () => {
    expect(componentSource).toContain('scroll="outside"')
    expect(stylesSource).not.toMatch(/overflow-y\s*:\s*(?:auto|scroll)/i)
    expect(stylesSource).not.toMatch(/max-height\s*:/i)
    expect(stylesSource).toMatch(/\.body:global\(\.modal__body\)[\s\S]*?overflow:\s*visible;/)
  })

  it('promotes the operations team and technical support language', () => {
    expect(componentSource).toContain('运营团队')
    expect(componentSource).toContain('<strong>技术支持</strong>')
    expect(componentSource).toContain('aria-labelledby="about-team-title"')
    expect(componentSource).not.toContain('特别感谢')
    expect(componentSource).not.toContain('Special thanks')
    expect(componentSource).not.toContain('获取技术支持')
  })

  it('keeps the LLM wordmark readable and presents the team as an editorial roster', () => {
    expect(stylesSource).toContain('letter-spacing: -.035em')
    expect(stylesSource).not.toContain('letter-spacing: -.105em')
    expect(componentSource).toContain('className={styles.personIndex}')
    expect(stylesSource).toContain('.thanksAvatarMedia')
  })

  it('keeps explicit responsive boundaries and reduced-motion support', () => {
    expect(stylesSource).toContain('@media (max-width: 760px)')
    expect(stylesSource).toContain('@media (max-width: 560px)')
    expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
