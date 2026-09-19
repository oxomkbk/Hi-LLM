'use client'

import { ProgressBar } from '@heroui/react'
import { useEffect, useState } from 'react'

import type { SecurityPublicSubjectType } from '@/lib/ai-security/domain'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

interface SecurityAssessmentProgressProps {
  createdAt: string
  nextRunAt?: null | string
  runtime: SecurityWorkerRuntime
  startedAt?: null | string
  status: string
  subjectType: string
  workerId?: null | string
}

const STAGES = {
  preparing: { label: '正在准备评测材料', step: '第 2 / 3 步', value: 46 },
  queued: { label: '等待评测服务领取', step: '第 1 / 3 步', value: 16 },
  running: { label: '正在分析内容与风险', step: '第 3 / 3 步', value: 78 },
} as const

export default function SecurityAssessmentProgress(props: SecurityAssessmentProgressProps) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const stage = STAGES[props.status as keyof typeof STAGES]
  if (!stage)
    return null

  const publicType = toPublicSubjectType(props.subjectType)
  const workerCanHandle = props.runtime.readySubjectTypes.includes(publicType)
  const delayed = props.nextRunAt && now > 0 ? new Date(props.nextRunAt).getTime() > now : false
  const blockedReason = queuedBlockedReason({ delayed, props, publicType, workerCanHandle })
  const activePaused = props.status !== 'queued' && !props.runtime.serviceEnabled
  const baseTime = props.startedAt ?? props.createdAt

  return (
    <div data-blocked={blockedReason ? 'true' : undefined} className="security-assessment-progress">
      <div>
        <strong>{blockedReason ?? (activePaused ? `${stage.label}，本任务仍会完成` : stage.label)}</strong>
        <span>{stage.step}</span>
      </div>
      <ProgressBar aria-label={stage.label} value={stage.value}>
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <small>
        已等待 / 运行
        {' '}
        {formatElapsed(baseTime, now)}
        {props.workerId ? ` · ${shortWorkerId(props.workerId)}` : ''}
      </small>
    </div>
  )
}

function formatElapsed(value: string, now: number) {
  const seconds = Math.max(0, Math.floor(((now || new Date(value).getTime()) - new Date(value).getTime()) / 1000))
  if (seconds < 60)
    return `${seconds} 秒`
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} 分钟`
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分钟`
}

function queuedBlockedReason(input: {
  delayed: boolean | null | undefined
  props: SecurityAssessmentProgressProps
  publicType: SecurityPublicSubjectType
  workerCanHandle: boolean
}) {
  if (input.props.status !== 'queued')
    return null
  if (!input.props.runtime.serviceEnabled)
    return '评测服务已暂停，开启后将继续排队'
  if (input.props.runtime.status === 'starting')
    return '执行节点正在确认配置，任务已保留'
  if (input.props.runtime.status === 'offline')
    return '执行节点离线，任务已保留'
  if (!input.workerCanHandle)
    return `${subjectLabel(input.publicType)} 扫描能力暂不可用，其他类型仍可继续`
  if (input.delayed)
    return '任务正在等待自动重试时间'
  return null
}

function shortWorkerId(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}…` : value
}

function subjectLabel(type: SecurityPublicSubjectType) {
  return ({ mcp: 'MCP', prompt: 'Prompts', skill: 'Skills' } as const)[type]
}

function toPublicSubjectType(type: string): SecurityPublicSubjectType {
  if (type.startsWith('skill'))
    return 'skill'
  if (type.startsWith('mcp'))
    return 'mcp'
  return 'prompt'
}
