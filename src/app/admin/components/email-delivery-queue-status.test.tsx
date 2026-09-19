import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import EmailDeliveryQueueStatus from './email-delivery-queue-status'

describe('email delivery queue status', () => {
  it('reports SMTP queue acceptance without claiming inbox delivery', () => {
    const markup = renderToStaticMarkup(
      <EmailDeliveryQueueStatus
        result={{
          deliveryConfirmed: false,
          messageId: '<trace@example.com>',
          queuedAt: '2026-09-12T05:55:49.755Z',
          recipient: 'admin@example.com',
          source: 'database',
          status: 'queued',
        }}
      />,
    )

    expect(markup).toContain('已进入 SMTP 投递队列')
    expect(markup).toContain('这不代表收件箱已送达')
    expect(markup).toContain('Message-ID')
    expect(markup).not.toContain('已投递成功')
    expect(markup).not.toContain('已送达</strong>')
  })
})
