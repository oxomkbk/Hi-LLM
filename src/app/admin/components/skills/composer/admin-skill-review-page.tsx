'use client'

import { Alert, Button, Spinner, toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import SubmissionSecurityCard from '@/app/admin/components/security/submission-security-card'
import { useSubmissionSecurityPolling } from '@/app/admin/components/security/use-submission-security-polling'
import SkillComposer from '@/components/skill-composer/skill-composer'
import { skillComposerPayload, skillToComposerValue } from '@/components/skill-composer/types'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { RESPONSE } from '@/lib/utils'

import type { SkillComposerValue, SkillSubmitIntent } from '@/components/skill-composer/types'
import type { SkillSubmission } from '@/types'

export default function AdminSkillReviewPage({ returnHref = '/admin/skills/submissions', submissionId }: { returnHref?: string, submissionId: string }) {
  const router = useRouter()
  const [submission, setSubmission] = useState<SkillSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const automaticScanStartedRef = useRef(false)

  useEffect(() => {
    let active = true
    request<SkillSubmission>(`/skill-submissions/${submissionId}`)
      .then((result) => {
        if (active)
          setSubmission(result.data)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : '投稿加载失败')
      })
      .finally(() => {
        if (active)
          setLoading(false)
      })
    return () => {
      active = false
    }
  }, [submissionId])

  const submit = async (value: SkillComposerValue, intent: SkillSubmitIntent, reviewNote?: string) => {
    if (!submission)
      return false
    if (intent === 'reject' && !reviewNote?.trim()) {
      setError('拒绝投稿时请填写具体原因')
      return false
    }

    setSubmitting(true)
    setError(null)
    const content = skillComposerPayload(value)
    try {
      if (intent === 'save') {
        const result = await request<SkillSubmission>(`/skill-submissions/${submission.id}`, {
          body: JSON.stringify(content),
          method: 'PUT',
        })
        if (result.code !== RESPONSE.SUCCESS)
          return false
        await request('/admin/security-assessments', {
          body: JSON.stringify({
            force: Boolean(submission.security_assessment_id),
            requestId: submission.security_assessment_id ? crypto.randomUUID() : undefined,
            subjectId: submission.id,
            subjectType: 'skill_submission',
          }),
          method: 'POST',
        }).catch(() => undefined)
        const refreshed = await request<SkillSubmission>(`/skill-submissions/${submission.id}`)
        setSubmission(refreshed.data)
        setVersion(current => current + 1)
        toast.success('修改已保存，安全检查已自动更新')
        return true
      }

      const result = await request<{ skill_id?: string, status: string }>(`/skill-submissions/${submission.id}/review`, {
        body: JSON.stringify(intent === 'approve'
          ? {
              action: 'approve',
              content,
              expected_updated_at: submission.updated_at,
              review_note: reviewNote?.trim() || undefined,
            }
          : { action: 'reject', review_note: reviewNote?.trim() }),
        method: 'POST',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return false
      toast.success(intent === 'approve' ? '投稿已批准并发布' : '投稿已拒绝')
      router.replace(returnHref)
      return true
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '审核操作失败')
      return false
    }
    finally {
      setSubmitting(false)
    }
  }

  const scan = useCallback(async () => {
    if (!submission)
      return
    setScanning(true)
    setError(null)
    try {
      await request('/admin/security-assessments', {
        body: JSON.stringify({
          force: Boolean(submission.security_assessment_id),
          requestId: submission.security_assessment_id ? crypto.randomUUID() : undefined,
          subjectId: submission.id,
          subjectType: 'skill_submission',
        }),
        method: 'POST',
      })
      const refreshed = await request<SkillSubmission>(`/skill-submissions/${submission.id}`)
      setSubmission(refreshed.data)
      toast.success(submission.security_assessment_id ? '重新评测已加入队列' : '安全评测已加入队列')
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法发起安全评测')
    }
    finally {
      setScanning(false)
    }
  }, [submission])

  useEffect(() => {
    if (!submission || automaticScanStartedRef.current || submission.security_publish_ready
      || submission.security_scan_status || submission.security_report_state === 'blocked'
      || submission.status === 'approved' || submission.status === 'rejected') {
      return
    }
    automaticScanStartedRef.current = true
    void scan()
  }, [scan, submission])

  const securityScanActive = ['queued', 'preparing', 'running'].includes(submission?.security_scan_status ?? '') || scanning
  useSubmissionSecurityPolling<SkillSubmission>({
    enabled: securityScanActive && Boolean(submission),
    endpoint: `/skill-submissions/${submissionId}`,
    onUpdate: setSubmission,
  })

  if (loading)
    return <div className="grid min-h-[60vh] place-items-center"><Spinner /></div>

  if (!submission) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>无法打开投稿</Alert.Title>
          <Alert.Description>{error ?? '投稿不存在或已被删除。'}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="danger" onPress={() => router.push(returnHref)}>返回列表</Button>
      </Alert>
    )
  }

  const primaryActionDisabled = !submission.security_publish_ready
  const primaryActionLabel = securityScanActive
    ? '自动检查中'
    : submission.security_report_state === 'blocked' ? '处理危险项后发布' : '检查完成后发布'
  const primaryActionHint = submission.security_report_state === 'blocked'
    ? '先点击右侧“处理危险项”，完成处置后即可发布'
    : '系统会自动完成安全检查；普通建议不会影响发布'

  return (
    <SkillComposer
      key={`${submission.id}-${version}`}
      title={`审核 ${submission.name}`}
      isReadOnly={submission.status === 'approved' || submission.status === 'rejected'}
      isSubmitting={submitting}
      asideContent={(
        <SubmissionSecurityCard
          assessmentId={submission.security_assessment_id}
          grade={submission.security_grade}
          publishReady={submission.security_publish_ready}
          reportState={submission.security_report_state}
          returnHref={buildContextualHref(`/admin/skills/submissions/${submission.id}/review`, returnHref)}
          scanning={scanning}
          scanStatus={submission.security_scan_status}
          score={submission.security_score}
          onScan={() => void scan()}
        />
      )}
      backHref={returnHref}
      draftKey={`hillm-nav:skill-composer:v1:submission-review:current:${submission.id}`}
      draftStorage="session"
      error={error}
      initialValue={skillToComposerValue(submission)}
      mode="submission-review"
      primaryActionDisabled={primaryActionDisabled}
      primaryActionHint={primaryActionHint}
      primaryActionLabel={primaryActionLabel}
      reviewNote={submission.review_note ?? ''}
      onSubmit={submit}
    />
  )
}
