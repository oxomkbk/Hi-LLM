'use client'

import { Puzzle, Server } from '@gravity-ui/icons'
import { useState } from 'react'

import { catalogIconSource } from '@/lib/catalog-icons'

interface CatalogIconProps {
  className?: string
  eager?: boolean
  kind: 'mcp' | 'skill'
  name: string
  value?: string | null
}

export default function CatalogIcon({ className, eager = false, kind, name, value }: CatalogIconProps) {
  const source = catalogIconSource(value)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const Fallback = kind === 'skill' ? Puzzle : Server

  return (
    <span aria-hidden="true" title={name} className={className}>
      {source && source !== failedSource
        ? (
            // Community images use app-file URLs or arbitrary HTTPS hosts.
            // eslint-disable-next-line next/no-img-element
            <img
              alt=""
              decoding="async"
              fetchPriority={eager ? 'high' : 'auto'}
              height={64}
              loading={eager ? 'eager' : 'lazy'}
              src={source}
              width={64}
              onError={() => setFailedSource(source)}
              className="size-full object-contain"
            />
          )
        : <Fallback className="size-[42%]" />}
    </span>
  )
}
