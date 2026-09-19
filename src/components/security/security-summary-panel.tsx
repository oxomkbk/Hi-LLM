import { Clock, ShieldCheck, ShieldExclamation } from '@gravity-ui/icons'

import { presentSecurityPolicyCopy, securityReportDisplayMode } from '@/lib/ai-security/presentation'

import SecurityBadge from './security-badge'
import SecurityTrustRadar from './security-trust-radar'

import type { PublicSecurityAssessment } from '@/types'

type SecurityDimension = NonNullable<PublicSecurityAssessment['security_dimensions']>[number]
type SubjectKind = 'mcp' | 'prompt' | 'skill'

export default function SecuritySummaryPanel({ subject, subjectKind = 'skill' }: { subject: PublicSecurityAssessment, subjectKind?: SubjectKind }) {
  const hasCurrentReport = ['blocked', 'passed', 'review_required'].includes(subject.security_report_state ?? '')
  const dimensions = Array.isArray(subject.security_dimensions) ? subject.security_dimensions : []
  const reportMode = securityReportDisplayMode(subject.security_evaluation_method)
  const hasTrustEvaluation = reportMode === 'hybrid' || reportMode === 'documented'
  const documentedReport = reportMode === 'documented'
  const risks = Number(subject.security_critical_count ?? 0) + Number(subject.security_high_count ?? 0)
    + Number(subject.security_medium_count ?? 0) + Number(subject.security_low_count ?? 0)
    + Number(subject.security_info_count ?? 0)

  return (
    <section
      aria-labelledby={`${subjectKind}-security-heading`}
      data-rating={hasTrustEvaluation ? subject.security_quality_rating ?? 'unrated' : undefined}
      className="public-security-panel"
    >
      <header className="public-security-heading">
        <div>
          <h2 id={`${subjectKind}-security-heading`}>
            {documentedReport ? '材料与安全评测' : hasTrustEvaluation ? 'AI 可信评测' : reportMode === 'evidence' ? '静态安全证据' : '安全评测'}
          </h2>
          <p>
            {documentedReport
              ? '基于 README、SKILL、配置和站内资料形成五维参考结论。'
              : hasTrustEvaluation
                ? '五维质量与安全评估，结果仅供使用决策参考。'
                : reportMode === 'evidence'
                  ? '基于已获取材料的静态规则检查，不生成无依据的质量评分。'
                  : '当前内容的静态安全检查结果。'}
          </p>
        </div>
        <SecurityBadge subject={subject} />
      </header>

      {hasCurrentReport
        ? hasTrustEvaluation
          ? <TrustEvaluation dimensions={dimensions} risks={risks} subject={subject} subjectKind={subjectKind} />
          : reportMode === 'evidence'
            ? <EvidenceSecurityReport risks={risks} subject={subject} subjectKind={subjectKind} />
            : <LegacySecurityReport risks={risks} subject={subject} subjectKind={subjectKind} />
        : <UnavailableReport subject={subject} subjectKind={subjectKind} />}
    </section>
  )
}

function coverageBoundaryLabel(reference: string) {
  if (reference.startsWith('asset-content:'))
    return '附件内容'
  return ({
    'mcp/priority-material-only': '仓库范围',
    'mcp/runtime-dynamic-assessment': '运行时行为',
    'mcp/source-reference-pending': '公开源码',
    'runtime/not-executed': '运行时行为',
    'skill/external-source-page': '外部来源',
    'skill/isolated-deep-scanner': '运行时行为',
    'skill/priority-material-only': '仓库范围',
    'skill/source-unavailable': '公开源码',
    'skill/text-budget': '材料长度',
  } as Record<string, string>)[reference] ?? '覆盖边界'
}

function coverageBoundaryReason(reference: string, fallback: string) {
  return ({
    'mcp/runtime-dynamic-assessment': '未连接远程服务或执行安装命令；当前结论仅覆盖可见配置和说明材料。',
    'skill/isolated-deep-scanner': '未执行第三方代码或运行时行为；当前结论基于已纳入材料。',
  } as Record<string, string>)[reference] ?? fallback
}

