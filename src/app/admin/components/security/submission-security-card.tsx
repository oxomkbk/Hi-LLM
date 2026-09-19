'use client'

import {
  ArrowRight,
  ArrowRotateLeft,
  CircleCheckFill,
  Clock,
  ShieldExclamation,
} from '@gravity-ui/icons'
import { Button, Chip, Spinner } from '@heroui/react'
import Link from 'next/link'

interface SubmissionSecurityCardProps {
  assessmentId?: string | null
  grade?: string | null
  onScan: () => void
  publishReady?: boolean
  reportState?: string | null
  returnHref: string
  scanStatus?: string | null
  scanning: boolean
  score?: number | null
}

export default function SubmissionSecurityCard(props: SubmissionSecurityCardProps) {
  const state = presentationState(props)
  const reportHref = props.assessmentId
    ? `/admin/security/${props.assessmentId}?returnTo=${encodeURIComponent(props.returnHref)}`
    : null

  return (
    <section id="submission-publish-status" data-state={state.key} tabIndex={-1} className="submission-security-card scroll-mt-24">
      <header>
        <span className="submission-security-card__icon">{state.icon}</span>
        <div className="min-w-0">
          <p>自动安全检查</p>
          <h2>{state.title}</h2>
        </div>
        <Chip color={state.color} size="sm" variant="soft">{state.badge}</Chip>
      </header>

      <p className="submission-security-card__summary">{state.description}</p>

      {typeof props.score === 'number'
        ? (
            <dl>
              <div>
                <dt>安全分</dt>
                <dd>{props.score}</dd>
              </div>
              <div>
                <dt>等级</dt>
                <dd>{props.grade ?? '—'}</dd>
              </div>
              <div>
                <dt>发布</dt>
                <dd>{props.publishReady ? '允许' : '暂停'}</dd>
              </div>
            </dl>
          )
        : null}

      <footer>
        {state.canScan
          ? (
              <Button size="sm" variant={state.key === 'failed' ? 'primary' : 'secondary'} isPending={props.scanning} fullWidth onPress={props.onScan}>
                {props.scanning ? <Spinner color="current" size="sm" /> : <ArrowRotateLeft />}
                {props.scanning ? '正在加入检查…' : state.scanLabel}
              </Button>
            )
          : null}
        {reportHref
          ? (
              <Link href={reportHref} className={state.key === 'danger' ? 'submission-security-card__link submission-security-card__link--danger' : 'submission-security-card__link'}>
                {state.key === 'danger' ? '处理危险项' : '查看检查报告'}
                <ArrowRight aria-hidden="true" />
              </Link>
            )
          : null}
      </footer>
    </section>
  )
}

function presentationState(props: SubmissionSecurityCardProps) {
  if (props.publishReady) {
    return {
      badge: '可以发布',
      canScan: false,
      color: 'success' as const,
      description: typeof props.score === 'number' && props.score < 100
        ? '没有发现会伤害设备、程序或数据的危险行为。改进建议仅供参考，不影响发布。'
        : '没有发现会伤害设备、程序或数据的危险行为，可以正常发布。',
      icon: <CircleCheckFill />,
      key: 'ready',
      scanLabel: '',
      title: '检查完成',
    }
  }
  if (props.scanStatus === 'queued' || props.scanStatus === 'preparing' || props.scanStatus === 'running' || props.scanning) {
    return {
      badge: '自动进行中',
      canScan: false,
      color: 'accent' as const,
      description: '系统正在自动检查危险命令、可执行附件和数据外传行为，完成后本页会更新。',
      icon: <Clock />,
      key: 'checking',
      scanLabel: '',
      title: '安全检查中',
    }
  }
  if (props.reportState === 'blocked') {
    return {
      badge: '发布暂停',
      canScan: false,
      color: 'danger' as const,
      description: '发现可能执行危险操作或造成数据损害的内容。处理危险项后即可继续发布。',
      icon: <ShieldExclamation />,
      key: 'danger',
      scanLabel: '',
      title: '危险项待处理',
    }
  }
  const failed = props.reportState === 'failed'
  return {
    badge: failed ? '当前依据待补充' : '等待检查',
    canScan: true,
    color: 'warning' as const,
    description: failed
      ? '当前材料尚不足以形成结论，建议核对来源、权限和说明后重新整理；原始内容不会受影响。'
      : '系统尚未获得当前内容的安全结论，点击后会自动完成检测。',
    icon: <ShieldExclamation />,
    key: failed ? 'failed' : 'waiting',
    scanLabel: failed ? '重新整理资料' : '立即检测',
    title: failed ? '建议核对当前依据' : '等待安全检查',
  }
}
