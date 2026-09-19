'use client'

import Link from 'next/link'

import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import { getSubmissionAvailability } from '@/lib/access-settings/submission-controls'

import type { SubmissionChannel } from '@/lib/access-settings/submission-controls'
import type { ReactNode } from 'react'

export default function SubmissionAction({
  ariaLabel,
  channel,
  children,
  className,
  href,
  newWindow = false,
}: {
  ariaLabel?: string
  channel: SubmissionChannel
  children: ReactNode
  className?: string
  href: string
  newWindow?: boolean
}) {
  const { settings } = useAccessSettings()
  const availability = getSubmissionAvailability(settings, channel)
  const label = ariaLabel ?? '投稿'
  const sharedProps = {
    'aria-label': newWindow ? `${label}（新窗口打开）` : label,
    'data-channel': channel,
  }

  if (availability === 'hidden')
    return null

  if (availability === 'disabled') {
    return (
      <span
        {...sharedProps}
        aria-disabled="true"
        title="投稿功能暂未开放"
        className={`${className ?? ''} submission-action-disabled`}
      >
        {children}
      </span>
    )
  }

  return (
    <Link
      {...sharedProps}
      href={href}
      rel={newWindow ? 'noopener noreferrer' : undefined}
      target={newWindow ? '_blank' : undefined}
      className={className}
    >
      {children}
    </Link>
  )
}
