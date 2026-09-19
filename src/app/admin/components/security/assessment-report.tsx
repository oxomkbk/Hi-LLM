'use client'

import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRotateLeft,
  CircleStop,
  ShieldCheck,
  TrashBin,
  TriangleExclamation,
} from '@gravity-ui/icons'
import { AlertDialog, Button, Chip, toast } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { presentSecurityPolicyCopy, securityReportDisplayMode } from '@/lib/ai-security/presentation'
import { buildContextualHref } from '@/lib/navigation/return-context'
import { request } from '@/lib/request'
import { formatDate } from '@/lib/utils'

import SecurityReviewPanel from './security-review-panel'
import SecurityStatusCell from './security-status-cell'

import type { SecurityFindingReviewView, SecurityOverrideView } from './security-review-panel'
import type { SecurityCapabilities } from '@/lib/ai-security/capabilities'

export interface AssessmentDetailData {
  assessment: AssessmentView
  capabilities: SecurityCapabilities
  currentReport: CurrentReportView | null
  dimensions: DimensionView[]
  findings: FindingView[]
  history: HistoryView[]
  overrides: SecurityOverrideView[]
}

interface AssessmentView {
  attempt_number: number
  coverage: unknown
  declared_fingerprint: string
  effective_grade: string | null
  effective_score: number | null
  error_code: string | null
  error_message: string | null
  evaluation_method: string | null
  evaluation_model: string | null
  evaluation_schema_version: string | null
  evaluation_summary: string | null
  finished_at: string | null
  id: string
  input_fingerprint: string | null
  is_current: boolean
  max_attempts: number
  original_grade: string | null
  original_score: number | null
  quality_rating: string | null
  quality_score: number | null
  raw_report_available: boolean
  report_state: string | null
  scanner_config_fingerprint: string
  scanner_name: string | null
  scanner_version: string | null
  source_revision: string | null
  status: string
  subject_id: string
  subject_name_snapshot: string
  subject_slug_snapshot: string | null
  subject_type: string
  summary: string | null
}

interface CurrentReportView {
  evaluation_summary: string | null
  finished_at: string | null
  id: string | null
  latest_attempt_error_code: string | null
  latest_attempt_error_message: string | null
  latest_attempt_id: string | null
  latest_attempt_status: string | null
  original_grade: string | null
  original_score: number | null
  quality_rating: string | null
  quality_score: number | null
  report_state: string
  status: string | null
  summary: string | null
}

interface DimensionView {
  dimension: 'applicability' | 'effectiveness' | 'maintainability' | 'reliability' | 'safety'
  display_order: number
  evidence: string[]
  recommendations: string[]
  score: number
  source: 'ai_assisted' | 'deterministic'
  strengths: string[]
  summary: string
  weaknesses: string[]
}

interface FindingView {
  artifact_path: string | null
  description: string
  disposition: 'advisory' | 'hard_block' | 'manual_review'
  end_line: number | null
  id: string
  recommendation: string | null
  reviews: SecurityFindingReviewView[]
  risk_code: string
  severity: string
  start_line: number | null
  title: string
}

interface HistoryView {
  attempt_number: number
  created_at: string
  id: string
  status: string
}

const SEVERITY_META: Record<string, { color: 'danger' | 'default' | 'warning', label: string }> = {
  critical: { color: 'danger', label: '严重' },
  high: { color: 'danger', label: '高危' },
  info: { color: 'default', label: '提示' },
  low: { color: 'default', label: '低危' },
  medium: { color: 'warning', label: '中危' },
}

