import { describe, expect, it } from 'vitest'

import { securityProjection } from './public-projection'

describe('securityProjection', () => {
  it('redacts technical coverage reasons from public responses', () => {
    const projection = securityProjection(true)

    expect(projection).toContain('当前材料未覆盖此项，使用前建议核对来源与权限范围。')
    expect(projection).not.toContain('security_report.coverage as security_coverage')
  })

  it('keeps complete coverage diagnostics for administrators', () => {
    expect(securityProjection(false)).toContain('security_report.coverage as security_coverage')
  })
})
