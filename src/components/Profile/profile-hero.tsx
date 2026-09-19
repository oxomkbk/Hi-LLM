import { Camera, Check, Person } from '@gravity-ui/icons'
import Image from 'next/image'
import Link from 'next/link'

import { ProfileBackdrop } from './profile-backdrop'
import { ProfileContributionLedger } from './profile-contribution-ledger'
import styles from './profile.module.css'

import type { ProfileAppearance } from '@/lib/account/appearance'
import type {
  CommunityStats,
  DataSlice,
  PrivateAccountUser,
  PublicAccountUser,
} from '@/lib/account/profile-types'
import type { ReactNode } from 'react'

interface ProfileHeroCommonProps {
  actions: ReactNode
  appearance: ProfileAppearance
  stats: DataSlice<CommunityStats>
}

type ProfileHeroProps = ProfileHeroCommonProps & (
  | {
    avatarEditHref: string
    user: Pick<PrivateAccountUser, 'bio' | 'createdAt' | 'emailVerified' | 'image' | 'name' | 'role'>
    variant: 'account'
  }
  | {
    avatarEditHref?: never
    user: PublicAccountUser
    variant: 'public'
  }
)

export function ProfileHero({
  actions,
  appearance,
  avatarEditHref,
  stats,
  user,
  variant,
}: ProfileHeroProps) {
  const avatar = (
    <span data-profile-avatar="" className={styles.avatarFrame}>
      {user.image
        ? (
            <Image
              alt={user.name}
              fill
              loading="eager"
              sizes="112px"
              src={user.image}
              unoptimized
              className={styles.avatarImage}
            />
          )
        : <Person aria-hidden="true" className={styles.avatarFallback} />}
      {avatarEditHref
        ? (
            <span className={styles.avatarEditBadge}>
              <Camera aria-hidden="true" />
            </span>
          )
        : null}
    </span>
  )

  return (
    <ProfileBackdrop appearance={appearance}>
      <div data-profile-hero="" className={styles.heroGrid}>
        <div data-profile-identity="" className={styles.heroIdentity}>
          {avatarEditHref
            ? <Link aria-label="前往公开资料设置更换头像" href={avatarEditHref} className={styles.avatarLink}>{avatar}</Link>
            : avatar}
          <div data-profile-copy="" className={styles.heroCopy}>
            <div data-profile-topline="" className={styles.heroTopline}>
              <p data-profile-eyebrow="" className={styles.eyebrow}>{variant === 'account' ? '我的创作空间' : '社区创作者'}</p>
              <span>
                Hi LLM ·
                {' '}
                {new Date(user.createdAt).getFullYear()}
              </span>
            </div>
            <h1 data-profile-title="" className={styles.title}>{user.name}</h1>
            <p data-profile-bio="" className={styles.bio}>{user.bio || (variant === 'account' ? '补充一段简介，让公开主页更像你。' : '这位创作者还没有填写个人简介。')}</p>
            <div data-profile-metadata="" className={styles.metadata}>
              <span>
                {formatMonth(user.createdAt)}
                加入
              </span>
              {variant === 'account'
                ? (
                    <>
                      <span>{user.role === 'admin' ? '管理员' : '社区成员'}</span>
                      <span data-verified={user.emailVerified || undefined} className={styles.verifiedStatus}>
                        {user.emailVerified ? <Check aria-hidden="true" /> : null}
                        {user.emailVerified ? '邮箱已验证' : '邮箱待验证'}
                      </span>
                    </>
                  )
                : null}
            </div>
            <div data-profile-actions="" className={styles.profileActions}>{actions}</div>
          </div>
        </div>

        <div data-profile-ledger="" className={styles.heroLedger}>
          <div data-profile-ledger-heading="" className={styles.ledgerHeading}>
            <p className={styles.ledgerLabel}>公开足迹</p>
            <span>
              <i aria-hidden="true" />
              持续更新
            </span>
          </div>
          <ProfileContributionLedger stats={stats} />
        </div>
      </div>
    </ProfileBackdrop>
  )
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', year: 'numeric' }).format(new Date(value))
}
