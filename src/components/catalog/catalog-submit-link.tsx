import { CATALOG_CHANNELS } from '@/components/catalog/catalog-channels'
import SubmissionAction from '@/components/submission/submission-action'

import type { CatalogChannel } from '@/components/catalog/catalog-channels'

type CatalogSubmitPlacement = 'empty' | 'footer'

export default function CatalogSubmitLink({
  channel,
  placement,
}: {
  channel: CatalogChannel
  placement: CatalogSubmitPlacement
}) {
  const config = CATALOG_CHANNELS[channel]
  const Icon = config.icon

  return (
    <SubmissionAction
      ariaLabel={config.actionLabel}
      channel={channel}
      href={config.submitHref}
      className={`catalog-submit-action catalog-submit-action--${placement}`}
    >
      <Icon aria-hidden="true" />
      <span>{config.actionLabel}</span>
    </SubmissionAction>
  )
}
