import {
  ArrowRight,
  ArrowUpRightFromSquare,
  Bell,
  Check,
  Comments,
  Pencil,
  Plus,
} from '@gravity-ui/icons'
import Link from 'next/link'

import { AchievementShelf, ProfileWorkShowcase } from '@/components/Profile/community-showcase'
import { ProfileActivityFeed } from '@/components/Profile/profile-activity-feed'
import { ProfileHero } from '@/components/Profile/profile-hero'
import { ProfileProgress } from '@/components/Profile/profile-progress'
import { ProfileThemeScope } from '@/components/Profile/profile-theme'
import styles from '@/components/Profile/profile.module.css'
import { isReadySlice } from '@/lib/account/profile-types'
import {
  buildProfileActivity,
  buildProfileCompletion,
  buildProfileNextSteps,
} from '@/lib/account/profile-view-model'

import { AccountSectionTabs } from './account-section-tabs'
import { AccountSettingsPanel } from './account-settings-panel'

import type { AccountSection } from './account-sections'
import type { PrivateAccountData } from '@/lib/account/profile-types'
import type { ReactNode } from 'react'

export default function AccountCenter({ data, section }: { data: PrivateAccountData, section: AccountSection }) {
  const activity = buildProfileActivity(data.community.recentQuestions, data.community.recentAnswers)
  const completion = buildProfileCompletion(data.user, data.appearanceConfigured)
  const nextSteps = buildProfileNextSteps({
    appearanceConfigured: data.appearanceConfigured,
    badges: data.community.badges,
    stats: data.community.stats,
    user: data.user,
  })

  return (
    <ProfileThemeScope preset={data.appearance.preset} className={styles.page}>
      <ProfileHero
        variant="account"
        actions={(
          <>
            <Link href={`/users/${data.user.id}`}>
              查看公开主页
              <ArrowUpRightFromSquare aria-hidden="true" />
            </Link>
            <Link href="/wonderland/notifications">
              <Bell aria-hidden="true" />
              通知
            </Link>
          </>
        )}
        appearance={data.appearance}
        avatarEditHref="/account?section=profile"
        stats={data.community.stats}
        user={data.user}
      />

      <div className={styles.accountNavShell}>
        <AccountSectionTabs selectedSection={section} />
        <Link href="/wonderland/works/new" className={styles.primaryQuickAction}>
          <Plus aria-hidden="true" />
          发布作品
        </Link>
      </div>

      <main className={styles.accountPanel}>
        {section === 'overview'
          ? (
              <div className={styles.overviewGrid}>
                <div className={styles.column}>
                  <section className={`${styles.section} ${styles.workbenchSection}`}>
                    <SectionHeading id="account-section-title" title="创作焦点" description="继续创作、发起讨论，或把公开身份补充完整。" kicker="下一步行动" />
                    <div className={styles.workbenchGrid}>
                      <WorkbenchAction
                        title="发布作品"
                        description={isReadySlice(data.community.stats) ? `${data.community.stats.data.contributions.works} 件公开作品` : '把项目带到作品广场'}
                        href="/wonderland/works/new"
                        icon={<Plus aria-hidden="true" />}
                        tone="amber"
                      />
                      <WorkbenchAction
                        title="发起提问"
                        description={isReadySlice(data.community.stats) ? `${data.community.stats.data.contributions.questions} 次公开提问` : '向社区提出真实问题'}
                        href="/wonderland/ask"
                        icon={<Comments aria-hidden="true" />}
                        tone="blue"
                      />
                      <WorkbenchAction
                        title="查看通知"
                        description="查看回复与处理结果"
                        href="/wonderland/notifications"
                        icon={<Bell aria-hidden="true" />}
                        tone="green"
                      />
                      <WorkbenchAction
                        title="编辑公开资料"
                        description={completion.percentage === 100 ? '公开资料已完整' : `完成度 ${completion.percentage}%`}
                        href="/account?section=profile"
                        icon={<Pencil aria-hidden="true" />}
                        tone="ink"
                      />
                    </div>
                  </section>

                  <section id="works" className={`${styles.section} ${styles.sectionFeature}`}>
                    <SectionHeading
                      title="我的作品"
                      action={(
                        <Link href="/wonderland/works/new" className={styles.textAction}>
                          发布作品
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      )}
                      description={workDescription(data)}
                      kicker="作品陈列"
                    />
                    <ProfileWorkShowcase variant="account" owner works={data.community.recentWorks} />
                  </section>

                  <section id="community" className={styles.section}>
                    <SectionHeading
                      title="最近动态"
                      action={(
                        <Link href="/wonderland" className={styles.textAction}>
                          前往妙妙屋
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      )}
                      description="提问与回答按时间合并，继续你在妙妙屋的讨论。"
                      kicker="社区参与"
                    />
                    <ProfileActivityFeed activity={activity} owner returnTo="/account?section=overview" targetPrefix="account-activity" />
                  </section>
                </div>

                <aside className={styles.sideColumn}>
                  <section className={`${styles.section} ${styles.nextStepCard}`}>
                    <div className={styles.completionHeader}>
                      <span>公开主页完成度</span>
                      <strong>
                        {completion.percentage}
                        %
                      </strong>
                    </div>
                    <ProfileProgress label="公开主页完成度" value={completion.percentage} />
                    <div className={styles.nextStepIntro}>
                      <span className={styles.eyebrow}>下一步</span>
                      <h2>{nextSteps.length ? '把主页继续往前推进' : '公开主页已经准备好'}</h2>
                    </div>
                    {nextSteps.length
                      ? (
                          <ol className={styles.nextStepList}>
                            {nextSteps.map((step, index) => (
                              <li key={step.id}>
                                <span>{String(index + 1).padStart(2, '0')}</span>
                                <Link href={step.href}>
                                  <strong>{step.label}</strong>
                                  <small>{step.description}</small>
                                </Link>
                              </li>
                            ))}
                          </ol>
                        )
                      : (
                          <p className={styles.readyMessage}>
                            <Check aria-hidden="true" />
                            现在可以专注发布作品和参与讨论。
                          </p>
                        )}
                  </section>

                  <section id="achievements" className={styles.section}>
                    <SectionHeading title="成就进度" description="创作、被喜欢和被看见都会留下记录。" kicker="里程碑" />
                    <AchievementShelf badges={data.community.badges} compact />
                  </section>

                  <section className={`${styles.section} ${styles.capabilityCard}`}>
                    <SectionHeading title="当前可用" description="权限由管理员配置，只在个人中心显示。" kicker="账号能力" />
                    <div className={styles.capabilityList}>
                      <Capability enabled={data.user.canAsk || data.user.role === 'admin'} label="提问" />
                      <Capability enabled={data.user.canAnswer || data.user.role === 'admin'} label="回答" />
                      <Capability enabled={data.user.canPublishWorks || data.user.role === 'admin'} label="作品" />
                      <Capability enabled={data.user.canUpload || data.user.role === 'admin'} label="图片" />
                    </div>
                  </section>
                </aside>
              </div>
            )
          : <AccountSettingsPanel data={data} section={section} />}
      </main>
    </ProfileThemeScope>
  )
}

