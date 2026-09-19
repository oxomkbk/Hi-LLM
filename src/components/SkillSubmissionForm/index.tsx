'use client'

import { ArrowRight, CircleCheckFill, PaperPlane } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import Link from 'next/link'
import { useState } from 'react'

import SkillComposer from '@/components/skill-composer/skill-composer'
import {
  createEmptySkillComposerValue,
  skillComposerPayload,
} from '@/components/skill-composer/types'
import { createLoginUrl } from '@/lib/auth/callback-url'

import type { SkillComposerValue, SkillSubmitIntent } from '@/components/skill-composer/types'
import type { IResponse } from '@/types'

const DRAFT_KEY = 'hillm-nav:skill-composer:v1:submission:current:new'

export default function SkillSubmissionForm() {
  const [formVersion, setFormVersion] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (value: SkillComposerValue, intent: SkillSubmitIntent) => {
    if (intent !== 'submit')
      return false
    const payload = { ...skillComposerPayload(value), company: '' }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/skill-submissions', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as IResponse<unknown>
      if (response.status === 401 && result.error?.code === 'AUTH_REQUIRED') {
        persistDraftImmediately(value)
        window.location.assign(createLoginUrl('/skills/submit?draftMigration=1'))
        return false
      }
      if (!response.ok || (result.code !== undefined && result.code !== 200)) {
        setError(result.msg || '投稿失败，请稍后重试')
        return false
      }
      setSubmitted(true)
      return true
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '投稿失败，请稍后重试')
      return false
    }
    finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="submission-success-page grid min-h-[calc(100svh-4rem)] place-items-center px-4 py-12">
        <section className="submission-success-card w-full max-w-xl px-6 py-10 text-center sm:px-10">
          <span className="submission-success-icon mx-auto grid size-14 place-items-center"><CircleCheckFill className="size-7" /></span>
          <h1 className="mt-6 text-2xl font-black tracking-[-0.035em]">Skill 投稿已提交</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">内容和草稿已保存，后台会继续完成必要检查。通过后会出现在 Skills 目录。</p>
          <div className="submission-success-actions mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onPress={() => {
                setSubmitted(false)
                setError(null)
                setFormVersion(version => version + 1)
              }}
            >
              <PaperPlane />
              继续投稿
            </Button>
            <Link href="/skills" className="submission-success-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-bold transition-opacity hover:opacity-90">
              返回 Skills 社区
              <ArrowRight />
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <SkillComposer
      key={formVersion}
      title="投稿一个 Skill"
      isSubmitting={submitting}
      backHref="/skills"
      draftKey={DRAFT_KEY}
      error={error}
      initialValue={createEmptySkillComposerValue()}
      mode="submission"
      onSubmit={submit}
    />
  )
}

function persistDraftImmediately(value: SkillComposerValue) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1_000,
      savedAt: Date.now(),
      value,
      version: 1,
    }))
  }
  catch {
    // Login should still proceed; the composer already keeps the current in-memory value.
  }
}
