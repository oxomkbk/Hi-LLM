'use client'

import {
  ArrowRight,
  ArrowRotateLeft,
  Check,
  CircleCheckFill,
  ShieldCheck,
  TriangleExclamation,
} from '@gravity-ui/icons'
import {
  Button,
  Chip,
  FieldError,
  Form,
  Label,
  Modal,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import type { SecurityCapabilities } from '@/lib/ai-security/capabilities'
import type { FormEvent } from 'react'

export interface SecurityFindingReviewView {
  createdAt: string
  createdBy: string
  decision: string
  id: string
  reason: string
  reviewOfId: string | null
}

export interface SecurityOverrideView {
  created_at: string
  created_by: string
  created_by_name: string | null
  expires_at: string | null
  id: string
  kind: string
  reason: string
  revoked_at: string | null
  revoked_by: string | null
  revoked_by_name: string | null
}

export interface SecurityReviewFindingView {
  disposition: 'advisory' | 'hard_block' | 'manual_review'
  id: string
  risk_code: string
  reviews: SecurityFindingReviewView[]
  severity: string
  title: string
}

interface ReviewAction {
  action: 'accept_medium' | 'approve_false_positive' | 'mark_false_positive' | 'propose_false_positive' | 'reopen' | 'revoke_override' | 'temporary_high'
  description: string
  findingId?: string
  overrideId?: string
  reviewOfId?: string
  title: string
}

export default function SecurityReviewPanel(props: {
  assessmentId: string
  capabilities: SecurityCapabilities
  deterministic?: boolean
  findings: SecurityReviewFindingView[]
  isCurrent: boolean
  overrides: SecurityOverrideView[]
  reportState: string | null
  returnHref?: string | null
  status: string
}) {
  const router = useRouter()
  const [action, setAction] = useState<ReviewAction | null>(null)
  const [pending, setPending] = useState(false)
  const [reason, setReason] = useState('')
  const currentOverrides = useMemo(
    () => props.overrides.filter(item => !item.revoked_at && (!item.expires_at || new Date(item.expires_at) > new Date())),
    [props.overrides],
  )
  const temporaryHigh = currentOverrides.find(item => item.kind === 'temporary_high')
  const reviewable = props.status === 'completed' && props.isCurrent
  const actionableFindings = props.findings.filter(finding => finding.disposition !== 'advisory')
  const advisoryCount = props.findings.length - actionableFindings.length
  const findingResolution = reportFindingsResolved(actionableFindings)
  const reviewResolved = Boolean(temporaryHigh || findingResolution)
  const hasCritical = actionableFindings.some(finding => finding.disposition === 'hard_block')
  const publishReady = reviewable && (
    props.reportState === 'passed'
    || reviewResolved
    || actionableFindings.length === 0
  )

  const open = (next: ReviewAction) => {
    setReason('')
    setAction(next)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!action || pending)
      return
    setPending(true)
    try {
      const findingAction = action.findingId !== undefined
      await request(findingAction
        ? `/admin/security-assessments/${props.assessmentId}/findings/${action.findingId}/review`
        : `/admin/security-assessments/${props.assessmentId}/review`, {
        body: JSON.stringify({
          action: action.action,
          overrideId: action.overrideId,
          reason,
          reviewOfId: action.reviewOfId,
        }),
        method: 'POST',
      })
      toast.success('处理结果已保存')
      setAction(null)
      setReason('')
      router.refresh()
    }
    finally {
      setPending(false)
    }
  }

  if (publishReady) {
    return (
      <section data-state="ready" className="security-publish-decision">
        <span><CircleCheckFill /></span>
        <div>
          <p className="security-kicker">PUBLISH STATUS</p>
          <h3>可以发布</h3>
          <p>
            {props.deterministic ? '已覆盖材料中没有未处理的危险项；本次未执行运行时验证。' : '没有未处理的危险行为。'}
            {advisoryCount > 0 ? `另有 ${advisoryCount} 条改进建议，仅供参考。` : '当前内容已满足发布规则。'}
          </p>
        </div>
        {props.returnHref
          ? (
              <Link href={props.returnHref} className="security-publish-decision__action">
                返回并发布
                <ArrowRight aria-hidden="true" />
              </Link>
            )
          : null}
      </section>
    )
  }

  return (
    <section className="security-review-panel">
      <header>
        <div>
          <p className="security-kicker">PUBLISH STATUS</p>
          <h3>{reviewable ? '危险项待处理' : '安全检查尚未完成'}</h3>
        </div>
        <Chip color={reviewable ? reviewTone(props.reportState, reviewResolved) : 'default'} size="sm" variant="soft">
          {reviewable ? reviewLabel(props.reportState, reviewResolved) : '暂不可发布'}
        </Chip>
      </header>

      <p className="security-review-intro">
        这里只处理可能执行危险操作、损害设备或外传数据的项目。普通建议不会出现在人工处理列表中。
      </p>

      {!reviewable
        ? (
            <div className="security-review-notice">
              <TriangleExclamation />
              <span>当前任务还不能决定是否发布。请等待自动检查完成，或重新检测当前内容。</span>
            </div>
          )
        : null}

      {reviewable && props.reportState === 'blocked'
        ? (
            <ReviewResolution
              acceptLabel="临时放行"
              active={temporaryHigh}
              disabled={hasCritical || !props.capabilities.canCreateTemporaryHigh}
              label="危险项处理"
              resolved={Boolean(temporaryHigh || findingResolution)}
              resolvedCopy={temporaryHigh?.expires_at
                ? `已临时放行至 ${formatDate(temporaryHigh.expires_at, 'datetime')}。`
                : '高风险项已完成处置。'}
              unresolvedCopy={hasCritical
                ? '包含严重危险，不能直接放行。请整改后重新检测，或逐项完成双人误报确认。'
                : '疑似危险操作会暂停发布；确认是误报可逐项处理，主管理员也可限时放行。'}
              onAccept={() => open({
                action: 'temporary_high',
                description: '默认放行 7 天。请写明业务必要性、补救措施和后续整改安排。',
                title: '临时放行高风险',
              })}
              onRevoke={temporaryHigh
                ? () => open({
                    action: 'revoke_override',
                    description: '撤销后将立即恢复高风险阻断。请填写撤销原因。',
                    overrideId: temporaryHigh.id,
                    title: '撤销临时放行',
                  })
                : undefined}
            />
          )
        : null}

      {reviewable && actionableFindings.length > 0
        ? (
            <div className="security-review-findings">
              {actionableFindings.map((finding) => {
                const state = findingReviewState(finding.reviews)
                return (
                  <div key={finding.id}>
                    <div className="min-w-0">
                      <span>{finding.risk_code}</span>
                      <strong>{finding.title}</strong>
                      <small>{findingReviewCopy(state)}</small>
                    </div>
                    <FindingReviewAction
                      capabilities={props.capabilities}
                      finding={finding}
                      state={state}
                      onOpen={open}
                    />
                  </div>
                )
              })}
            </div>
          )
        : null}

      <Modal.Backdrop isOpen={Boolean(action)} onOpenChange={openState => !openState && setAction(null)}>
        <Modal.Container placement="auto">
          <Modal.Dialog className="sm:max-w-[480px]">
            <Modal.CloseTrigger aria-label="关闭处理窗口" onPress={() => setAction(null)} />
            <Modal.Header>
              <Modal.Icon className="bg-warning-soft text-warning-soft-foreground">
                <ShieldCheck className="size-5" />
              </Modal.Icon>
              <div>
                <Modal.Heading>{action?.title}</Modal.Heading>
                <p className="mt-1 text-xs leading-5 text-muted">{action?.description}</p>
              </div>
            </Modal.Header>
            <Form validationBehavior="aria" onSubmit={submit}>
              <Modal.Body className="w-full px-6 py-4">
                <TextField
                  name="reason"
                  isRequired
                  fullWidth
                  maxLength={2000}
                  minLength={10}
                  value={reason}
                  onChange={setReason}
                >
                  <Label>处理说明</Label>
                  <TextArea variant="secondary" placeholder="至少 10 个字，说明判断依据和后续处理方式。" rows={5} />
                  <FieldError />
                </TextField>
              </Modal.Body>
              <Modal.Footer className="w-full">
                <Button type="button" variant="secondary" isDisabled={pending} onPress={() => setAction(null)}>取消</Button>
                <Button type="submit" isPending={pending}>确认并记录</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  )
}

