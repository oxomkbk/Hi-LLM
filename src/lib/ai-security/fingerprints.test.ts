import { describe, expect, it } from 'vitest'

import {
  createDeclaredFingerprint,
  createInputFingerprint,
  createScannerConfigFingerprint,
} from './fingerprints'

describe('security fingerprints', () => {
  it('separates declared content from acquired source input', () => {
    const declared = createDeclaredFingerprint('skill', { sourceUrl: 'https://github.com/acme/demo', version: '1' })
    const first = createInputFingerprint({
      declaredFingerprint: declared,
      files: [{ path: 'SKILL.md', sha256: 'a'.repeat(64) }],
      sourceRevision: 'commit-a',
    })
    const second = createInputFingerprint({
      declaredFingerprint: declared,
      files: [{ path: 'SKILL.md', sha256: 'b'.repeat(64) }],
      sourceRevision: 'commit-b',
    })

    expect(first).not.toBe(second)
  })

  it('treats set-like config arrays as order independent', () => {
    const first = createScannerConfigFingerprint(scannerConfig({
      allowedExtensions: ['md', 'json'],
      allowedMimeTypes: ['text/markdown', 'application/json'],
    }))
    const second = createScannerConfigFingerprint(scannerConfig({
      allowedExtensions: ['json', 'md'],
      allowedMimeTypes: ['application/json', 'text/markdown'],
    }))

    expect(first).toBe(second)
  })

  it('changes when a coverage-affecting limit changes', () => {
    const first = createScannerConfigFingerprint(scannerConfig())
    const second = createScannerConfigFingerprint(scannerConfig({
      limits: { maxArchiveDepth: 32, maxFileBytes: 1024, maxFiles: 99, maxTextBytes: 4096 },
    }))

    expect(first).not.toBe(second)
  })
})

function scannerConfig(overrides: Record<string, unknown> = {}) {
  return {
    adapterId: 'skill',
    adapterParameters: {},
    allowedExtensions: ['md'],
    allowedMimeTypes: ['text/markdown'],
    chunkingPolicy: 'chunks-v1',
    coverageSchemaVersion: 'coverage-v1',
    limits: { maxArchiveDepth: 32, maxFileBytes: 1024, maxFiles: 100, maxTextBytes: 4096 },
    llm: { identityFingerprint: 'c'.repeat(64), outputSchemaVersion: 'output-v1', promptVersion: 'prompt-v1' },
    normalizerVersion: 'normalizer-v1',
    rulesVersion: 'rules-v1',
    scannerName: 'aig-skill-scan',
    scannerVersion: '1.0.0',
    scoringVersion: 'score-v1',
    severityMapping: { T01: 'high' },
    sourcePolicyVersion: 'source-v1',
    truncationPolicy: 'reject-v1',
    ...overrides,
  }
}
