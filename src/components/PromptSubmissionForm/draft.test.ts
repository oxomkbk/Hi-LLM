import { describe, expect, it } from 'vitest'

import {
  promptSubmissionDraftKey,
  readPromptSubmissionDraft,
  reconcilePromptSubmissionUploadedAssets,
  writePromptSubmissionDraft,
} from './draft'

describe('prompt submission browser draft', () => {
  it('isolates browser drafts by signed-in user', () => {
    expect(promptSubmissionDraftKey('user-a')).not.toBe(promptSubmissionDraftKey('user-b'))
  })

  it('round-trips the stable submission key and uploaded assets', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    } as unknown as Storage
    const storageKey = promptSubmissionDraftKey('00000000-0000-4000-8000-000000000001')
    writePromptSubmissionDraft(storage, storageKey, {
      assetKeys: { 'preview.png:12:1': '00000000-0000-4000-8000-000000000002' },
      documents: { prompt: 'Build a dashboard', promptPath: 'prompt.md', readme: '', readmePath: 'README.md', style: '', stylePath: 'style.css' },
      kind: 'web_ui',
      metadata: { compatibility: 'React', summary: 'A dashboard prompt', tags: 'dashboard', title: 'Dashboard' },
      pendingAssetNames: ['preview.png'],
      primaryCategoryId: 'category',
      submissionId: '00000000-0000-4000-8000-000000000003',
      submissionKey: '00000000-0000-4000-8000-000000000004',
      uploadedAssets: { 'preview.png:12:1': { assetId: 'asset', isPrimary: true, role: 'image' } },
    }, 1_000)

    expect(readPromptSubmissionDraft(values.get(storageKey)!, 2_000)).toMatchObject({
      assetKeys: { 'preview.png:12:1': '00000000-0000-4000-8000-000000000002' },
      submissionId: '00000000-0000-4000-8000-000000000003',
      submissionKey: '00000000-0000-4000-8000-000000000004',
      uploadedAssets: { 'preview.png:12:1': { assetId: 'asset', isPrimary: true, role: 'image' } },
    })
  })

  it('ignores expired or malformed drafts', () => {
    expect(readPromptSubmissionDraft('{"version":2,"expiresAt":1}', 2)).toBeNull()
    expect(readPromptSubmissionDraft('{broken')).toBeNull()
  })

  it('drops invalid persisted identifiers instead of disabling idempotency', () => {
    const raw = JSON.stringify({
      assetKeys: { file: 'not-a-uuid' },
      documents: {},
      expiresAt: 10_000,
      kind: 'web_ui',
      metadata: {},
      submissionId: 'invalid',
      submissionKey: 'also-invalid',
      version: 2,
    })

    expect(readPromptSubmissionDraft(raw, 2_000)).toMatchObject({
      assetKeys: {},
      submissionId: '',
      submissionKey: '',
    })
  })

  it('drops stale uploaded mappings that no longer exist on the server', () => {
    const reconciled = reconcilePromptSubmissionUploadedAssets({
      current: { assetId: 'asset-current', isPrimary: true, role: 'image' },
      stale: { assetId: 'asset-removed', isPrimary: false, role: 'attachment' },
    }, ['asset-current'])

    expect(reconciled).toEqual({
      current: { assetId: 'asset-current', isPrimary: true, role: 'image' },
    })
  })
})
