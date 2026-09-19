import { ShieldCheck, ShieldExclamation } from '@gravity-ui/icons'

import { securityBadgePresentation } from '@/lib/ai-security/presentation'

import type { PublicSecurityAssessment } from '@/types'

export default function SecurityBadge({ compact = false, showScore = !compact, subject }: { compact?: boolean, showScore?: boolean, subject: PublicSecurityAssessment }) {
  const meta = securityBadgePresentation({
    method: subject.security_evaluation_method,
    qualityScore: showScore && subject.security_show_score ? subject.security_quality_score : null,
    securityScore: showScore && subject.security_show_score ? subject.security_score : null,
    state: subject.security_report_state,
  })
  const label = compact ? meta.compactLabel : meta.label
  return (
    <span data-compact={compact || undefined} data-tone={meta.tone} className="public-security-badge">
      {meta.tone === 'passed' ? <ShieldCheck /> : <ShieldExclamation />}
      <span>{label}</span>
      {meta.score
        ? <strong>{meta.score}</strong>
        : null}
    </span>
  )
}
