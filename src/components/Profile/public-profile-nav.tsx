'use client'

import styles from './profile.module.css'

const SECTIONS = [
  { id: 'works', label: '作品' },
  { id: 'community', label: '社区' },
  { id: 'achievements', label: '成就' },
] as const

export function PublicProfileNav() {
  return (
    <nav aria-label="公开主页内容" className={styles.profileSectionNav}>
      <span className={styles.profileNavLabel}>浏览档案</span>
      <div data-scrollbar="none" className={styles.profileNavScroller}>
        <div className={styles.profileNavLinks}>
          {SECTIONS.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() => window.requestAnimationFrame(() => document.getElementById(section.id)?.focus({ preventScroll: true }))}
            >
              {section.label}
            </a>
          ))}
        </div>
      </div>
      <span aria-hidden="true" className={styles.profileNavHint}>滑动 →</span>
    </nav>
  )
}