function Capability({ enabled, label }: { enabled: boolean, label: string }) {
  return (
    <span data-enabled={enabled || undefined}>
      <i aria-hidden="true" />
      {label}
      <small>{enabled ? '可用' : '关闭'}</small>
    </span>
  )
}

function SectionHeading({
  action,
  description,
  id,
  kicker,
  title,
}: {
  action?: ReactNode
  description: string
  id?: string
  kicker?: string
  title: string
}) {
  return (
    <header className={styles.sectionHeadingRow}>
      <div className={styles.sectionHeader}>
        {kicker ? <span className={styles.sectionKicker}>{kicker}</span> : null}
        <h2 id={id} tabIndex={id ? -1 : undefined} className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {action}
    </header>
  )
}

function WorkbenchAction({
  description,
  href,
  icon,
  title,
  tone,
}: {
  description: string
  href: string
  icon: ReactNode
  title: string
  tone: 'amber' | 'blue' | 'green' | 'ink'
}) {
  return (
    <Link data-tone={tone} href={href} className={styles.workbenchAction}>
      <span className={styles.workbenchIcon}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight aria-hidden="true" className={styles.workbenchArrow} />
    </Link>
  )
}

function workDescription(data: PrivateAccountData) {
  if (!isReadySlice(data.community.stats))
    return '作品统计暂时无法读取。'
  const { contributions, workImpact } = data.community.stats.data
  return `${contributions.works} 件公开作品 · ${workImpact.likes} 次喜欢 · ${workImpact.views} 次浏览`
}