function CoverageNote({ coverage, subjectKind }: {
  coverage: PublicSecurityAssessment['security_coverage']
  subjectKind: SubjectKind
}) {
  const includedCount = coverage?.included?.length ?? 0
  const skipped = coverage?.skipped ?? []
  return (
    <section className="public-security-coverage">
      <header>
        <ShieldCheck />
        <div>
          <h4>评测范围</h4>
          <p>{coverageNote(subjectKind)}</p>
        </div>
      </header>
      {coverage
        ? (
            <dl>
              <EvaluationFact label="覆盖" value={coverage.label ?? '静态评测'} />
              <EvaluationFact label="纳入内容" value={`${includedCount} 项`} />
              <EvaluationFact label="未动态检查" value={`${skipped.length} 项`} />
              {coverage.sourceRevision ? <EvaluationFact label="源码版本" value={shortRevision(coverage.sourceRevision)} /> : null}
            </dl>
          )
        : null}
      {skipped.length
        ? (
            <ul className="public-security-skipped">
              {skipped.map(item => (
                <li key={`${item.ref}-${item.reason}`}>
                  <strong>{coverageBoundaryLabel(item.ref)}</strong>
                  <span>{coverageBoundaryReason(item.ref, item.reason)}</span>
                </li>
              ))}
            </ul>
          )
        : null}
    </section>
  )
}

function coverageNote(kind: SubjectKind) {
  return ({
    mcp: '仅分析公开配置，不会连接或探测远程服务。',
    prompt: '分析提示词、文档和附件元数据，不会执行附件。',
    skill: '基于固定源码版本静态分析，不代表运行时绝对安全。',
  } as const)[kind]
}

function DimensionDetail({ advisoryFindingCount, advisoryOnly, dimension }: {
  advisoryFindingCount: number
  advisoryOnly: boolean
  dimension: SecurityDimension
}) {
  const groups = [
    { items: dimension.strengths, label: '优势' },
    { items: dimension.weaknesses, label: '关注事项' },
    { items: dimension.recommendations, label: '建议' },
  ].filter(group => group.items.length > 0)

  return (
    <article className="public-trust-detail-card">
      <header>
        <span>{dimensionLetter(dimension.code)}</span>
        <div>
          <h4>{dimensionLabel(dimension.code)}</h4>
          <small>{sourceLabel(dimension.source)}</small>
        </div>
        <strong>
          {dimension.score.toFixed(1)}
          {' '}
          <small>/ 5</small>
        </strong>
      </header>
      <p>
        {presentSecurityPolicyCopy(dimension.summary, {
          advisoryFindingCount,
          advisoryOnly: advisoryOnly && dimension.code === 'safety',
        })}
      </p>
      {groups.length
        ? (
            <div className="public-trust-detail-groups">
              {groups.map(group => (
                <section key={group.label}>
                  <h5>{group.label}</h5>
                  <ul>{group.items.map(item => <li key={item}>{item}</li>)}</ul>
                </section>
              ))}
            </div>
          )
        : null}
      {dimension.evidence.length
        ? (
            <footer>
              <strong>评测依据</strong>
              <ul>{dimension.evidence.map(item => <li key={item}>{item}</li>)}</ul>
            </footer>
          )
        : null}
    </article>
  )
}

function dimensionLabel(code: SecurityDimension['code']) {
  return ({ applicability: '场景适配', effectiveness: '使用效果', maintainability: '结构规范', reliability: '稳定可靠', safety: '安全可信' } as const)[code]
}

function dimensionLetter(code: SecurityDimension['code']) {
  return ({ applicability: 'A', effectiveness: 'E', maintainability: 'C', reliability: 'R', safety: 'S' } as const)[code]
}

function DisclosureLabel() {
  return (
    <span className="public-trust-disclosure-label">
      <b>展开</b>
      <b>收起</b>
      <i />
    </span>
  )
}

