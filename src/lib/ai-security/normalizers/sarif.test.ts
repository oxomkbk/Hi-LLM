import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseAndNormalizeSkillSarif } from './sarif'

function report(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    runs: [{
      properties: { securityScore: 5 },
      results: [{
        fixes: [{ description: { text: 'Remove the remote execution path.' } }],
        level: 'error',
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: 'SKILL.md' },
            region: { endLine: 8, startLine: 6 },
          },
        }],
        message: { text: 'Remote payload retrieval' },
        properties: {
          description: 'Downloads a payload with api_key=super-secret-value-12345.',
          severity: 'Critical',
        },
        ruleId: 'T03',
      }],
      tool: { driver: { name: 'aig-skill-scan', version: '0.2.1' } },
    }],
    version: '2.1.0',
    ...overrides,
  })
}

describe('skill SARIF normalizer', () => {
  it('accepts the pinned safe and malicious scanner contract fixtures', () => {
    const fixtureRoot = resolve(process.cwd(), 'test/fixtures/ai-security/sarif')
    const safe = parseAndNormalizeSkillSarif(
      readFileSync(resolve(fixtureRoot, 'skill-safe.sarif.json'), 'utf8'),
      new Set(['SKILL.md']),
    )
    const malicious = parseAndNormalizeSkillSarif(
      readFileSync(resolve(fixtureRoot, 'skill-malicious.sarif.json'), 'utf8'),
      new Set(['SKILL.md']),
    )

    expect(safe.findings).toHaveLength(0)
    expect(malicious.findings[0]).toEqual(expect.objectContaining({ riskCode: 'T03', severity: 'critical' }))
  })

  it('normalizes, redacts and fingerprints a whitelisted finding', () => {
    const normalized = parseAndNormalizeSkillSarif(report(), new Set(['SKILL.md']))

    expect(normalized.engineScore).toBe(5)
    expect(normalized.findings).toEqual([expect.objectContaining({
      artifactPath: 'SKILL.md',
      description: expect.not.stringContaining('super-secret-value'),
      endLine: 8,
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      publicVisible: false,
      riskCode: 'T03',
      severity: 'critical',
      startLine: 6,
      title: 'Remote payload retrieval',
    })])
  })

  it('rejects paths outside the acquired manifest', () => {
    expect(() => parseAndNormalizeSkillSarif(report(), new Set(['README.md'])))
      .toThrowError(/SECURITY_REPORT_INVALID/)
  })

  it('rejects unknown rules and scanner version drift', () => {
    const unknownRule = JSON.parse(report())
    unknownRule.runs[0].results[0].ruleId = 'T99'
    expect(() => parseAndNormalizeSkillSarif(JSON.stringify(unknownRule), new Set(['SKILL.md'])))
      .toThrowError(/SECURITY_REPORT_INVALID/)

    const changedVersion = JSON.parse(report())
    changedVersion.runs[0].tool.driver.version = '0.3.0'
    expect(() => parseAndNormalizeSkillSarif(JSON.stringify(changedVersion), new Set(['SKILL.md'])))
      .toThrowError(/SECURITY_REPORT_INVALID/)
  })

  it('rejects oversized untrusted reports before parsing', () => {
    expect(() => parseAndNormalizeSkillSarif(' '.repeat(4 * 1024 * 1024 + 1), new Set()))
      .toThrowError(/SECURITY_REPORT_INVALID/)
  })
})
