'use client'

import { Lock, Palette, Person, Sparkles } from '@gravity-ui/icons'
import { Tabs } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import styles from '@/components/Profile/profile.module.css'

import type { AccountSection } from './account-sections'

const SECTIONS: Array<{
  description: string
  icon: typeof Sparkles
  id: AccountSection
  label: string
}> = [
  { description: '作品、社区动态和下一步', icon: Sparkles, id: 'overview', label: '概览' },
  { description: '头像、简介和个人网站', icon: Person, id: 'profile', label: '公开资料' },
  { description: '封面、图片和展示比例', icon: Palette, id: 'appearance', label: '主页外观' },
  { description: '登录凭据和账号状态', icon: Lock, id: 'security', label: '账号安全' },
]

export function AccountSectionTabs({ selectedSection }: { selectedSection: AccountSection }) {
  const router = useRouter()

  useEffect(() => {
    const legacySection = window.location.hash.slice(1) as AccountSection
    if (SECTIONS.some(section => section.id === legacySection) && legacySection !== selectedSection) {
      router.replace(`/account?section=${legacySection}`)
      return
    }
    if (window.sessionStorage.getItem('account-section-focus') === selectedSection) {
      window.sessionStorage.removeItem('account-section-focus')
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#account-section-title')?.focus())
    }
  }, [router, selectedSection])

  const active = SECTIONS.find(section => section.id === selectedSection) ?? SECTIONS[0]

  return (
    <Tabs selectedKey={selectedSection} className={styles.accountTabs}>
      <Tabs.ListContainer className={styles.accountTabsScroller}>
        <Tabs.List aria-describedby="account-section-description" aria-label="个人中心功能" className={styles.accountTabsList}>
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <Tabs.Tab
                key={section.id}
                id={section.id}
                href={`/account?section=${section.id}`}
                render={(props: any) => <Link {...props} />}
                onPress={() => window.sessionStorage.setItem('account-section-focus', section.id)}
                className={styles.accountTab}
              >
                <Icon aria-hidden="true" />
                {section.label}
                <Tabs.Indicator className={styles.accountTabIndicator} />
              </Tabs.Tab>
            )
          })}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id={selectedSection} className={styles.accountTabDescription}>
        <span id="account-section-description">{active.description}</span>
      </Tabs.Panel>
    </Tabs>
  )
}
