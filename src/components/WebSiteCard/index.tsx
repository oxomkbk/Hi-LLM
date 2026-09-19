'use client'
import {
  BookmarkFill,
  CircleInfo,
  CrownDiamond,
  FolderTree,
  Medal,
  PinFill,
  ThumbsUpFill,
} from '@gravity-ui/icons'
import { Card, Chip, cn, Description, Tooltip } from '@heroui/react'
import Image from 'next/image'
import Link from 'next/link'
import { memo } from 'react'

import { generateLogoUrl } from '@/lib/utils'

import type { PublicCatalogWebsite } from '@/types'
import type { FC } from 'react'

interface WebsiteCardProps {
  data: PublicCatalogWebsite
  handleClick: (id: string) => void
}

const PODIUM_BADGES = {
  1: {
    className: 'bg-[linear-gradient(135deg,#fff1ae,#d99b22)] text-amber-950 shadow-[0_7px_18px_-8px_rgba(180,114,15,.78)]',
    icon: CrownDiamond,
    label: 'TOP 1',
  },
  2: {
    className: 'bg-[linear-gradient(135deg,#f8fafc,#aeb7c5)] text-slate-900 shadow-[0_7px_18px_-8px_rgba(71,85,105,.62)]',
    icon: Medal,
    label: 'TOP 2',
  },
  3: {
    className: 'bg-[linear-gradient(135deg,#f2c49f,#ad5a2c)] text-orange-950 shadow-[0_7px_18px_-8px_rgba(154,52,18,.62)]',
    icon: Medal,
    label: 'TOP 3',
  },
} as const

const WebsiteCard: FC<WebsiteCardProps> = memo(({ data, handleClick }) => {
  const { id, name, desc, vpn, logo, tags, pinned, recommend, url, commonlyUsed, categories = [], rankingPosition } = data || {}
  const extraCategoryCount = Math.max(0, categories.length - 1)
  const categoryNames = categories.map(category => category.name).join('、')
  const podiumRank = rankingPosition && rankingPosition <= 3 ? rankingPosition as 1 | 2 | 3 : null
  const podiumBadge = podiumRank ? PODIUM_BADGES[podiumRank] : null
  const PodiumIcon = podiumBadge?.icon

  return (
    <Link href={url} target="_blank" className="home-website-link">
      <Card
        data-has-badge={recommend || podiumBadge ? 'true' : undefined}
        onClick={() => handleClick(id)}
        className={cn('home-website-card relative h-full overflow-visible justify-between')}
      >
        {recommend || podiumBadge
          ? (
              <div className="home-website-badge absolute -right-1.5 -top-2 z-10">
                {podiumBadge && PodiumIcon
                  ? (
                      <span
                        aria-label={`全站有效访问排行榜第 ${podiumRank} 名${recommend ? '，推荐网站' : ''}`}
                        title={`全站排行榜第 ${podiumRank} 名${recommend ? ' · 推荐' : ''}`}
                        className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[9px] font-black tracking-[0.04em] ring-2 ring-background ${podiumBadge.className}`}
                      >
                        <PodiumIcon aria-hidden="true" className="size-3" />
                        {podiumBadge.label}
                        {recommend ? <span aria-hidden="true" className="border-l border-current/25 pl-1">推荐</span> : null}
                      </span>
                    )
                  : recommend
                    ? (
                        <span
                          aria-label="推荐网站"
                          title="推荐网站"
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-foreground px-2 text-[10px] font-black text-background shadow-[0_7px_18px_-8px_color-mix(in_oklab,var(--foreground)_66%,transparent)] ring-2 ring-background"
                        >
                          <ThumbsUpFill aria-hidden="true" className="size-3" />
                          推荐
                        </span>
                      )
                    : null}
              </div>
            )
          : null}
        <Card.Header className="home-website-card-header">
          <Card.Title className="flex items-center gap-2">
            {logo
              ? (
                  <div className="home-website-logo relative shrink-0">
                    <Image
                      alt={name}
                      height={42}
                      src={generateLogoUrl(logo)}
                      width={42}
                      className="home-website-logo-image size-full object-contain"
                    />
                  </div>
                )
              : null}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="text-base font-bold">{name}</div>
                {vpn
                  ? (
                      <Tooltip delay={0}>
                        <Tooltip.Trigger aria-label="VPN">
                          <CircleInfo className="text-muted" />
                        </Tooltip.Trigger>
                        <Tooltip.Content showArrow>
                          <Tooltip.Arrow />
                          访问需要开启 VPN 服务
                        </Tooltip.Content>
                      </Tooltip>
                    )
                  : null}
              </div>
              {tags?.length
                ? (
                    <div className="flex flex-wrap gap-1">
                      {tags.map(tag => (
                        <Chip key={tag} variant="soft" className="text-[10px]/4">{tag}</Chip>
                      ))}
                    </div>
                  )
                : null}
            </div>
          </Card.Title>
          {desc
            ? (
                <Card.Description className="text-xs overflow-hidden line-clamp-2 wrap-break-word mt-1">{desc}</Card.Description>
              )
            : null}
        </Card.Header>
        <Card.Footer className="flex justify-end">
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted">
            {/* 多分类 */}
            {extraCategoryCount > 0
              ? (
                  <div
                    aria-label={`共属于 ${categories.length} 个分类：${categoryNames}`}
                    title={`同时属于：${categoryNames}`}
                    className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-foreground/72"
                  >
                    <FolderTree aria-hidden="true" className="size-3" />
                    <Description>
                      多类 +
                      {extraCategoryCount}
                    </Description>
                  </div>
                )
              : null}
            {/* 置顶 */}
            {pinned
              ? (
                  <div className="flex items-center gap-0.5">
                    <PinFill className="size-3" />
                    <Description>置顶</Description>
                  </div>
                )
              : null}
            {/* 常用 */}
            {commonlyUsed
              ? (
                  <div className="flex items-center gap-0.5">
                    <BookmarkFill className="size-3" />
                    <Description>常用</Description>
                  </div>
                )
              : null}
          </div>
        </Card.Footer>
      </Card>
    </Link>
  )
})
export default WebsiteCard
