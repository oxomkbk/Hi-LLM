'use client'

import { Code, Person, PlugConnection } from '@gravity-ui/icons'
import { Chip } from '@heroui/react'
import dynamic from 'next/dynamic'

import CatalogIcon from '@/components/catalog/catalog-icon'

import type { McpComposerValue } from './types'

const MarkdownRenderer = dynamic(() => import('@/components/content/markdown-renderer'), {
  loading: () => <div className="min-h-24 animate-pulse rounded-xl bg-surface-secondary" />,
})

export default function McpLivePreview({ value }: { value: McpComposerValue }) {
  const title = value.name.trim() || 'MCP Server 名称'
  const summary = value.summary.trim() || '一句话说明这个 MCP Server 提供什么能力。'

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <CatalogIcon
            name={title}
            kind="mcp"
            value={value.icon}
            className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-secondary p-2 text-foreground"
          />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-black tracking-[-0.025em] text-foreground">{title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Person className="size-3.5" />
              {value.publisher_name.trim() || '发布者名称'}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {value.category ? <Chip size="sm" variant="secondary">{value.category}</Chip> : null}
          {value.capabilities.map(capability => <Chip key={capability} size="sm" variant="soft">{capability}</Chip>)}
          {value.clients.slice(0, 2).map(client => <Chip key={client} size="sm" variant="soft">{client}</Chip>)}
        </div>
      </div>

      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[12px] font-bold text-foreground">
            <PlugConnection className="size-3.5" />
            安装与连接
          </p>
          <span className="text-[11px] text-muted">
            {value.installations.length}
            {' '}
            种方式
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {value.installations.slice(0, 3).map((installation, index) => (
            <div key={installation.id} className="rounded-xl bg-surface-secondary/55 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-xs font-bold">{installation.label.trim() || `连接方式 ${index + 1}`}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase text-muted">{installation.transport}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-muted">{installation.transport === 'stdio' ? installation.package || '待填写包名' : installation.remote_url || '待填写远程端点'}</p>
              {installation.env_vars.length
                ? (
                    <p className="mt-1 text-[10px] text-muted">
                      需要
                      {installation.env_vars.length}
                      {' '}
                      个环境变量
                    </p>
                  )
                : null}
            </div>
          ))}
          {value.installations.length > 3
            ? (
                <p className="text-center text-[11px] text-muted">
                  另有
                  {value.installations.length - 3}
                  {' '}
                  种连接方式
                </p>
              )
            : null}
        </div>
      </div>

      <div className="border-b border-border px-5 py-4">
        <p className="flex items-start gap-2 text-xs leading-5 text-muted">
          <Code className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-all">{value.source_url.trim() || '等待填写公开源码地址'}</span>
        </p>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-foreground">详细说明</p>
          <span className="rounded-full bg-surface-secondary px-2 py-1 text-[11px] text-muted">实时预览</span>
        </div>
        {value.description.trim()
          ? <MarkdownRenderer content={value.description} className="pointer-events-none max-h-[28rem] overflow-hidden text-sm [mask-image:linear-gradient(to_bottom,black_88%,transparent)]" />
          : <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs leading-5 text-muted">填写完整说明后，这里会显示最终排版。</p>}
      </div>
    </article>
  )
}
