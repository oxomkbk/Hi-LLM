'use client'

import { Check, Code } from '@gravity-ui/icons'
import { Chip, Link } from '@heroui/react'

import { sourceLinkLabel } from './source-check-model'

import type { SecuritySourceCheckResult } from '@/lib/ai-security/source-check-contract'

export default function SourceLinkStatus({ emptyLabel = '未配置来源', result, sourceUrl }: {
  emptyLabel?: string
  result?: SecuritySourceCheckResult | null
  sourceUrl?: string | null
}) {
  if (!sourceUrl)
    return <p className="text-xs text-muted">{emptyLabel}</p>

  const metadata = sourceLinkLabel(sourceUrl)

  return (
    <div className="admin-source-link">
      <Link href={sourceUrl} rel="noopener noreferrer" target="_blank">
        <Code aria-hidden="true" />
        <span>{metadata.label}</span>
        <Link.Icon />
      </Link>
      {result
        ? (
            <div title={`检查于 ${result.checkedAt}`} className="admin-source-check-status">
              <Chip color="success" size="sm" variant="soft">
                <Check aria-hidden="true" />
                来源正常
              </Chip>
              <code>{result.sourceRevision.slice(0, 7)}</code>
            </div>
          )
        : null}
    </div>
  )
}
