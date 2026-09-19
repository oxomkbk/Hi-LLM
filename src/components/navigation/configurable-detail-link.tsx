'use client'

import Link from 'next/link'

import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import { resolveDetailLink } from '@/lib/navigation/detail-open-mode'

import type { ComponentProps } from 'react'

type LinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'rel' | 'target'> & {
  contextualHref?: string
  href: string
}

export default function ConfigurableDetailLink({ contextualHref, href, ...props }: LinkProps) {
  const { settings } = useAccessSettings()
  const resolved = resolveDetailLink(settings.contentDetailOpenMode, href, contextualHref)

  return (
    <Link
      {...props}
      href={resolved.href}
      rel={resolved.rel}
      target={resolved.target}
    />
  )
}
