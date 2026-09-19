import { describe, expect, it } from 'vitest'

import { availableWorkerSubjectTypes, evaluateWorkerConfiguration, hasFatalWorkerIssue } from './worker-policy'

const CONFIG = 'a'.repeat(64)

describe('security worker readiness policy', () => {
  it('does not require adapters while every security mode is off', () => {
    expect(evaluateWorkerConfiguration({
      adapters: [],
      confirmedLlmFingerprint: null,
      modes: { mcp: 'off', prompt: 'off', skill: 'off' },
      requiredConfigFingerprints: {},
      runtimeLlmFingerprint: null,
      versionSettings: {},
    })).toEqual([])
  })

  it('fails closed when an enabled subject has no matching adapter or config', () => {
    expect(evaluateWorkerConfiguration({
      adapters: [],
      confirmedLlmFingerprint: null,
      modes: { mcp: 'off', prompt: 'off', skill: 'observe' },
      requiredConfigFingerprints: {},
      runtimeLlmFingerprint: null,
      versionSettings: {},
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SECURITY_ADAPTER_NOT_READY', subjectType: 'skill' }),
      expect.objectContaining({ code: 'SECURITY_SCHEMA_NOT_READY', subjectType: 'skill' }),
    ]))
  })

  it('detects adapter version and confirmed LLM identity drift', () => {
    expect(evaluateWorkerConfiguration({
      adapters: [{
        publicSubjectType: 'skill',
        usesLlm: true,
        version: { adapter: '1', normalizer: '1', rules: '1', scanner: '1' },
      }],
      confirmedLlmFingerprint: 'confirmed',
      modes: { mcp: 'off', prompt: 'off', skill: 'enforce' },
      requiredConfigFingerprints: { skill: CONFIG },
      runtimeLlmFingerprint: 'runtime',
      versionSettings: {
        skill: { adapter: '2', normalizer: '1', rules: '1', scanner: '1' },
      },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SECURITY_ADAPTER_VERSION_CHANGED' }),
      expect.objectContaining({ code: 'SECURITY_LLM_CONFIG_CHANGED' }),
    ]))
  })

  it('does not require an LLM identity for a fail-closed local worker', () => {
    expect(evaluateWorkerConfiguration({
      adapters: [{
        publicSubjectType: 'skill',
        usesLlm: true,
        version: { adapter: '1', normalizer: '1', rules: '1', scanner: '1' },
      }],
      confirmedLlmFingerprint: null,
      modes: { mcp: 'off', prompt: 'off', skill: 'observe' },
      requiredConfigFingerprints: { skill: CONFIG },
      runtimeLlmFingerprint: null,
      skipLlmChecks: true,
      versionSettings: {
        skill: { adapter: '1', normalizer: '1', rules: '1', scanner: '1' },
      },
    })).toEqual([])
  })

  it('keeps healthy content types runnable when one scanner is unavailable', () => {
    const issues = [{
      code: 'SECURITY_ADAPTER_NOT_READY' as const,
      message: 'skill scanner unavailable',
      subjectType: 'skill' as const,
    }]
    expect(availableWorkerSubjectTypes({ mcp: 'observe', prompt: 'observe', skill: 'observe' }, issues))
      .toEqual(['mcp', 'prompt'])
    expect(hasFatalWorkerIssue(issues)).toBe(false)
  })

  it('treats shared schema failures as fatal for every content type', () => {
    expect(hasFatalWorkerIssue([{
      code: 'SECURITY_SCHEMA_NOT_READY',
      message: 'business schema unavailable',
    }])).toBe(true)
  })
})
