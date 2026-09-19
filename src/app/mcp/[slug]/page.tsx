import {
  ArrowLeft,
  ArrowUpRight,
  CircleCheckFill,
  Code,
  Link as LinkIcon,
  LogoMcp,
  PlugConnection,
  ShieldCheck,
  StarFill,
  Terminal,
} from '@gravity-ui/icons'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import detailStyles from '@/components/catalog/detail-page.module.css'
import MarkdownRenderer from '@/components/content/markdown-renderer'
import McpCard from '@/components/McpCard'
import SecurityBadge from '@/components/security/security-badge'
import SecuritySummaryPanel from '@/components/security/security-summary-panel'
import { createMcpSlug } from '@/lib/mcps'
import { safeReturnTo } from '@/lib/navigation/return-context'

import CopyConfigButton from './copy-config-button'
import { getPublicMcpDetail } from './data'

import type { McpInstallation } from '@/types'
import type { Metadata } from 'next'

const CAPABILITIES = [
  { description: '向 Agent 提供可调用的操作。', key: 'Tools', label: '工具调用' },
  { description: '向客户端公开结构化资源。', key: 'Resources', label: '资源读取' },
  { description: '提供可复用的提示词模板。', key: 'Prompts', label: '提示词模板' },
] as const

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicMcpDetail(slug)
  if (!data)
    return { title: 'MCP Server 不存在' }
  return { title: `${data.mcp.name} MCP Server | ${process.env.NEXT_PUBLIC_APP_NAME}`, description: data.mcp.summary }
}

