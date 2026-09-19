import { describe, expect, it } from 'vitest'

import { evaluateDocumentEvidence } from './document-evaluation'

import type { SecurityCoverageInput } from './coverage'
import type { NormalizedSecurityFinding } from './finalize'

const RICH_DOCUMENT = `
# Release reviewer

Use this skill when a team needs to review a release before deployment.

## Prerequisites

Requires Node.js 22 and a Git repository. Install the pinned package with npm add reviewer@2.4.1.

## Inputs and outputs

Input: a pull request URL. Output: a Markdown report with blocking issues and recommendations.

## Usage

1. Select the pull request.
2. Run the review command.
3. Confirm each blocking issue.

\`\`\`sh
npx reviewer@2.4.1 check ./fixtures/example
\`\`\`

## Expected result

The command exits with code 0 and writes report.md.

## Validation

Run npm test and compare report.md with the checked-in fixture.

## Troubleshooting

If authentication fails, confirm the token scope and retry once.

## Security

Use a read-only token and never print credentials.
`

describe('document evidence evaluation', () => {
  it('gives richer documented material higher, evidence-backed scores', () => {
    const rich = evaluateDocumentEvidence({
      coverage: coverage('partial', ['README.md', 'package.json']),
      documents: [
        { content: RICH_DOCUMENT, path: 'README.md' },
        { content: '{"name":"reviewer","version":"2.4.1"}', path: 'package.json' },
      ],
      findings: [],
      name: 'Release reviewer',
      subjectType: 'skill',
    })
    const sparse = evaluateDocumentEvidence({
      coverage: coverage('partial', ['SKILL.md']),
      documents: [{ content: '# Tool\n\nDoes useful things.', path: 'SKILL.md' }],
      findings: [],
      name: 'Sparse tool',
      subjectType: 'skill',
    })

    expect(rich.method).toBe('document_evidence')
    expect(rich.model).toBe('platform-document-rubric-v1')
    expect(rich.dimensions).toHaveLength(5)
    expect(rich.score).toBeGreaterThan(sparse.score)
    expect(dimension(rich, 'reliability').score).toBeGreaterThanOrEqual(4)
    expect(dimension(rich, 'applicability').score).toBeGreaterThanOrEqual(4)
    expect(dimension(rich, 'effectiveness').score).toBeGreaterThanOrEqual(4)
    expect(dimension(sparse, 'effectiveness').score).toBeLessThanOrEqual(2.5)
    expect(rich.dimensions.every(item => item.source === 'deterministic')).toBe(true)
    expect(rich.dimensions.flatMap(item => item.evidence).some(item => item.includes('README.md'))).toBe(true)
    expect(rich.summary).toContain('Release reviewer')
    expect(sparse.summary).toContain('Sparse tool')
    expect(rich.summary).not.toBe(sparse.summary)
  })

  it('caps safety and total score when the checked material contains a critical finding', () => {
    const result = evaluateDocumentEvidence({
      coverage: coverage('partial', ['README.md']),
      documents: [{ content: RICH_DOCUMENT, path: 'README.md' }],
      findings: [finding('critical')],
      name: 'Unsafe reviewer',
      subjectType: 'skill',
    })

    expect(dimension(result, 'safety').score).toBe(0.2)
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.summary).toContain('高风险证据')
  })

  it('limits document quality scores when only configuration is covered', () => {
    const result = evaluateDocumentEvidence({
      coverage: coverage('config_only', ['mcp/configuration']),
      documents: [{ content: RICH_DOCUMENT, path: 'mcp/configuration.md' }],
      findings: [],
      name: 'Configured MCP',
      subjectType: 'mcp',
    })

    expect(result.dimensions.filter(item => item.code !== 'safety').every(item => item.score <= 3.5)).toBe(true)
    expect(result.summary).toContain('仅配置材料')
  })
})

function coverage(level: 'config_only' | 'partial', included: string[]): SecurityCoverageInput {
  return {
    included,
    level,
    partitions: {
      material: {
        includedCount: included.length,
        skippedCount: 1,
        status: level,
      },
    },
    skipped: [{ reason: '不执行第三方代码', ref: 'runtime/not-executed' }],
    sourceRevision: level === 'partial' ? 'a'.repeat(40) : null,
  }
}

function dimension(result: ReturnType<typeof evaluateDocumentEvidence>, code: string) {
  return result.dimensions.find(item => item.code === code)!
}

function finding(severity: NormalizedSecurityFinding['severity']): NormalizedSecurityFinding {
  return {
    artifactPath: 'README.md',
    description: 'Critical behavior',
    endLine: 10,
    evidenceRedacted: '[MATCH_REDACTED]',
    fingerprint: 'a'.repeat(64),
    publicSummary: 'Critical behavior',
    publicVisible: true,
    recommendation: 'Remove the behavior',
    riskCode: 'TEST_CRITICAL',
    severity,
    startLine: 10,
    title: 'Critical behavior',
  }
}
