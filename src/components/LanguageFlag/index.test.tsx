import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import LanguageFlag from './index'

const CHINA_STAR_PATH = 'M0 -1 .225 -.309 .951 -.309 .363 .118 .588 .809 0 .382 -.588 .809 -.363 .118 -.951 -.309 -.225 -.309Z'
const CHINA_STAR_TRANSFORMS = [
  'translate(5 5) scale(3)',
  'translate(10 2) rotate(-121)',
  'translate(12 4) rotate(-98.1)',
  'translate(12 7) rotate(-74.1)',
  'translate(10 9) rotate(-51.3)',
]

describe('language flag', () => {
  it('renders the complete five-star Chinese flag', () => {
    const markup = renderToStaticMarkup(<LanguageFlag countryCode="CN" />)

    expect(markup.match(/fill="#DE2910"/g)).toHaveLength(1)
    expect(markup.match(/fill="#FFDE00"/g)).toHaveLength(5)
    expect(markup.match(new RegExp(escapeRegExp(CHINA_STAR_PATH), 'g'))).toHaveLength(5)
    for (const transform of CHINA_STAR_TRANSFORMS)
      expect(markup).toContain(`transform="${transform}"`)
    expect(markup).not.toMatch(/<(?:defs|use)\b|\sid=/)
  })

  it('renders multiple Chinese flags without identifier dependencies', () => {
    const markup = renderToStaticMarkup(
      <>
        <LanguageFlag countryCode="CN" />
        <LanguageFlag countryCode="CN" />
      </>,
    )

    expect(markup.match(/<svg\b/g)).toHaveLength(2)
    expect(markup.match(/fill="#FFDE00"/g)).toHaveLength(10)
    expect(markup).not.toMatch(/<(?:defs|use)\b|\sid=/)
  })
})

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