export default async function McpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug: rawSlug }, query] = await Promise.all([params, searchParams])
  if (createMcpSlug(rawSlug) !== rawSlug)
    notFound()
  const data = await getPublicMcpDetail(rawSlug)
  if (!data)
    notFound()
  const { mcp, related } = data
  const returnHref = safeReturnTo(query.returnTo, '/mcp', { exactPathnames: ['/mcp'] })

  return (
    <div
      data-channel="mcp"
      className={`${detailStyles.page} catalog-detail-page catalog-detail-page--mcp mcp-detail-page mcp-detail-full-bleed`}
    >
      <div className={detailStyles.container}>
        <header className={detailStyles.hero}>
          <Link href={returnHref} className={detailStyles.backLink}>
            <ArrowLeft aria-hidden="true" />
            返回 MCP 目录
          </Link>

          <div className={detailStyles.heroGrid}>
            <div className={detailStyles.heroMain}>
              <div className={detailStyles.identity}>
                <span aria-hidden="true" className={detailStyles.identityIcon}>
                  <LogoMcp />
                </span>
                <div className={detailStyles.heroCopy}>
                  <div className={detailStyles.badges}>
                    <span data-tone="accent" className={detailStyles.badge}>{mcp.category}</span>
                    {mcp.featured
                      ? (
                          <span data-tone="accent" className={detailStyles.badge}>
                            <StarFill aria-hidden="true" />
                            精选
                          </span>
                        )
                      : null}
                    {mcp.verified
                      ? (
                          <span data-tone="verified" className={detailStyles.badge}>
                            <CircleCheckFill aria-hidden="true" />
                            已验证
                          </span>
                        )
                      : null}
                    <SecurityBadge compact subject={mcp} />
                  </div>
                  <h1 className={detailStyles.title}>{mcp.name}</h1>
                </div>
              </div>
              <p className={detailStyles.summary}>
                <span className={detailStyles.summaryLabel}>主要用途</span>
                {mcp.summary}
              </p>
              <div aria-label="MCP 能力与标签" className={detailStyles.tagRow}>
                {[...new Set(mcp.capabilities)].map(item => <span key={`capability-${item}`} className={detailStyles.tag}>{item}</span>)}
                {[...new Set(mcp.tags)].map(item => <span key={`tag-${item}`} className={detailStyles.tag}>{`#${item}`}</span>)}
              </div>
            </div>

            <aside aria-label="MCP Server 概览" className={detailStyles.heroAside}>
              <dl className={detailStyles.factGrid}>
                <HeroFact label="Server 版本" mono value={mcp.version || '持续更新'} />
                <HeroFact label="MCP 协议" mono value={mcp.protocol_version} />
                <HeroFact label="发布者" value={mcp.publisher_name} />
                <HeroFact label="更新" value={formatDate(mcp.updated_at)} />
              </dl>
              <div className={detailStyles.heroActions}>
                <a data-primary="true" href="#mcp-installations" className={detailStyles.actionLink}>
                  <PlugConnection aria-hidden="true" />
                  查看连接配置
                </a>
                <a href={mcp.source_url} rel="noopener noreferrer" target="_blank" className={detailStyles.actionLink}>
                  <Code aria-hidden="true" />
                  查看源码
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </aside>
          </div>
        </header>

        <div className={detailStyles.main}>
          <div className={detailStyles.contentGrid}>
            <article className={detailStyles.article}>
              <section aria-labelledby="mcp-installations-title" id="mcp-installations">
                <header className={detailStyles.sectionHeader}>
                  <div className={detailStyles.sectionHeaderCopy}>
                    <p className={detailStyles.eyebrow}>快速接入</p>
                    <h2 id="mcp-installations-title" className={detailStyles.sectionTitle}>安装与连接</h2>
                    <p className={detailStyles.sectionDescription}>选择适合客户端的连接方式，检查环境变量后复制配置。</p>
                  </div>
                </header>
                {mcp.installations.length
                  ? (
                      <div className={detailStyles.installationList}>
                        {mcp.installations.map((installation, index) => (
                          <InstallationPanel key={installation.id} index={index} installation={installation} />
                        ))}
                      </div>
                    )
                  : <p className={detailStyles.sectionDescription}>该 Server 暂未公开连接配置。</p>}
              </section>

              <section aria-labelledby="mcp-capabilities-title" className={detailStyles.capabilitySection}>
                <header className={detailStyles.sectionHeader}>
                  <div className={detailStyles.sectionHeaderCopy}>
                    <p className={detailStyles.eyebrow}>能力范围</p>
                    <h2 id="mcp-capabilities-title" className={detailStyles.sectionTitle}>Server 能力</h2>
                    <p className={detailStyles.sectionDescription}>以下状态来自发布者提交的公开能力声明。</p>
                  </div>
                </header>
                <div className={detailStyles.capabilityGrid}>
                  {CAPABILITIES.map((capability) => {
                    const active = mcp.capabilities.includes(capability.key)
                    return (
                      <div key={capability.key} data-active={active || undefined} className={detailStyles.capability}>
                        <span aria-hidden="true" className={detailStyles.capabilityMark}>
                          {active ? <CircleCheckFill /> : '—'}
                        </span>
                        <strong>{capability.label}</strong>
                        <p>{active ? capability.description : '发布者未声明此能力。'}</p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section aria-labelledby="mcp-overview-title" className={detailStyles.capabilitySection}>
                <header className={detailStyles.sectionHeader}>
                  <div className={detailStyles.sectionHeaderCopy}>
                    <p className={detailStyles.eyebrow}>产品概览</p>
                    <h2 id="mcp-overview-title" className={detailStyles.sectionTitle}>Server 说明</h2>
                    <p className={detailStyles.sectionDescription}>了解用途、工作方式、能力边界与配置要求。</p>
                  </div>
                </header>
                {mcp.description.trim()
                  ? <MarkdownRenderer content={mcp.description} demoteHeadings className={detailStyles.prose} />
                  : <p className={detailStyles.emptyDocument}>该 Server 暂未提供详细说明。</p>}
              </section>
            </article>

            <aside aria-label="连接决策与 MCP 信息" className={detailStyles.sidebar}>
              <section className={detailStyles.sidePanel}>
                <h2 className={detailStyles.sidePanelTitle}>
                  <ShieldCheck aria-hidden="true" />
                  连接前确认
                </h2>
                <div className={detailStyles.safetyList}>
                  <p className={detailStyles.safetyItem}>
                    <ShieldCheck aria-hidden="true" />
                    目录只展示公开元数据，不会主动连接或探测远程端点。
                  </p>
                  <p className={detailStyles.safetyItem}>
                    <Terminal aria-hidden="true" />
                    执行第三方命令前，请检查源码、权限和网络访问范围。
                  </p>
                </div>
                <div aria-label="兼容客户端" className={detailStyles.clientList}>
                  {[...new Set(mcp.clients)].map(client => <span key={`client-${client}`} className={detailStyles.tag}>{client}</span>)}
                </div>
              </section>

              <section className={detailStyles.sidePanel}>
                <h2 className={detailStyles.sidePanelTitle}>Server 信息</h2>
                <dl className={detailStyles.sideFacts}>
                  <SideFact label="连接方式" value={`${mcp.installations.length} 种`} />
                  <SideFact label="开发语言" value={mcp.language || '未标注'} />
                  <SideFact label="许可证" value={mcp.license || '未标注'} />
                  <SideFact label="Registry" value={mcp.registry_name || '未收录'} />
                </dl>
                <div className={detailStyles.linkList}>
                  <SourceLink href={mcp.source_url} icon={<Code />} label="查看源代码" />
                  {mcp.docs_url ? <SourceLink href={mcp.docs_url} icon={<LinkIcon />} label="阅读文档" /> : null}
                  {mcp.homepage_url ? <SourceLink href={mcp.homepage_url} icon={<ArrowUpRight />} label="项目主页" /> : null}
                  {mcp.publisher_url ? <SourceLink href={mcp.publisher_url} icon={<ArrowUpRight />} label="发布者主页" /> : null}
                </div>
              </section>
            </aside>
          </div>

          <div id="mcp-security" className={detailStyles.securitySection}>
            <SecuritySummaryPanel subject={mcp} subjectKind="mcp" />
          </div>

          {related.length
            ? (
                <section aria-labelledby="related-mcps-title" className={detailStyles.relatedSection}>
                  <header className={detailStyles.relatedHeader}>
                    <div>
                      <p className={detailStyles.eyebrow}>继续探索</p>
                      <h2 id="related-mcps-title" className={detailStyles.sectionTitle}>相关 MCP Servers</h2>
                    </div>
                    <Link href="/mcp" className={detailStyles.relatedLink}>浏览全部</Link>
                  </header>
                  <div className={detailStyles.relatedGrid}>
                    {related.map((item, index) => <McpCard key={item.id} index={index} mcp={item} />)}
                  </div>
                </section>
              )
            : null}
        </div>
      </div>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value)
    return '待更新'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

function HeroFact({ label, mono = false, value }: { label: string, mono?: boolean, value: string }) {
  return (
    <div className={detailStyles.fact}>
      <dt>{label}</dt>
      <dd title={value} data-mono={mono || undefined}>{value}</dd>
    </div>
  )
}

function InstallationPanel({ index, installation }: { index: number, installation: McpInstallation }) {
  const config = JSON.stringify(installation.config_template, null, 2)
  const endpoint = installation.remote_url || [installation.command, ...(installation.args || [])].filter(Boolean).join(' ')

  return (
    <article className={detailStyles.installation}>
      <header className={detailStyles.installationHeader}>
        <div className={detailStyles.installationIdentity}>
          <span aria-hidden="true" className={detailStyles.installationIndex}>{String(index + 1).padStart(2, '0')}</span>
          <h3 className={detailStyles.installationTitle}>{installation.label}</h3>
        </div>
        <div className={detailStyles.installationTags}>
          <span className={detailStyles.installationTag}>{installation.transport}</span>
          <span className={detailStyles.installationTag}>{installation.auth_type}</span>
        </div>
      </header>
      <div className={detailStyles.installationBody}>
        <div className={detailStyles.installationMeta}>
          <p className={detailStyles.metaLabel}>{installation.remote_url ? '远程端点' : '启动命令'}</p>
          <code className={detailStyles.endpoint}>{endpoint || '未提供'}</code>
          {installation.package
            ? (
                <p className={detailStyles.packageNote}>
                  {`Package：${installation.package}${installation.version ? `@${installation.version}` : ''}`}
                </p>
              )
            : null}
          {installation.env_vars.length
            ? (
                <div className={detailStyles.environment}>
                  <p className={detailStyles.metaLabel}>需要配置的环境变量</p>
                  <div className={detailStyles.environmentList}>
                    {[...new Set(installation.env_vars.map(item => item.name))].map(name => <code key={name}>{name}</code>)}
                  </div>
                </div>
              )
            : null}
        </div>
        <div className={detailStyles.configPanel}>
          <div className={detailStyles.configHeader}>
            <span>客户端配置 JSON</span>
            <CopyConfigButton value={config} />
          </div>
          <pre><code>{config}</code></pre>
        </div>
      </div>
    </article>
  )
}

function SideFact({ label, value }: { label: string, value: string }) {
  return (
    <div className={detailStyles.sideFact}>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  )
}

function SourceLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank" className={detailStyles.sideLink}>
      {label}
      <span aria-hidden="true">{icon}</span>
    </a>
  )
}
