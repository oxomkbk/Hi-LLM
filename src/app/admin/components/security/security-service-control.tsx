'use client'

import { Switch, toast } from '@heroui/react'
import { useState } from 'react'

import { securityExecutionModeLabel } from '@/lib/ai-security/presentation'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import SecurityWorkerProcessControl from './security-worker-process-control'

import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

interface SecurityServiceControlProps {
  canManage: boolean
  onRefresh: () => Promise<void>
  onRuntimeChange: (runtime: SecurityWorkerRuntime) => void
  runtime: SecurityWorkerRuntime
}

interface SecurityServiceStateResponse {
  runtime: SecurityWorkerRuntime
  state: {
    changedAt: string
    changedBy: string | null
    enabled: boolean
    version: number
  }
}

export default function SecurityServiceControl(props: SecurityServiceControlProps) {
  const [pending, setPending] = useState(false)

  const update = async (enabled: boolean) => {
    if (pending || enabled === props.runtime.serviceEnabled)
      return
    setPending(true)
    try {
      const result = await request<SecurityServiceStateResponse>('/admin/security-service', {
        body: JSON.stringify({
          enabled,
          expectedVersion: props.runtime.serviceStateVersion,
        }),
        method: 'PATCH',
      })
      props.onRuntimeChange(result.data.runtime)
      toast.success(enabled ? '评测服务已开启，正在等待执行节点确认' : '评测服务已暂停，排队任务已保留')
      await props.onRefresh()
    }
    catch {
      await props.onRefresh()
    }
    finally {
      setPending(false)
    }
  }

  const copy = runtimeCopy(props.runtime)
  return (
    <section aria-live="polite" data-status={props.runtime.status} className="security-service-control">
      <div className="security-service-control__summary">
        <i aria-hidden="true" className="security-service-control__indicator" />
        <div className="security-service-control__body">
          <div className="security-service-control__heading">
            <strong>{copy.title}</strong>
            <span>
              状态版本 v
              {props.runtime.serviceStateVersion}
            </span>
          </div>
          <p>{copy.description}</p>
          <div className="security-service-control__facts">
            <span>{securityExecutionModeLabel(props.runtime.executionMode)}</span>
            <span>{`排队 ${props.runtime.queue.queued}`}</span>
            <span>{`执行中 ${props.runtime.queue.inFlight}`}</span>
            <span>{workerStateLabel(props.runtime)}</span>
            {props.runtime.incompatibleWorkerCount > 0
              ? <span>{`${props.runtime.incompatibleWorkerCount} 个旧节点已隔离`}</span>
              : null}
            <span>
              {props.runtime.lastSeenAt
                ? `最近心跳 ${formatDate(props.runtime.lastSeenAt, 'datetime')}`
                : `状态变更 ${formatDate(props.runtime.serviceStateChangedAt, 'datetime')}`}
            </span>
          </div>
        </div>
        <div className="security-service-control__action">
          <Switch
            aria-label={props.runtime.serviceEnabled ? '暂停安全评测服务' : '开启安全评测服务'}
            size="sm"
            isDisabled={!props.canManage || pending}
            isSelected={props.runtime.serviceEnabled}
            onChange={enabled => void update(enabled)}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              {pending ? '保存中' : props.runtime.serviceEnabled ? '已开启' : '已暂停'}
            </Switch.Content>
          </Switch>
          <small>{props.canManage ? '控制是否领取新任务' : '仅系统管理员可修改'}</small>
        </div>
      </div>
      <SecurityWorkerProcessControl runtime={props.runtime} onRuntimeChange={props.onRuntimeChange} />
    </section>
  )
}

function runtimeCopy(runtime: SecurityWorkerRuntime) {
  const ready = runtime.readySubjectTypes
    .map(type => ({ mcp: 'MCP', prompt: 'Prompts', skill: 'Skills' })[type])
    .join('、')
  const mode = runtime.executionMode === 'local_deterministic'
    ? '当前只执行本地静态规则，不调用计费接口。'
    : '当前允许在规则结果上使用已确认的 AI 配置。'
  if (runtime.status === 'paused') {
    return {
      description: runtime.serviceAcknowledged
        ? `不会创建或领取新任务；排队任务保留，正在执行的任务会正常完成。执行节点已确认暂停。${mode}`
        : `不会创建或领取新任务；排队任务保留，正在执行的任务会正常完成。${mode}`,
      title: '评测服务已暂停',
    }
  }
  if (runtime.status === 'starting') {
    return {
      description: `开关已开启，正在等待执行节点完成当前配置检查。确认前不会领取任务。${mode}`,
      title: '正在等待执行节点确认',
    }
  }
  if (runtime.status === 'offline') {
    return {
      description: `开关已开启，但执行节点未连接。可在下方启动节点；连接后会自动处理保留的队列。${mode}`,
      title: '执行节点离线',
    }
  }
  if (runtime.status === 'degraded') {
    return {
      description: `当前可处理：${ready || '无'}。不可用内容类型不会阻塞其他评测。${mode}`,
      title: '评测服务部分可用',
    }
  }
  return {
    description: `当前可处理：${ready || '无'}。新任务会自动进入评测队列。${mode}`,
    title: '评测服务运行正常',
  }
}

function workerStateLabel(runtime: SecurityWorkerRuntime) {
  if (runtime.workerCount === 0)
    return runtime.serviceEnabled ? '无在线节点' : '节点状态未知'
  if (runtime.acknowledgedWorkerCount === runtime.workerCount)
    return `${runtime.workerCount} 个节点已确认`
  return `${runtime.acknowledgedWorkerCount} / ${runtime.workerCount} 个节点已确认`
}
