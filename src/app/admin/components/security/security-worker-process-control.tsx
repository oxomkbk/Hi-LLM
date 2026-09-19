'use client'

import { CircleStop, Play } from '@gravity-ui/icons'
import { AlertDialog, Button, Spinner, toast } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiRequestError, request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import { bootLabel, processCopy, unavailableControlCopy } from './security-worker-process-presentation'

import type { SecurityWorkerProcessAction, SecurityWorkerProcessState } from '@/lib/ai-security/worker-process'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'
import type { IResponse } from '@/types'

interface SecurityWorkerControlResponse extends SecurityWorkerControlSnapshot {
  action: SecurityWorkerProcessAction
  disposition: 'accepted' | 'noop'
}

interface SecurityWorkerControlSnapshot {
  process: SecurityWorkerProcessState
  runtime: SecurityWorkerRuntime
}

export default function SecurityWorkerProcessControl({ onRuntimeChange, runtime }: {
  onRuntimeChange: (runtime: SecurityWorkerRuntime) => void
  runtime: SecurityWorkerRuntime
}) {
  const [confirmStop, setConfirmStop] = useState(false)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<SecurityWorkerProcessAction | null>(null)
  const [snapshot, setSnapshot] = useState<SecurityWorkerControlSnapshot | null>(null)
  const fastPollCountRef = useRef(0)
  const onRuntimeChangeRef = useRef(onRuntimeChange)

  useEffect(() => {
    onRuntimeChangeRef.current = onRuntimeChange
  }, [onRuntimeChange])

  const load = useCallback(async (background = false, signal?: AbortSignal) => {
    if (!background)
      setLoading(true)
    try {
      const next = await fetchWorkerSnapshot(signal)
      setSnapshot(next)
      setError(false)
      onRuntimeChangeRef.current(next.runtime)
    }
    catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === 'AbortError'))
        setError(true)
    }
    finally {
      if (!background)
        setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(false, controller.signal)
    return () => controller.abort()
  }, [load])

  const processState = snapshot?.process
  const isTransitioning = processState?.status === 'activating' || processState?.status === 'deactivating'
  const isWaitingForHeartbeat = processState?.status === 'active'
    && (snapshot?.runtime.status === 'offline' || snapshot?.runtime.status === 'starting')

  useEffect(() => {
    if (!snapshot || error || pendingAction)
      return
    const fast = (isTransitioning || isWaitingForHeartbeat) && fastPollCountRef.current < 12
    const timer = window.setTimeout(() => {
      if (fast)
        fastPollCountRef.current += 1
      void load(true)
    }, fast ? 2_500 : 15_000)
    return () => window.clearTimeout(timer)
  }, [error, isTransitioning, isWaitingForHeartbeat, load, pendingAction, snapshot])

  const perform = async (action: SecurityWorkerProcessAction, confirmInterrupt = false) => {
    if (pendingAction)
      return
    setPendingAction(action)
    try {
      const result = await request<SecurityWorkerControlResponse>('/admin/security-worker', {
        body: JSON.stringify({ action, confirmInterrupt }),
        method: 'POST',
      })
      setSnapshot({ process: result.data.process, runtime: result.data.runtime })
      onRuntimeChangeRef.current(result.data.runtime)
      fastPollCountRef.current = 0
      toast.success(result.data.disposition === 'noop'
        ? action === 'start' ? '执行节点已在运行' : '执行节点已经关闭'
        : action === 'start' ? '正在启动执行节点' : '正在关闭执行节点')
    }
    catch (actionError) {
      if (actionError instanceof ApiRequestError && actionError.code === 'SECURITY_WORKER_ACTIVE_JOBS')
        setConfirmStop(true)
      await load(true)
    }
    finally {
      setPendingAction(null)
    }
  }

  const requestStop = () => {
    const inFlight = snapshot?.runtime.queue.inFlight ?? runtime.queue.inFlight
    if (inFlight > 0) {
      setConfirmStop(true)
      return
    }
    void perform('stop')
  }

  if (loading && !snapshot) {
    return (
      <div aria-live="polite" data-state="loading" className="security-worker-control">
        <span className="security-worker-control__mark"><Spinner color="current" size="sm" /></span>
        <div className="security-worker-control__body">
          <strong>正在读取执行节点</strong>
          <p>正在核对服务器进程与心跳状态。</p>
        </div>
      </div>
    )
  }

  if (error || !processState) {
    return (
      <div aria-live="polite" data-state="unavailable" className="security-worker-control">
        <span aria-hidden="true" className="security-worker-control__mark"><i /></span>
        <div className="security-worker-control__body">
          <strong>节点状态暂时无法读取</strong>
          <p>主站仍可使用，刷新后可重新连接控制服务。</p>
        </div>
        <div className="security-worker-control__action">
          <Button size="sm" variant="secondary" onPress={() => void load(false)}>重新读取</Button>
        </div>
      </div>
    )
  }

  const copy = processCopy(processState, snapshot.runtime)
  const active = processState.status === 'active'
    || processState.status === 'activating'
    || processState.status === 'deactivating'
  const actionDisabled = !processState.controlAvailable || isTransitioning || Boolean(pendingAction)
  const inFlight = snapshot.runtime.queue.inFlight
  const unavailableControl = unavailableControlCopy(processState.controlUnavailableReason)

  return (
    <>
      <div aria-live="polite" data-state={copy.tone} className="security-worker-control">
        <span aria-hidden="true" className="security-worker-control__mark"><i /></span>
        <div className="security-worker-control__body">
          <div className="security-worker-control__heading">
            <strong>{copy.title}</strong>
            {processState.mainPid ? <span>{`PID ${processState.mainPid}`}</span> : null}
          </div>
          <p>{copy.description}</p>
          <div className="security-worker-control__facts">
            <span>{bootLabel(processState.enabledAtBoot)}</span>
            {snapshot.runtime.lastSeenAt
              ? <span>{`心跳 ${formatDate(snapshot.runtime.lastSeenAt, 'datetime')}`}</span>
              : null}
          </div>
        </div>
        <div className="security-worker-control__action">
          {processState.controlAvailable
            ? (
                <Button
                  size="sm"
                  variant={active ? 'danger' : 'primary'}
                  isDisabled={actionDisabled}
                  isPending={Boolean(pendingAction)}
                  onPress={active ? requestStop : () => void perform('start')}
                >
                  {active ? <CircleStop /> : <Play />}
                  {pendingAction === 'start'
                    ? '启动中'
                    : pendingAction === 'stop'
                      ? '关闭中'
                      : isTransitioning
                        ? processState.status === 'activating' ? '启动中' : '关闭中'
                        : active ? '关闭节点' : '启动节点'}
                </Button>
              )
            : <Button size="sm" variant="secondary" isDisabled>{unavailableControl.label}</Button>}
          <small>
            {processState.controlAvailable
              ? active ? '关闭后任务会保留并自动重试' : '启动后接管保留队列'
              : unavailableControl.hint}
          </small>
        </div>
      </div>

      <AlertDialog.Backdrop
        variant="blur"
        isDismissable={!pendingAction}
        isKeyboardDismissDisabled={Boolean(pendingAction)}
        isOpen={confirmStop}
        onOpenChange={setConfirmStop}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="security-worker-stop-dialog">
            <AlertDialog.CloseTrigger aria-label="关闭确认" onPress={() => setConfirmStop(false)} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>关闭执行节点？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {inFlight > 0 ? `当前有 ${inFlight} 个任务正在执行。` : ''}
                关闭会安全中断当前任务，稍后启动节点时自动重试，排队数据不会丢失。
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" isDisabled={Boolean(pendingAction)} slot="close">保持运行</Button>
              <Button
                variant="danger"
                isPending={pendingAction === 'stop'}
                onPress={() => {
                  setConfirmStop(false)
                  void perform('stop', true)
                }}
              >
                确认关闭
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  )
}

async function fetchWorkerSnapshot(signal?: AbortSignal) {
  const response = await fetch('/api/admin/security-worker', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  const result = await response.json().catch(() => null) as IResponse<SecurityWorkerControlSnapshot> | null
  if (!response.ok || !result?.data)
    throw new Error(result?.msg || '执行节点状态加载失败')
  return result.data
}
