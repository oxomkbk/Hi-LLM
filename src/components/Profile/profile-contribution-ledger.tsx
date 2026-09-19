import { isReadySlice } from '@/lib/account/profile-types'

import styles from './profile.module.css'

import type { CommunityStats, DataSlice } from '@/lib/account/profile-types'

const CONTRIBUTION_LABELS: Array<{ key: keyof CommunityStats['contributions'], label: string }> = [
  { key: 'questions', label: '提问' },
  { key: 'answers', label: '回答' },
  { key: 'comments', label: '评论' },
  { key: 'works', label: '作品' },
]

export function ProfileContributionLedger({ stats }: { stats: DataSlice<CommunityStats> }) {
  if (!isReadySlice(stats))
    return <p className={styles.inlineError}>贡献数据暂时无法读取</p>

  return (
    <div className={styles.heroLedgerContent}>
      <dl className={styles.stats}>
        {CONTRIBUTION_LABELS.map(item => (
          <div key={item.key} className={styles.stat}>
            <dt className={styles.statLabel}>{item.label}</dt>
            <dd className={styles.statValue}>{stats.data.contributions[item.key]}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.impactLine}>
        作品累计
        {' '}
        <strong>{stats.data.workImpact.likes}</strong>
        {' '}
        次喜欢 ·
        {' '}
        <strong>{stats.data.workImpact.views}</strong>
        {' '}
        次浏览
      </p>
    </div>
  )
}