function EvaluationFact({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function EvidenceSecurityReport({ risks, subject, subjectKind }: { risks: number, subject: PublicSecurityAssessment, subjectKind: SubjectKind }) {
  const coverage = subject.security_coverage
  const advisoryOnly = subject.security_report_state === 'passed'
  return (
    <>
      <div className="public-security-metrics">
        <div>
          <span>规则发现</span>
          <strong>{subject.security_show_risk_counts ? risks : '—'}</strong>
        </div>
        <div>
          <span>已检查材料</span>
          <strong>{coverage?.included?.length ?? 0}</strong>
        </div>
        <div>
          <span>未覆盖边界</span>
          <strong>{coverage?.skipped?.length ?? 0}</strong>
        </div>
        <div>
          <span>覆盖范围</span>
          <strong className="is-text">{coverage?.label ?? '静态评测'}</strong>
        </div>
      </div>
      {subject.security_show_summary && subject.security_summary
        ? (
            <p className="public-security-summary">
              {presentSecurityPolicyCopy(subject.security_summary, { advisoryFindingCount: risks, advisoryOnly })}
            </p>
          )
        : null}
      <details className="public-trust-disclosure public-trust-disclosure--legacy">
        <summary>
          <span>
            <strong>查看证据与覆盖边界</strong>
            <small>已纳入材料、未覆盖内容与固定源码版本</small>
          </span>
          <DisclosureLabel />
        </summary>
        <CoverageNote coverage={coverage} subjectKind={subjectKind} />
      </details>
    </>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

function LegacySecurityReport({ risks, subject, subjectKind }: { risks: number, subject: PublicSecurityAssessment, subjectKind: SubjectKind }) {
  const advisoryOnly = subject.security_report_state === 'passed'
  return (
    <>
      <div className="public-security-metrics">
        <div>
          <span>安全分</span>
          <strong>{subject.security_show_score && typeof subject.security_score === 'number' ? subject.security_score : '—'}</strong>
        </div>
        <div>
          <span>安全等级</span>
          <strong>{subject.security_show_grade ? subject.security_grade ?? '—' : '—'}</strong>
        </div>
        <div>
          <span>风险项</span>
          <strong>{subject.security_show_risk_counts ? risks : '—'}</strong>
        </div>
        <div>
          <span>覆盖范围</span>
          <strong className="is-text">{subject.security_coverage?.label ?? '静态评测'}</strong>
        </div>
      </div>
      {subject.security_show_summary && subject.security_summary
        ? (
            <p className="public-security-summary">
              {presentSecurityPolicyCopy(subject.security_summary, { advisoryFindingCount: risks, advisoryOnly })}
            </p>
          )
        : null}
      <details className="public-trust-disclosure public-trust-disclosure--legacy">
        <summary>
          <span>查看评测范围</span>
          <DisclosureLabel />
        </summary>
        <CoverageNote coverage={subject.security_coverage} subjectKind={subjectKind} />
      </details>
    </>
  )
}

function methodLabel(value: PublicSecurityAssessment['security_evaluation_method']) {
  if (value === 'document_evidence')
    return '本地材料证据'
  return value === 'hybrid' ? '规则 + AI' : '自动评测'
}

function ratingLabel(value: PublicSecurityAssessment['security_quality_rating']) {
  return ({ exceptional: '卓越', excellent: '优秀', fair: '一般', good: '良好', poor: '需改进' } as Record<string, string>)[value ?? ''] ?? '待评定'
}

function safetyAdvice(kind: SubjectKind) {
  return ({
    mcp: '连接前请检查端点、权限范围、环境变量和第三方命令。',
    prompt: '使用前请检查提示词、样式文件和可下载附件。',
    skill: '安装前请检查源码、权限范围和执行命令。',
  } as const)[kind]
}

function scanStatusLabel(status: NonNullable<PublicSecurityAssessment['security_scan_status']>) {
  return ({ preparing: '正在整理参考材料', queued: '已进入自动处理', running: '正在分析当前材料' } as const)[status]
}

function shortRevision(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value
}

function sourceLabel(source: SecurityDimension['source']) {
  return source === 'ai_assisted' ? 'AI + 规则' : '材料证据'
}

function TrustEvaluation({ dimensions, risks, subject, subjectKind }: {
  dimensions: SecurityDimension[]
  risks: number
  subject: PublicSecurityAssessment
  subjectKind: SubjectKind
}) {
  const lowestDimension = dimensions.reduce<SecurityDimension | null>((lowest, dimension) => !lowest || dimension.score < lowest.score ? dimension : lowest, null)
  const advisoryOnly = subject.security_report_state === 'passed'
  const evaluationSummary = presentSecurityPolicyCopy(
    subject.security_evaluation_summary || '已形成当前参考结论，详细依据暂未公开。',
    { advisoryFindingCount: risks, advisoryOnly },
  )
  const qualityScore = subject.security_show_score && typeof subject.security_quality_score === 'number'
    ? subject.security_quality_score
    : null
  const qualityRating = subject.security_show_grade && subject.security_quality_rating
    ? subject.security_quality_rating
    : null

  return (
    <>
      <div className="public-trust-summary">
        {dimensions.length === 5
          ? <SecurityTrustRadar dimensions={dimensions} />
          : <div className="public-trust-radar-empty">维度详情暂未公开</div>}
        <div className="public-trust-main">
          <div className="public-trust-scoreline">
            <p>
              <strong>{qualityScore === null ? '—' : qualityScore.toFixed(1)}</strong>
              <span>{qualityScore === null ? '分数未公开' : '/ 5'}</span>
            </p>
            <div>
              <strong>{qualityRating === null ? '—' : ratingLabel(qualityRating)}</strong>
              <span>综合评级</span>
            </div>
          </div>
          <p className="public-trust-conclusion">{evaluationSummary}</p>
          <div className="public-trust-priority">
            {lowestDimension
              ? (
                  <span>
                    <b>重点关注</b>
                    {dimensionLabel(lowestDimension.code)}
                    {' '}
                    {lowestDimension.score.toFixed(1)}
                  </span>
                )
              : null}
            {subject.security_show_risk_counts
              ? (
                  <span>
                    <b>规则发现</b>
                    {risks === 0 ? '未发现' : `${risks} 项`}
                  </span>
                )
              : null}
          </div>
          <dl className="public-trust-facts">
            <EvaluationFact label="评测方式" value={methodLabel(subject.security_evaluation_method)} />
            <EvaluationFact label="覆盖范围" value={subject.security_coverage?.label ?? '静态评测'} />
            <EvaluationFact label="完成时间" value={subject.security_assessed_at ? formatDate(subject.security_assessed_at) : '—'} />
          </dl>
        </div>
      </div>

      {dimensions.length
        ? (
            <details className="public-trust-disclosure">
              <summary>
                <span>
                  <strong>完整评测报告</strong>
                  <small>五维结论、优势、关注事项、建议与评测依据</small>
                </span>
                <DisclosureLabel />
              </summary>
              <div className="public-trust-disclosure-body">
                <section className="public-trust-full-conclusion">
                  <h4>综合结论</h4>
                  <p>{evaluationSummary}</p>
                </section>
                <div className="public-trust-details">
                  {dimensions.map(dimension => (
                    <DimensionDetail
                      key={dimension.code}
                      advisoryFindingCount={risks}
                      advisoryOnly={advisoryOnly}
                      dimension={dimension}
                    />
                  ))}
                </div>
                <CoverageNote coverage={subject.security_coverage} subjectKind={subjectKind} />
              </div>
            </details>
          )
        : (
            <div className="public-trust-private-note">
              <ShieldCheck />
              <span>逐项维度由管理员控制，当前暂未公开。</span>
            </div>
          )}
    </>
  )
}

function UnavailableReport({ subject, subjectKind }: { subject: PublicSecurityAssessment, subjectKind: SubjectKind }) {
  return (
    <div className="public-security-unavailable">
      <span>{subject.security_scan_status ? <Clock /> : <ShieldExclamation />}</span>
      <div>
        <strong>{subject.security_scan_status ? scanStatusLabel(subject.security_scan_status) : '使用前建议核对当前依据'}</strong>
        <p>
          {subject.security_report_state === 'stale'
            ? '参考资料正在自动更新；更新完成前，请结合来源与权限范围判断。'
            : `${safetyAdvice(subjectKind)} 系统会在材料可用时自动补充参考结论。`}
        </p>
      </div>
    </div>
  )
}
