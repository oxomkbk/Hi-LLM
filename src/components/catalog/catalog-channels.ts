import { MagicWand, PlugConnection, Puzzle } from '@gravity-ui/icons'

import type { ElementType } from 'react'

export type CatalogChannel = 'mcp' | 'prompt' | 'skill'

interface CatalogChannelConfig {
  actionLabel: string
  descriptor: string
  icon: ElementType
  label: string
  rootHref: string
  submitHref: string
}

export const CATALOG_CHANNELS: Record<CatalogChannel, CatalogChannelConfig> = {
  mcp: {
    actionLabel: '接入 MCP',
    descriptor: '连接器目录',
    icon: PlugConnection,
    label: 'MCP',
    rootHref: '/mcp',
    submitHref: '/mcp/submit',
  },
  prompt: {
    actionLabel: '分享 Prompt',
    descriptor: '创作资源库',
    icon: MagicWand,
    label: 'Prompts',
    rootHref: '/prompts',
    submitHref: '/prompts/submit',
  },
  skill: {
    actionLabel: '发布 Skill',
    descriptor: '能力工作流',
    icon: Puzzle,
    label: 'Skills',
    rootHref: '/skills',
    submitHref: '/skills/submit',
  },
}

export const CATALOG_CHANNEL_ORDER: CatalogChannel[] = ['skill', 'mcp', 'prompt']

export function getCatalogChannel(pathname: string): CatalogChannel | null {
  return CATALOG_CHANNEL_ORDER.find((channel) => {
    const { rootHref } = CATALOG_CHANNELS[channel]
    return pathname === rootHref || pathname.startsWith(`${rootHref}/`)
  }) ?? null
}