export default function AssessmentReport({ data, returnHref = null }: { data: AssessmentDetailData, returnHref?: string | null }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const assessment = data.assessment
  const active = ['queued', 'preparing', 'running'].includes(assessment.status)
  const canRetry = (assessment.status === 'failed' || assessment.status === 'cancelled')
    && assessment.attempt_number < assessment.max_attempts
  const reportMode = securityReportDisplayMode(assessment.evaluation_method)
  const hasTrustEvaluation = reportMode === 'hybrid' || reportMode === 'documented'
  const documentedReport = reportMode === 'documented'
  const evidenceReport = reportMode === 'evidence'
  const deterministic = ['deterministic', 'document_evidence'].includes(assessment.evaluation_method ?? '')
  const dangerFindingCount = data.findings.filter(finding => finding.disposition !== 'advisory').length
  const advisoryOnly = dangerFindingCount === 0
  const policyCopy = (value: null | string | undefined) => presentSecurityPolicyCopy(value, {
    advisoryFindingCount: data.findings.length,
    advisoryOnly,
  })

  const act = async () => {
    setPending(true)
    try {
      if (active) {
        await request(`/admin/security-assessments/${assessment.id}/cancel`, { body: '{}', method: 'POST' })
        toast.success('已提交取消请求')
      }
      else if (canRetry) {
        await request(`/admin/security-assessments/${assessment.id}/retry`, { body: '{}', method: 'POST' })
        toast.success('任务已重新入队')
      }
      else {
        await request('/admin/security-assessments', {
          body: JSON.stringify({
            force: true,
            requestId: crypto.randomUUID(),
            subjectId: assessment.subject_id,
            subjectType: assessment.subject_type,
          }),
          method: 'POST',
        })
        toast.success('重新扫描已加入队列')
      }
      router.refresh()
    }
    finally {
      setPending(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await request(`/admin/security-assessments/${assessment.id}`, { method: 'DELETE' })
      toast.success('评测报告与任务历史已删除，原始内容保持不变')
      setDeleteOpen(false)
      router.push(returnHref ?? '/admin/security')
      router.refresh()
    }
    finally {
      setDeleting(false)
    }
  }

  const coverage = assessment.coverage as null | {
    included?: string[]
    label?: string
    level?: string
    partitions?: Record<string, { includedCount?: number, skippedCount?: number, status?: string }>
    skipped?: Array<{ reason: string, ref: string }>
  }

  return (
    <div className="security-report-workspace">
      <div className="security-report-breadcrumb">
        <Link href={returnHref ?? '/admin/security'}>
          <ArrowLeft />
          返回评测台账
        </Link>
        <span>/</span>
        <code>{String(assessment.id).slice(0, 8)}</code>
      </div>

      <header className="security-report-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="secondary">{subjectLabel(assessment.subject_type)}</Chip>
            <span className="font-mono text-[10px] text-muted">
              attempt
              {assessment.attempt_number}
            </span>
          </div>
          <h2>{assessment.subject_name_snapshot}</h2>
          <p>{assessment.subject_slug_snapshot ?? assessment.subject_id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {assessment.raw_report_available
            ? (
                <Button size="sm" variant="secondary" onPress={() => window.location.assign(`/api/admin/security-assessments/${assessment.id}/report`)}>
                  <ArrowDownToLine />
                  下载 SARIF
                </Button>
              )
            : null}
          <Button size="sm" variant={active ? 'danger' : 'primary'} isPending={pending} onPress={() => void act()}>
            {active ? <CircleStop /> : <ArrowRotateLeft />}
            {active
              ? '取消评测'
              : canRetry ? '重新整理资料' : assessment.status === 'failed' ? '重新整理资料' : '重新扫描'}
          </Button>
          <Button size="sm" variant="danger-soft" isDisabled={active} onPress={() => setDeleteOpen(true)}>
            <TrashBin />
            删除报告
          </Button>
        </div>
      </header>

      {data.currentReport?.latest_attempt_status === 'failed'
        ? (
            <section className="security-previous-report-notice">
              <TriangleExclamation />
              <div>
                <strong>参考资料正在自动补充</strong>
                <p>{data.currentReport.id ? '现有参考结论继续保留，系统会在后续自动重新处理。' : '本次没有形成新的参考结论，使用前建议核对来源、权限与当前材料。'}</p>
              </div>
              {data.currentReport.id && data.currentReport.id !== assessment.id
                ? (
                    <Button size="sm" variant="secondary" onPress={() => router.push(buildContextualHref(`/admin/security/${data.currentReport!.id}`, returnHref ?? '/admin/security'))}>
                      查看现有参考报告
                    </Button>
                  )
                : null}
            </section>
          )
        : null}

      {evidenceReport && assessment.status === 'completed'
        ? (
            <section className="security-evidence-report">
              <ShieldCheck />
              <div>
                <strong>静态安全证据报告</strong>
                <p>仅展示已获取材料中的规则发现、覆盖范围与可定位证据；未执行第三方代码，也不生成无依据的质量评分。</p>
              </div>
            </section>
          )
        : null}

      {reportMode === 'legacy' && assessment.status === 'completed'
        ? (
            <section className="security-legacy-report">
              <TriangleExclamation />
              <div>
                <strong>这是旧版静态安全报告</strong>
                <p>旧报告只记录风险分和等级。重新扫描后会生成可审计的静态证据报告；只有完成语义质量评测时才展示五维质量分。</p>
              </div>
            </section>
          )
        : null}

      <SecurityReviewPanel
        isCurrent={assessment.is_current}
        assessmentId={assessment.id}
        capabilities={data.capabilities}
        deterministic={deterministic}
        findings={data.findings}
        overrides={data.overrides}
        reportState={assessment.report_state}
        returnHref={returnHref}
        status={assessment.status}
      />

      <section className="security-report-overview">
        <div data-quality={hasTrustEvaluation} className="security-report-score">
          <span>
            {hasTrustEvaluation
              ? assessment.quality_score?.toFixed(1)
              : evidenceReport ? data.findings.length : assessment.effective_grade ?? assessment.original_grade ?? '—'}
          </span>
          <strong>
            {hasTrustEvaluation
              ? `/ 5 · ${ratingLabel(assessment.quality_rating)}`
              : evidenceReport ? '条规则发现' : `${assessment.effective_score ?? assessment.original_score ?? '—'} / 100`}
          </strong>
          <small>
            {hasTrustEvaluation
              ? documentedReport ? 'MATERIAL EVIDENCE SCORE' : 'AI-ASSISTED SCORE'
              : evidenceReport ? 'STATIC EVIDENCE' : 'LEGACY SECURITY SCORE'}
          </small>
        </div>
        <div className="security-report-conclusion">
          <p className="security-kicker">ASSESSMENT CONCLUSION</p>
          <SecurityStatusCell
            grade={assessment.effective_grade ?? assessment.original_grade}
            hideScore={reportMode !== 'legacy'}
            reportState={assessment.report_state}
            scanStatus={active ? assessment.status : null}
            score={assessment.effective_score ?? assessment.original_score}
          />
          <p>{policyCopy(assessment.evaluation_summary ?? assessment.summary ?? '当前依据尚不足以形成完整结论，使用前建议核对来源与权限范围。')}</p>
          {deterministic ? <p className="text-xs font-semibold text-muted">未执行运行时验证</p> : null}
        </div>
        <dl className="security-report-facts">
          <div>
            <dt>覆盖</dt>
            <dd>{coverage?.label ?? '—'}</dd>
          </div>
          <div>
            <dt>固定版本</dt>
            <dd><code>{assessment.source_revision?.slice(0, 12) ?? '—'}</code></dd>
          </div>
          <div>
            <dt>评测方法</dt>
            <dd>
              {assessment.evaluation_method === 'hybrid'
                ? '规则扫描 + AI 辅助'
                : assessment.evaluation_method === 'document_evidence'
                  ? 'README / SKILL / 配置材料'
                  : assessment.evaluation_method === 'deterministic'
                    ? '静态规则证据'
                    : '当前依据待补充'}
            </dd>
          </div>
          <div>
            <dt>完成时间</dt>
            <dd>{assessment.finished_at ? formatDate(assessment.finished_at, 'datetime') : '资料处理中'}</dd>
          </div>
        </dl>
      </section>

      {hasTrustEvaluation
        ? (
            <section className="security-trust-dossier">
              <div className="security-section-heading">
                <div>
                  <p className="security-kicker">{documentedReport ? 'DOCUMENT EVIDENCE' : 'TRUSTED EVALUATION'}</p>
                  <h3>{documentedReport ? '五维材料评测' : '五维可信评测'}</h3>
                </div>
                <span>{documentedReport ? '所有结论均可回到当前材料依据' : '安全可信为红线维度 · AI 结果仅供参考'}</span>
              </div>
              <div className="security-trust-overview">
                <RadarChart dimensions={data.dimensions} />
                <div className="security-dimension-index">
                  {data.dimensions.map(dimension => (
                    <div key={dimension.dimension}>
                      <span>
                        <b>{dimensionLetter(dimension.dimension)}</b>
                        {dimensionLabel(dimension.dimension)}
                      </span>
                      <i><em style={{ width: `${dimension.score * 20}%` }} /></i>
                      <strong>{dimension.score.toFixed(1)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="security-dimension-details">
                {data.dimensions.map(dimension => (
                  <article key={dimension.dimension}>
                    <header>
                      <span>{dimensionLetter(dimension.dimension)}</span>
                      <div>
                        <p>{dimension.dimension}</p>
                        <h4>{dimensionLabel(dimension.dimension)}</h4>
                      </div>
                      <strong>
                        {dimension.score.toFixed(1)}
                        {' '}
                        <small>/ 5</small>
                      </strong>
                    </header>
                    <p>{policyCopy(dimension.summary)}</p>
                    <div className="security-dimension-columns">
                      <DimensionList title="优势" empty="暂无单独列出的优势" items={dimension.strengths} />
                      <DimensionList title="改进点" empty="未发现明显结构性不足" items={dimension.weaknesses} />
                      <DimensionList
                        title="建议"
                        empty="保持当前实践并在内容变化后复评"
                        items={dimension.dimension === 'safety' ? dimension.recommendations.map(policyCopy) : dimension.recommendations}
                      />
                    </div>
                    {dimension.evidence.length
                      ? (
                          <footer>
                            <b>依据</b>
                            {dimension.evidence.map(item => <span key={item}>{item}</span>)}
                          </footer>
                        )
                      : null}
                  </article>
                ))}
              </div>
            </section>
          )
        : null}

      <div className="security-report-grid">
        <main>
          <section className="security-report-section">
            <div className="security-section-heading">
              <div>
                <p className="security-kicker">FINDINGS</p>
                <h3>检测发现</h3>
              </div>
              <span>
                {dangerFindingCount > 0 ? `${dangerFindingCount} 项危险 · ` : ''}
                {data.findings.length - dangerFindingCount}
                {' 条建议'}
              </span>
            </div>
            {data.findings.length === 0
              ? <div className="security-empty-report">当前报告没有风险发现。</div>
              : (
                  <div className="security-finding-list">
                    {data.findings.map(finding => (
                      <article key={finding.id} data-disposition={finding.disposition} data-severity={finding.severity} className="security-finding-item">
                        <div className="security-finding-index">{finding.risk_code}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip color={SEVERITY_META[finding.severity]?.color ?? 'default'} size="sm" variant="soft">{SEVERITY_META[finding.severity]?.label ?? finding.severity}</Chip>
                            <Chip color={finding.disposition === 'advisory' ? 'default' : 'danger'} size="sm" variant="soft">
                              {finding.disposition === 'advisory' ? '改进建议' : '发布前处理'}
                            </Chip>
                            <h4>{finding.title}</h4>
                          </div>
                          <p>{finding.description}</p>
                          {finding.artifact_path
                            ? (
                                <code>
                                  {finding.artifact_path}
                                  {finding.start_line ? `:${finding.start_line}${finding.end_line ? `-${finding.end_line}` : ''}` : ''}
                                </code>
                              )
                            : null}
                          {finding.recommendation
                            ? (
                                <div className="security-remediation">
                                  <strong>{finding.disposition === 'advisory' ? '改进建议' : '处理方式'}</strong>
                                  <span>{policyCopy(finding.recommendation)}</span>
                                </div>
                              )
                            : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
          </section>

          <section className="security-report-section">
            <div className="security-section-heading">
              <div>
                <p className="security-kicker">COVERAGE</p>
                <h3>评测覆盖</h3>
              </div>
            </div>
            {!coverage
              ? <div className="security-empty-report">当前依据待补充。</div>
              : (
                  <div className="security-coverage-layout">
                    <div>
                      <h4>已纳入文件</h4>
                      <ul>{coverage.included?.map(path => <li key={path}><code>{path}</code></li>)}</ul>
                    </div>
                    <div>
                      <h4>分区统计</h4>
                      <dl>
                        {Object.entries(coverage.partitions ?? {}).map(([name, partition]) => (
                          <div key={name}>
                            <dt>{name}</dt>
                            <dd>
                              {partition.includedCount ?? 0}
                              {' '}
                              纳入 /
                              {' '}
                              {partition.skippedCount ?? 0}
                              {' '}
                              跳过
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {coverage.skipped?.length
                      ? (
                          <div>
                            <h4>建议核对</h4>
                            <ul>
                              {coverage.skipped.map(item => (
                                <li key={`${item.ref}:${item.reason}`}>
                                  <strong>{coverageSkipLabel(item.ref)}</strong>
                                  ：
                                  {coverageSkipReason(item.ref, item.reason)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      : null}
                  </div>
                )}
          </section>
        </main>

        <aside>
          {assessment.error_code
            ? (
                <details className="security-report-sidecard">
                  <summary>系统诊断信息</summary>
                  <dl>
                    <div>
                      <dt>诊断代码</dt>
                      <dd><code>{assessment.error_code}</code></dd>
                    </div>
                    <div>
                      <dt>技术信息</dt>
                      <dd>{assessment.error_message ?? '未记录更多技术信息'}</dd>
                    </div>
                  </dl>
                </details>
              )
            : null}
          <section className="security-report-sidecard">
            <p className="security-kicker">IMMUTABLE INPUT</p>
            <h3>证据指纹</h3>
            <dl>
              <div>
                <dt>声明内容</dt>
                <dd><code>{assessment.declared_fingerprint}</code></dd>
              </div>
              <div>
                <dt>扫描输入</dt>
                <dd><code>{assessment.input_fingerprint ?? '—'}</code></dd>
              </div>
              <div>
                <dt>扫描配置</dt>
                <dd><code>{assessment.scanner_config_fingerprint}</code></dd>
              </div>
              <div>
                <dt>质量模型</dt>
                <dd>{assessment.evaluation_model ?? '旧版报告未使用'}</dd>
              </div>
            </dl>
          </section>
          <section className="security-report-sidecard">
            <p className="security-kicker">ATTEMPT HISTORY</p>
            <h3>任务历史</h3>
            <ol className="security-history-list">
              {data.history.map(item => (
                <li key={item.id} data-current={item.id === assessment.id}>
                  <i />
                  <div>
                    <strong>
                      第
                      {item.attempt_number}
                      {' '}
                      次 ·
                      {taskStatusLabel(item.status)}
                    </strong>
                    <span>{formatDate(item.created_at, 'datetime')}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <AlertDialog.Backdrop isDismissable={!deleting} isKeyboardDismissDisabled={deleting} isOpen={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-110">
            <AlertDialog.CloseTrigger aria-label="关闭删除确认" onPress={() => setDeleteOpen(false)} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>删除这份评测报告？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>将删除本次评测及其重试历史、风险发现和五维结论，不会删除原始 Skills、MCP 或 Prompts。若这是当前报告，前台将显示“当前依据待补充”。此操作不可撤销。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" isDisabled={deleting} slot="close" onPress={() => setDeleteOpen(false)}>取消</Button>
              <Button variant="danger" isPending={deleting} onPress={() => void remove()}>确认删除报告</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}

function coverageSkipLabel(reference: string) {
  return ({
    'skill/external-source-page': '外部来源未抓取',
    'skill/isolated-deep-scanner': '深度扫描未执行',
    'skill/source-unavailable': '当前依据未包含源码',
  } as Record<string, string>)[reference] ?? reference
}

function coverageSkipReason(reference: string, fallback: string) {
  return ({
    'mcp/runtime-dynamic-assessment': '未连接远程服务或执行安装命令；当前结论仅覆盖可见配置和说明材料。',
    'skill/isolated-deep-scanner': '未执行第三方代码或运行时行为；当前结论基于已纳入材料。',
  } as Record<string, string>)[reference] ?? fallback
}

function dimensionLabel(code: DimensionView['dimension']) {
  return ({ applicability: '场景适配', effectiveness: '使用效果', maintainability: '结构规范', reliability: '稳定可靠', safety: '安全可信' } as const)[code]
}

function dimensionLetter(code: DimensionView['dimension']) {
  return ({ applicability: 'A', effectiveness: 'E', maintainability: 'M', reliability: 'R', safety: 'S' } as const)[code]
}

function DimensionList({ empty, items, title }: { empty: string, items: string[], title: string }) {
  return (
    <div>
      <h5>{title}</h5>
      <ul>{(items.length ? items : [empty]).map(item => <li key={item}>{item}</li>)}</ul>
    </div>
  )
}

function RadarChart({ dimensions }: { dimensions: DimensionView[] }) {
  const ordered = ['safety', 'reliability', 'applicability', 'maintainability', 'effectiveness']
    .map(code => dimensions.find(dimension => dimension.dimension === code)!)
  const center = 92
  const radius = 66
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5
    return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`
  }
  const polygon = (scale: number) => ordered.map((_, index) => point(index, scale)).join(' ')
  const scorePolygon = ordered.map((dimension, index) => point(index, dimension.score / 5)).join(' ')
  return (
    <figure aria-label={ordered.map(item => `${dimensionLabel(item.dimension)} ${item.score.toFixed(1)} 分`).join('，')} className="security-radar">
      <svg role="img" viewBox="0 0 184 184">
        {[1, 0.75, 0.5, 0.25].map(scale => <polygon key={scale} points={polygon(scale)} className="radar-grid" />)}
        {ordered.map((dimension, index) => <line key={`axis-${dimension.dimension}`} x1={center} x2={point(index, 1).split(',')[0]} y1={center} y2={point(index, 1).split(',')[1]} />)}
        <polygon points={scorePolygon} className="radar-score" />
        {ordered.map((dimension, index) => {
          const [cx, cy] = point(index, dimension.score / 5).split(',')
          return <circle key={dimension.dimension} cx={cx} cy={cy} r="3" />
        })}
      </svg>
      <figcaption>五个维度按 0–5 分归一化展示</figcaption>
    </figure>
  )
}

function ratingLabel(value: string | null) {
  return ({ exceptional: '卓越', excellent: '优秀', fair: '一般', good: '良好', poor: '需改进' } as Record<string, string>)[value ?? ''] ?? '待评定'
}

function subjectLabel(type: string) {
  return ({ mcp: 'MCP', mcp_submission: 'MCP 投稿', prompt: 'Prompt', skill: 'Skill', skill_submission: 'Skill 投稿' } as Record<string, string>)[type] ?? type
}

function taskStatusLabel(status: string) {
  return ({ cancelled: '已停止', completed: '已完成', failed: '资料处理未完成', preparing: '整理材料', queued: '等待处理', running: '分析材料' } as Record<string, string>)[status] ?? status
}
