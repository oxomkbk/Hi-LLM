import { CircleCheckFill, PlugConnection, StarFill } from '@gravity-ui/icons'

import CatalogIcon from '@/components/catalog/catalog-icon'
import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import SecurityBadge from '@/components/security/security-badge'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'

import styles from './index.module.css'

import type { Mcp } from '@/types'

export default function McpCard({ mcp, index = 0, returnTo }: { mcp: Mcp, index?: number, returnTo?: string }) {
  const transports = [...new Set((mcp.installations ?? []).map(item => item.transport))]
  const primaryTransport = transports[0]
  const primaryCapability = mcp.capabilities?.[0]
  const targetId = returnTargetId('mcp', mcp.id)
  const baseDetailHref = `/mcp/${mcp.slug}`
  const contextualHref = returnTo
    ? buildContextualHref(`/mcp/${mcp.slug}`, returnTo, targetId)
    : undefined

  return (
    <ConfigurableDetailLink
      aria-label={`查看 MCP Server：${mcp.name}`}
      id={targetId}
      contextualHref={contextualHref}
      href={baseDetailHref}
      className={styles.card}
      style={{ '--mcp-card-delay': `${Math.min(index, 8) * 55}ms` } as React.CSSProperties}
    >
      <article className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <CatalogIcon name={mcp.name} kind="mcp" value={mcp.icon} className={styles.icon} />
            <div className={styles.identityCopy}>
              <div className={styles.titleRow}>
                <h3 className={styles.title}>{mcp.name}</h3>
                {mcp.verified
                  ? (
                      <span title="已验证" className={styles.mark}>
                        <CircleCheckFill aria-hidden="true" />
                        <span className={styles.screenReaderOnly}>已验证</span>
                      </span>
                    )
                  : mcp.featured
                    ? (
                        <span title="精选" className={styles.mark}>
                          <StarFill aria-hidden="true" />
                          <span className={styles.screenReaderOnly}>精选</span>
                        </span>
                      )
                    : null}
              </div>
              <span className={styles.category}>{mcp.category}</span>
            </div>
          </div>
          <span className={styles.security}>
            <SecurityBadge compact showScore subject={mcp} />
          </span>
        </header>

        <div className={styles.content}>
          <p className={styles.summary}>
            <span className={styles.summaryLabel}>用途</span>
            {mcp.summary}
          </p>
          <div aria-label="MCP 连接方式与能力" className={styles.signals}>
            {primaryTransport
              ? (
                  <span className={styles.signal}>
                    <PlugConnection aria-hidden="true" />
                    {transportLabel(primaryTransport)}
                  </span>
                )
              : null}
            {primaryCapability ? <span className={styles.signal}>{primaryCapability}</span> : null}
          </div>
        </div>

        <footer className={styles.footer}>
          <span className={styles.publisher}>{mcp.publisher_name}</span>
          <span className={styles.protocol}>
            {`Protocol ${mcp.protocol_version}`}
          </span>
        </footer>
      </article>
    </ConfigurableDetailLink>
  )
}

function transportLabel(transport: string) {
  return transport === 'streamable-http' ? 'HTTP' : transport
}
