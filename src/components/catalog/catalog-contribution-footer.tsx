import { ArrowRight } from '@gravity-ui/icons'
import Link from 'next/link'

import { CATALOG_CHANNEL_ORDER, CATALOG_CHANNELS } from '@/components/catalog/catalog-channels'
import CatalogSubmitLink from '@/components/catalog/catalog-submit-link'

import type { CatalogChannel } from '@/components/catalog/catalog-channels'

export default function CatalogContributionFooter({
  channel,
  description,
  title,
}: {
  channel: CatalogChannel
  description: string
  title: string
}) {
  const related = CATALOG_CHANNEL_ORDER.filter(item => item !== channel)

  return (
    <section aria-labelledby={`${channel}-contribution-title`} className={`catalog-contribution catalog-contribution--${channel}`}>
      <div className="catalog-shell catalog-contribution-grid">
        <div className="catalog-contribution-copy">
          <h2 id={`${channel}-contribution-title`}>{title}</h2>
          <span>{description}</span>
        </div>

        <div className="catalog-contribution-actions">
          <CatalogSubmitLink channel={channel} placement="footer" />
          <nav aria-label="继续探索其他 AI 内容" className="catalog-contribution-related">
            <span>继续探索</span>
            {related.map(item => (
              <Link key={item} href={CATALOG_CHANNELS[item].rootHref}>
                {CATALOG_CHANNELS[item].label}
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  )
}
