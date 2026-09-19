'use client'

import { Code, Globe, Person } from '@gravity-ui/icons'
import { Chip } from '@heroui/react'
import dynamic from 'next/dynamic'

import CatalogIcon from '@/components/catalog/catalog-icon'

import type { SkillComposerValue } from './types'

const MarkdownRenderer = dynamic(() => import('@/components/content/markdown-renderer'), {
  loading: () => <div className="min-h-24 animate-pulse rounded-xl bg-surface-secondary" />,
})

interface SkillLivePreviewProps {
  value: SkillComposerValue
}

export default function SkillLivePreview({ value }: SkillLivePreviewProps) {
  const title = value.name.trim() || 'Skill 名称'
  const summary = value.summary.trim() || '一句话说明这个 Skill 能解决什么问题。'

  return (
    <article className="overflow-hidden rounded-2xl bg-background shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
      <div className="px-5 py-5">
        <div className="flex items-start gap-3">
          <CatalogIcon
            name={title}
            kind="skill"
            value={value.icon}
            className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-secondary p-1.5 text-success"
          />
          <div className="min-w-0 flex-1">
            <h2 title={title} className="truncate text-base font-black tracking-[-0.025em] text-foreground">{title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Person className="size-3.5" />
              <span className="truncate">{value.author_name.trim() || '作者名称'}</span>
            </p>
          </div>
        </div>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {value.category ? <Chip size="sm" variant="secondary">{value.category}</Chip> : null}
          {value.platforms.map(platform => <Chip key={platform} size="sm" variant="soft">{platform}</Chip>)}
          {value.tags.slice(0, 3).map(tag => (
            <Chip key={tag} size="sm" variant="soft">
              #
              {tag}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mx-5 rounded-xl bg-surface-secondary px-4 py-3.5">
        <p className="text-[12px] font-bold text-foreground">来源与使用</p>
        <div className="mt-2 space-y-2 text-xs leading-5 text-muted">
          <p className="flex items-start gap-2">
            {value.source_kind === 'platform_content' ? <Globe className="mt-0.5 size-3.5" /> : <Code className="mt-0.5 size-3.5" />}
            <span>{sourceLabel(value)}</span>
          </p>
          {value.install_command.trim()
            ? <code className="block overflow-hidden text-ellipsis rounded-lg bg-surface-secondary px-2.5 py-2 font-mono text-[11px] text-foreground">{value.install_command}</code>
            : null}
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-foreground">详细说明</p>
          <span className="rounded-full bg-surface-secondary px-2 py-1 text-[11px] text-muted">实时预览</span>
        </div>
        {value.description.trim()
          ? <MarkdownRenderer content={value.description} className="pointer-events-none max-h-[32rem] overflow-hidden text-sm [mask-image:linear-gradient(to_bottom,black_88%,transparent)]" />
          : <p className="rounded-xl bg-surface-secondary px-4 py-6 text-center text-xs leading-5 text-muted">填写完整说明后，这里会显示最终排版。</p>}
      </div>
    </article>
  )
}

function sourceLabel(value: SkillComposerValue) {
  if (value.source_kind === 'platform_content')
    return '站内原创内容，仅评测当前保存的说明与配置'
  if (!value.source_url.trim())
    return value.source_kind === 'git_repository' ? '等待填写 GitHub / GitLab 仓库' : '等待填写公开页面'
  return value.source_url
}
