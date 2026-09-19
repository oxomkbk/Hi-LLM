import { CATALOG_CHANNELS } from '@/components/catalog/catalog-channels'

import type { CatalogChannel } from '@/components/catalog/catalog-channels'
import type { ReactNode } from 'react'

export default function CatalogMasthead({
  channel,
  children,
  description,
  title,
}: {
  channel: CatalogChannel
  children: ReactNode
  description: string
  title: string
}) {
  const config = CATALOG_CHANNELS[channel]
  const Icon = config.icon

  return (
    <section className={`catalog-masthead catalog-masthead--${channel}`}>
      <div className="catalog-shell">
        <div className="catalog-masthead-grid">
          <div className="catalog-masthead-copy">
            <div className="catalog-masthead-kicker">
              <span aria-hidden="true"><Icon /></span>
              <strong>{config.label}</strong>
              <small>{config.descriptor}</small>
            </div>
            <h1>{title}</h1>
            <span>{description}</span>
          </div>

          <div className="catalog-masthead-utility">
            <div className="catalog-masthead-search">{children}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
