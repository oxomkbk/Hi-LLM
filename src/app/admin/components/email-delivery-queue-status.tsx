import { PaperPlane } from '@gravity-ui/icons'

import { formatDate } from '@/lib/utils'

import styles from './email-settings-form.module.css'

export interface EmailTestResult {
  deliveryConfirmed: false
  messageId: string | null
  queuedAt: string
  recipient: string
  source: 'database' | 'environment'
  status: 'queued'
}

export default function EmailDeliveryQueueStatus({ result }: { result: EmailTestResult }) {
  return (
    <div role="status" className={styles.deliveryResult}>
      <PaperPlane aria-hidden="true" />
      <span>
        <strong>已进入 SMTP 投递队列</strong>
        <small>{result.recipient}</small>
        <small>{formatDate(result.queuedAt, 'datetime')}</small>
        {result.messageId ? <small>{`Message-ID：${result.messageId}`}</small> : null}
        <em>这不代表收件箱已送达；请同时检查垃圾邮件，并在服务商日志中按 Message-ID 查询。</em>
      </span>
    </div>
  )
}
