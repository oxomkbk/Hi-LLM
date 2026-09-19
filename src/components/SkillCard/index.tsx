import { CircleCheckFill, StarFill } from '@gravity-ui/icons'

import CatalogIcon from '@/components/catalog/catalog-icon'
import ConfigurableDetailLink from '@/components/navigation/configurable-detail-link'
import SecurityBadge from '@/components/security/security-badge'
import { buildContextualHref, returnTargetId } from '@/lib/navigation/return-context'

import styles from './index.module.css'

import type { Skill } from '@/types'

interface SkillCardProps {
  skill: Skill
  className?: string
  featured?: boolean
  returnTo?: string
}

export default function SkillCard({ skill, className, featured = false, returnTo }: SkillCardProps) {
  const platforms = [...new Set(skill.platforms ?? [])]
  const primaryPlatform = platforms[0]
  const remainingPlatforms = Math.max(0, platforms.length - 1)
  const targetId = returnTargetId('skill', skill.id)
  const baseDetailHref = `/skills/${skill.slug}`
  const contextualHref = returnTo
    ? buildContextualHref(`/skills/${skill.slug}`, returnTo, targetId)
    : undefined

  return (
    <ConfigurableDetailLink
      aria-label={`查看 Skill：${skill.name}`}
      id={targetId}
      contextualHref={contextualHref}
      href={baseDetailHref}
      className={classNames(styles.card, featured && styles.featured, className)}
    >
      <article className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <SkillIcon name={skill.name} icon={skill.icon} className={styles.icon} />
            <div className={styles.identityCopy}>
              <div className={styles.titleRow}>
                <h3 className={styles.title}>{skill.name}</h3>
                {skill.verified
                  ? (
                      <span title="已验证" className={styles.mark}>
                        <CircleCheckFill aria-hidden="true" />
                        <span className={styles.screenReaderOnly}>已验证</span>
                      </span>
                    )
                  : skill.featured
                    ? (
                        <span title="精选" className={styles.mark}>
                          <StarFill aria-hidden="true" />
                          <span className={styles.screenReaderOnly}>精选</span>
                        </span>
                      )
                    : null}
              </div>
              <span className={styles.category}>{skill.category}</span>
            </div>
          </div>
          <span className={styles.security}>
            <SecurityBadge compact showScore subject={skill} />
          </span>
        </header>

        <div className={styles.content}>
          <p className={styles.summary}>
            <span className={styles.summaryLabel}>用途</span>
            {skill.summary}
          </p>
          {primaryPlatform
            ? (
                <div aria-label="Skill 适配平台" className={styles.signals}>
                  <span className={styles.signal}>{primaryPlatform}</span>
                  {remainingPlatforms > 0 ? <span className={styles.signal}>{`+${remainingPlatforms} 平台`}</span> : null}
                </div>
              )
            : null}
        </div>

        <footer className={styles.footer}>
          <span title={skill.author_name} className={styles.author}>{skill.author_name}</span>
          <span className={styles.version}>{skill.version ? `v${skill.version}` : 'Skill'}</span>
        </footer>
      </article>
    </ConfigurableDetailLink>
  )
}

export function SkillIcon({
  eager = false,
  icon,
  name,
  className,
}: Pick<Skill, 'icon' | 'name'> & { className?: string, eager?: boolean }) {
  return (
    <CatalogIcon
      name={name}
      eager={eager}
      kind="skill"
      value={icon}
      className={classNames(styles.iconBase, className || styles.icon)}
    />
  )
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}