function FindingReviewAction(props: {
  capabilities: SecurityCapabilities
  finding: SecurityReviewFindingView
  onOpen: (action: ReviewAction) => void
  state: ReturnType<typeof findingReviewState>
}) {
  const elevated = props.finding.severity === 'high' || props.finding.severity === 'critical'
  if (props.state.status === 'resolved') {
    return (
      <Button
        size="sm" variant="tertiary" onPress={() => props.onOpen({
          action: 'reopen',
          description: '重新打开后，该风险项将恢复为有效风险。请说明新的证据或判断变化。',
          findingId: props.finding.id,
          reviewOfId: props.state.reviewId ?? undefined,
          title: '重新打开风险项',
        })}
      >
        重新打开
      </Button>
    )
  }
  if (props.state.status === 'pending') {
    return props.capabilities.canApproveHighCritical
      ? (
          <Button
            size="sm" variant="secondary" onPress={() => props.onOpen({
              action: 'approve_false_positive',
              description: '高危误报需要由另一位管理员独立复核。系统会拒绝提议人批准自己的提议。',
              findingId: props.finding.id,
              reviewOfId: props.state.reviewId ?? undefined,
              title: '批准高危误报提议',
            })}
          >
            二次复核
          </Button>
        )
      : <Chip color="warning" size="sm" variant="soft">等待主管复核</Chip>
  }
  return (
    <Button
      size="sm" variant="secondary" onPress={() => props.onOpen({
        action: elevated ? 'propose_false_positive' : 'mark_false_positive',
        description: elevated
          ? '提交后不会立即忽略风险，需要另一位系统主管理员批准。'
          : '标记后该风险仍保留在原始报告中，但会显示管理员的误报判定。',
        findingId: props.finding.id,
        title: elevated ? '提议判定为误报' : '标记为误报',
      })}
    >
      {elevated ? '提议误报' : '标记误报'}
    </Button>
  )
}

