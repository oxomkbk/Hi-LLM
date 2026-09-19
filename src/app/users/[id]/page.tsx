import {
  ArrowRight,
  ArrowUpRightFromSquare,
  Check,
  Eye,
  Heart,
} from '@gravity-ui/icons'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AchievementShelf, ProfileWorkShowcase } from '@/components/Profile/community-showcase'
import { ProfileActivityFeed } from '@/components/Profile/profile-activity-feed'
import { ProfileHero } from '@/components/Profile/profile-hero'
import { ProfileShareButton } from '@/components/Profile/profile-share-button'
import { ProfileThemeScope } from '@/components/Profile/profile-theme'
import styles from '@/components/Profile/profile.module.css'
import { PublicProfileNav } from '@/components/Profile/public-profile-nav'
import { isReadySlice } from '@/lib/account/profile-types'
import { buildProfileActivity, contributionTotal } from '@/lib/account/profile-view-model'
import { getPublicAccount } from '@/lib/account/service'
import { getServerSession } from '@/lib/auth/session'

import type { CommunityStats, PublicAccountData } from '@/lib/account/profile-types'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

interface PublicProfilePageProps {
  params: Promise<{ id: string }>
}

const CONTRIBUTION_LABELS: Array<{ key: keyof CommunityStats['contributions'], label: string }> = [
  { key: 'questions', label: '提问' },
  { key: 'answers', label: '回答' },
  { key: 'comments', label: '评论' },
  { key: 'works', label: '作品' },
]

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { id } = await params
  const profile = await getPublicAccount(id)
  if (!profile)
    return { title: '用户不存在' }
  return {
    alternates: { canonical: `/users/${encodeURIComponent(id)}` },
    description: profile.user.bio || `${profile.user.name} 在妙妙屋的公开贡献。`,
    title: `${profile.user.name} | 社区创作者`,
  }
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { id } = await params
  const [profile, session] = await Promise.all([
    getPublicAccount(id),
    getServerSession(),
  ])
  if (!profile)
    notFound()

  const { appearance, community, user } = profile
  const canonicalPath = `/users/${encodeURIComponent(id)}`
  const isOwner = session?.user.id === id
  const activity = buildProfileActivity(community.recentQuestions, community.recentAnswers)

  return (
    <ProfileThemeScope preset={appearance.preset} className={styles.page}>
      <ProfileHero
        variant="public"
        actions={(
          <>
            <Link href="#works">
              查看作品
              <ArrowRight aria-hidden="true" />
            </Link>
            <ProfileShareButton name={user.name} canonicalPath={canonicalPath} />
            {isOwner
              ? (
                  <Link href="/account?section=profile">
                    编辑主页
                    <ArrowUpRightFromSquare aria-hidden="true" />
                  </Link>
                )
              : null}
          </>
        )}
        appearance={appearance}
        stats={community.stats}
        user={user}
      />

      <PublicProfileNav />

      <main className={styles.publicWorkspace}>
        <div className={styles.column}>
          <section id="works" tabIndex={-1} className={`${styles.section} ${styles.sectionFeature}`}>
            <SectionHeading
              title="公开作品"
              action={(
                <Link href="/wonderland/works" className={styles.textAction}>
                  作品广场
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
              description={workDescription(profile)}
              kicker="创作档案"
            />
            <ProfileWorkShowcase variant="public" owner={isOwner} works={community.recentWorks} />
          </section>

          <section id="community" tabIndex={-1} className={styles.section}>
            <SectionHeading
              title="社区动态"
              action={(
                <Link href="/wonderland" className={styles.textAction}>
                  前往妙妙屋
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
              description="最近公开发布的提问与回答。"
              kicker="公开参与"
            />
            <ProfileActivityFeed activity={activity} owner={isOwner} returnTo={canonicalPath} targetPrefix="user-activity" />
          </section>

          <section id="achievements" tabIndex={-1} className={`${styles.section} ${styles.publicAchievements}`}>
            <SectionHeading title="成就陈列" description="由公开作品、喜欢与浏览逐步解锁。" kicker="里程碑" />
            <AchievementShelf badges={community.badges} />
          </section>
        </div>

        <aside className={styles.summaryPanel}>
          <section className={`${styles.section} ${styles.credibilityCard}`}>
            <p className={styles.eyebrow}>公开贡献账本</p>
            {isReadySlice(community.stats)
              ? <CredibilityLedger stats={community.stats.data} />
              : <p className={styles.inlineError}>贡献统计暂时无法读取</p>}
          </section>

          <section className={`${styles.section} ${styles.profileAbout}`}>
            <SectionHeading title="档案信息" description="公开主页中的身份线索与创作记录。" kicker="创作者资料" />
            <dl className={styles.summaryList}>
              <div>
                <dt>加入时间</dt>
                <dd>{formatMonth(user.createdAt)}</dd>
              </div>
              <div>
                <dt>已获成就</dt>
                <dd>{earnedBadgeCount(profile)}</dd>
              </div>
            </dl>
            {user.website
              ? (
                  <a href={user.website} rel="ugc nofollow noopener noreferrer" target="_blank" className={styles.websiteLink}>
                    访问个人网站
                    <ArrowUpRightFromSquare aria-hidden="true" />
                  </a>
                )
              : null}
          </section>
        </aside>
      </main>
    </ProfileThemeScope>
  )
}

function CredibilityLedger({ stats }: { stats: CommunityStats }) {
  const total = contributionTotal(stats)
  return (
    <>
      <strong className={styles.snapshotValue}>{total}</strong>
      <p className={styles.snapshotLabel}>次公开贡献</p>
      <div className={styles.influenceGrid}>
        <span>
          <Heart aria-hidden="true" />
          <strong>{stats.workImpact.likes}</strong>
          <small>作品获赞</small>
        </span>
        <span>
          <Eye aria-hidden="true" />
          <strong>{stats.workImpact.views}</strong>
          <small>作品浏览</small>
        </span>
      </div>
      <div className={styles.contributionMix}>
        {CONTRIBUTION_LABELS.map((item) => {
          const value = stats.contributions[item.key]
          const percentage = total > 0 ? Math.max(value > 0 ? 5 : 0, Math.round(value / total * 100)) : 0
          return (
            <div key={item.key}>
              <span>
                <small>{item.label}</small>
                <strong>{value}</strong>
              </span>
              <i aria-label={`${item.label}占公开贡献 ${percentage}%`}><b style={{ width: `${percentage}%` }} /></i>
            </div>
          )
        })}
      </div>
      {total > 0
        ? (
            <p className={styles.ledgerFootnote}>
              <Check aria-hidden="true" />
              以上仅统计公开可见内容
            </p>
          )
        : <p className={styles.ledgerFootnote}>公开贡献会从第一次参与开始记录</p>}
    </>
  )
}

function earnedBadgeCount(profile: PublicAccountData) {
  return isReadySlice(profile.community.badges)
    ? `${profile.community.badges.data.filter(badge => badge.earned).length} 枚`
    : '暂时无法读取'
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', year: 'numeric' }).format(new Date(value))
}

function SectionHeading({ action, description, kicker, title }: { action?: ReactNode, description: string, kicker: string, title: string }) {
  return (
    <header className={styles.sectionHeadingRow}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionKicker}>{kicker}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {action}
    </header>
  )
}

function workDescription(profile: PublicAccountData) {
  if (!isReadySlice(profile.community.stats))
    return '作品统计暂时无法读取。'
  const { contributions, workImpact } = profile.community.stats.data
  return `${contributions.works} 件公开作品 · ${workImpact.likes} 次喜欢 · ${workImpact.views} 次浏览`
}
