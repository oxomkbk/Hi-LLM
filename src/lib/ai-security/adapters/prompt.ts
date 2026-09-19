import 'server-only'

import { createHash } from 'node:crypto'

import { getBusinessPool } from '@/lib/db/business'

import { AiSecurityError } from '../errors'
import { createInputFingerprint } from '../fingerprints'
import { loadSecuritySubjectSnapshot } from '../subject-repository'
import { evaluateTrustedContent } from '../trust-evaluation'
import { analyzePromptPayload } from './prompt-analysis'
import { isLocalDeterministicAssessment } from './types'

import type { PromptPayload } from './prompt-analysis'
import type { SecurityAssessmentAdapter } from './types'

export const PROMPT_SECURITY_ADAPTER_VERSION = {
  adapter: 'prompt-document-evidence-v3',
  normalizer: 'platform-finding-v1',
  rules: 'prompt-safety-rules+document-evidence-v2-context-aware',
  scanner: 'hillm-nav-prompt-trust@2',
} as const

export const promptSecurityAdapter: SecurityAssessmentAdapter = {
  execute: async (context) => {
    await context.checkpoint()
    if (context.assessment.subject_type !== 'prompt')
      throw new TypeError('Prompt adapter received an incompatible subject type')
    const pool = await getBusinessPool()
    const client = await pool.connect()
    try {
      const snapshot = await loadSecuritySubjectSnapshot(client, 'prompt', context.assessment.subject_id)
      if (snapshot.declaredFingerprint !== context.assessment.declared_fingerprint)
        throw new AiSecurityError('SECURITY_ASSESSMENT_INPUT_CHANGED', 'Prompt 内容在扫描准备阶段已经变化')
      const payload = promptPayload(snapshot.payload)
      const findings = analyzePromptPayload(payload)
      const files = [
        ...payload.documents.map(document => ({
          path: `documents/${document.path}`,
          sha256: createHash('sha256').update(document.content, 'utf8').digest('hex'),
        })),
        ...payload.assets.map(asset => ({ path: `assets/${asset.path}`, sha256: asset.sha256 })),
      ]
      const included = [
        'prompt/metadata',
        ...payload.documents.map(document => `document:${document.path}`),
        ...payload.assets.map(asset => `asset-metadata:${asset.path}`),
      ]
      const skipped = payload.assets.map(asset => ({
        reason: '二进制资源仅校验类型、路径、角色与 SHA-256，未执行或解释内容',
        ref: `asset-content:${asset.path}`,
      }))
      const coverage = {
        included,
        level: skipped.length > 0 ? 'partial' as const : 'complete' as const,
        partitions: {
          assets: {
            includedCount: payload.assets.length,
            skippedCount: payload.assets.length,
            status: payload.assets.length > 0 ? 'metadata_only' as const : 'not_applicable' as const,
          },
          documents: {
            includedCount: payload.documents.length,
            skippedCount: 0,
            status: 'complete' as const,
          },
        },
        skipped,
        sourceRevision: null,
      }
      const evaluation = await evaluateTrustedContent({
        aiAssistance: isLocalDeterministicAssessment(context.assessment) ? 'disabled' : 'preferred',
        content: snapshot.payload,
        coverage,
        documents: [
          ...payload.documents.map(document => ({ content: document.content, path: document.path })),
          {
            content: JSON.stringify({ assets: payload.assets, name: snapshot.name }),
            path: 'prompt/metadata.json',
          },
        ],
        findings,
        name: snapshot.name,
        signal: context.signal,
        subjectType: context.assessment.subject_type,
      })
      await context.checkpoint()
      return {
        coverage,
        engineScore: null,
        evaluation,
        findings,
        inputFingerprint: createInputFingerprint({
          declaredFingerprint: snapshot.declaredFingerprint,
          files,
          sourceRevision: null,
        }),
        rawReportFileId: null,
        rulesVersion: PROMPT_SECURITY_ADAPTER_VERSION.rules,
        scannerName: 'hillm-nav-prompt-static',
        scannerVersion: '1',
        sourceRevision: null,
        summary: findings.length === 0
          ? '静态评测未发现已知 Prompt 安全风险；二进制资源不会被执行。'
          : `静态评测发现 ${findings.length} 项 Prompt 风险，请结合内容用途复核。`,
      }
    }
    finally {
      client.release()
    }
  },
  publicSubjectType: 'prompt',
  usesLlm: true,
  version: PROMPT_SECURITY_ADAPTER_VERSION,
}

function promptPayload(value: unknown): PromptPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid Prompt assessment payload')
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.documents) || !Array.isArray(record.assets))
    throw new TypeError('Invalid Prompt assessment payload')
  return value as PromptPayload
}
