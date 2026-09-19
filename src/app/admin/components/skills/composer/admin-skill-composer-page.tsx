'use client'

import { Alert, Button, Spinner, toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import SkillComposer from '@/components/skill-composer/skill-composer'
import {
  createEmptySkillComposerValue,
  skillComposerPayload,
  skillToComposerValue,
} from '@/components/skill-composer/types'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { RESPONSE } from '@/lib/utils'

import type { SkillComposerValue, SkillSubmitIntent } from '@/components/skill-composer/types'
import type { Skill } from '@/types'

interface AdminSkillComposerPageProps {
  returnHref?: string
  skillId?: string
}

export default function AdminSkillComposerPage({ returnHref = '/admin/skills/content', skillId }: AdminSkillComposerPageProps) {
  const router = useRouter()
  const [skill, setSkill] = useState<Skill | null>(null)
  const [loading, setLoading] = useState(Boolean(skillId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!skillId)
      return
    let active = true
    request<Skill>(`/skills/${skillId}`)
      .then((result) => {
        if (active)
          setSkill(result.data)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Skill 加载失败')
      })
      .finally(() => {
        if (active)
          setLoading(false)
      })
    return () => {
      active = false
    }
  }, [skillId])

  const submit = async (value: SkillComposerValue, intent: SkillSubmitIntent) => {
    if (intent !== 'save')
      return false
    setSubmitting(true)
    setError(null)
    try {
      const result = await request<Skill>(skillId ? `/skills/${skillId}` : '/skills', {
        body: JSON.stringify(skillComposerPayload(value)),
        method: skillId ? 'PUT' : 'POST',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return false
      toast.success(result.msg || (skillId ? 'Skill 已更新' : 'Skill 已发布'))
      if (!skillId) {
        router.replace(buildContextualHref(`/admin/skills/${result.data.id}/edit`, returnHref))
      }
      else {
        setSkill(result.data)
        setVersion(current => current + 1)
      }
      return true
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试')
      return false
    }
    finally {
      setSubmitting(false)
    }
  }

  if (loading)
    return <div className="grid min-h-[60vh] place-items-center"><Spinner /></div>

  if (skillId && !skill) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>无法打开 Skill</Alert.Title>
          <Alert.Description>{error ?? '内容不存在或已被删除。'}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="danger" onPress={() => router.push(returnHref)}>返回列表</Button>
      </Alert>
    )
  }

  return (
    <SkillComposer
      key={`${skillId ?? 'new'}-${version}`}
      title={skillId ? `编辑 ${skill?.name ?? 'Skill'}` : '新增 Skill'}
      isSubmitting={submitting}
      backHref={returnHref}
      draftKey={`hillm-nav:skill-composer:v1:${skillId ? 'admin-edit' : 'admin-create'}:current:${skillId ?? 'new'}`}
      draftStorage={skillId ? 'session' : 'local'}
      error={error}
      initialValue={skill ? skillToComposerValue(skill) : createEmptySkillComposerValue()}
      mode={skillId ? 'admin-edit' : 'admin-create'}
      onSubmit={submit}
    />
  )
}