function findingReviewCopy(state: ReturnType<typeof findingReviewState>) {
  if (state.status === 'resolved')
    return '管理员已判定为误报，原始发现仍保留。'
  if (state.status === 'pending')
    return '误报提议等待另一位主管理员批准。'
  return '尚未进行管理员处置。'
}

function findingReviewState(reviews: SecurityFindingReviewView[]) {
  const reopened = new Set(reviews.filter(item => item.decision === 'reopen').map(item => item.reviewOfId))
  const direct = reviews.find(item => item.decision === 'false_positive' && !reopened.has(item.id))
  if (direct)
    return { reviewId: direct.id, status: 'resolved' as const }
  const approval = reviews.find(item => item.decision === 'false_positive_approved' && !reopened.has(item.id))
  if (approval)
    return { reviewId: approval.id, status: 'resolved' as const }
  const approvedProposalIds = new Set(reviews.filter(item => item.decision === 'false_positive_approved').map(item => item.reviewOfId))
  const proposal = reviews.find(item => item.decision === 'false_positive_proposed' && !approvedProposalIds.has(item.id))
  if (proposal)
    return { reviewId: proposal.id, status: 'pending' as const }
  return { reviewId: null, status: 'open' as const }
}

function reportFindingsResolved(findings: SecurityReviewFindingView[]) {
  return findings.length > 0
    && findings.every(finding => findingReviewState(finding.reviews).status === 'resolved')
}

function reviewLabel(reportState: string | null, resolved: boolean) {
  if (resolved)
    return '危险项已处理'
  if (reportState === 'review_required')
    return '危险项待处理'
  if (reportState === 'blocked')
    return '风险阻断'
  return '无需处置'
}

function ReviewResolution(props: {
  acceptLabel?: string
  active?: SecurityOverrideView
  disabled?: boolean
  label: string
  onAccept: () => void
  onRevoke?: () => void
  resolved: boolean
  resolvedCopy: string
  unresolvedCopy: string
}) {
  return (
    <div data-resolved={props.resolved} className="security-review-resolution">
      <div>
        {props.resolved ? <Check /> : <TriangleExclamation />}
        <span>
          <strong>{props.label}</strong>
          <small>{props.resolved ? props.resolvedCopy : props.unresolvedCopy}</small>
        </span>
      </div>
      {props.resolved
        ? (
            props.onRevoke
              ? (
                  <Button size="sm" variant="tertiary" onPress={props.onRevoke}>
                    <ArrowRotateLeft />
                    撤销
                  </Button>
                )
              : <Chip color="success" size="sm" variant="soft">风险项已处理</Chip>
          )
        : <Button size="sm" variant="primary" isDisabled={props.disabled} onPress={props.onAccept}>{props.acceptLabel ?? '处理危险项'}</Button>}
    </div>
  )
}

function reviewTone(reportState: string | null, resolved: boolean): 'danger' | 'default' | 'success' | 'warning' {
  if (resolved)
    return 'success'
  if (reportState === 'blocked')
    return 'danger'
  if (reportState === 'review_required')
    return 'warning'
  return 'default'
}
