import { Chip } from '@heroui/react'

interface SecurityStatusCellProps {
  grade?: string | null
  hideScore?: boolean
  historicalGrade?: string | null
  historicalScore?: number | null
  reportState?: string | null
  reviewResolved?: boolean
  scanStatus?: string | null
  score?: number | null
}

const REPORT_META: Record<string, { color: 'danger' | 'default' | 'success' | 'warning', label: string }> = {
  blocked: { color: 'danger', label: '危险项待处理' },
  failed: { color: 'default', label: '当前依据待补充' },
  passed: { color: 'success', label: '已覆盖材料未命中规则' },
  review_required: { color: 'warning', label: '有改进建议' },
  stale: { color: 'warning', label: '参考资料更新中' },
  unassessed: { color: 'default', label: '当前依据待补充' },
}

const SCAN_LABELS: Record<string, string> = {
  preparing: '准备中',
  queued: '排队中',
  running: '扫描中',
}

export default function SecurityStatusCell({
  grade,
  hideScore = false,
  historicalGrade,
  historicalScore,
  reportState,
  reviewResolved = false,
  scanStatus,
  score,
}: SecurityStatusCellProps) {
  const report = REPORT_META[reportState ?? 'unassessed'] ?? REPORT_META.unassessed!
  const displayReport = reviewResolved
    ? { color: 'success' as const, label: '危险项已处理' }
    : report
  return (
    <div className="flex min-w-32 flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip color={displayReport.color} size="sm" variant="soft">{displayReport.label}</Chip>
        {scanStatus && SCAN_LABELS[scanStatus]
          ? (
              <span className="security-live-state">
                <i />
                {SCAN_LABELS[scanStatus]}
              </span>
            )
          : null}
      </div>
      {hideScore
        ? <span className="text-[11px] text-muted">已生成可审计报告</span>
        : typeof score === 'number'
          ? (
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {score}
                /100 ·
                {' '}
                {grade ?? '—'}
                {' '}
                级
              </span>
            )
          : typeof historicalScore === 'number'
            ? (
                <span className="text-[11px] text-muted">
                  上次报告
                  {' '}
                  {historicalScore}
                  /100 ·
                  {' '}
                  {historicalGrade ?? '—'}
                  {' '}
                  级
                </span>
              )
            : <span className="text-[11px] text-muted">当前依据以站内资料为准</span>}
    </div>
  )
}
