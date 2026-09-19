import {
  ArrowLeft,
  ArrowUpRight,
  CircleCheckFill,
  Code,
  ShieldCheck,
  StarFill,
  Terminal,
} from '@gravity-ui/icons'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import detailStyles from '@/components/catalog/detail-page.module.css'
import MarkdownRenderer from '@/components/content/markdown-renderer'
import SecurityBadge from '@/components/security/security-badge'
import SecuritySummaryPanel from '@/components/security/security-summary-panel'
import SkillCard, { SkillIcon } from '@/components/SkillCard'
import { safeReturnTo } from '@/lib/navigation/return-context'

import CopyInstallButton from './copy-install-button'
import { getPublishedSkill, getRelatedSkills } from './data'

import type { Metadata } from 'next'

interface SkillDetailProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: SkillDetailProps): Promise<Metadata> {
  const { slug } = await params
  const skill = await getPublishedSkill(slug)
  if (!skill)
    return { title: `Skill 不存在 | ${process.env.NEXT_PUBLIC_APP_NAME}` }

  return {
    title: `${skill.name} | Skills 社区`,
    description: skill.summary,
    keywords: [skill.name, skill.category, ...skill.platforms, ...skill.tags],
    openGraph: { title: `${skill.name} | Skills 社区`, description: skill.summary, type: 'article' },
  }
}

export default async function SkillDetailPage({ params, searchParams }: SkillDetailProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const skill = await getPublishedSkill(slug)
  if (!skill)
    notFound()
  const related = await getRelatedSkills(skill)
  const returnHref = safeReturnTo(query.returnTo, '/skills', { exactPathnames: ['/skills'] })

  return (
    <div data-channel="skill" className={`${detailStyles.page} catalog-detail-page catalog-detail-page--skill skills-full-bleed`}>
      <div className={detailStyles.container}>
        <header className={detailStyles.hero}>
          <Link href={returnHref} className={detailStyles.backLink}>
            <ArrowLeft aria-hidden="true" />
            返回 Skills 社区
          </Link>

          <div className={detailStyles.heroGrid}>
            <div className={detailStyles.heroMain}>
              <div className={detailStyles.identity}>
                <SkillIcon name={skill.name} eager icon={skill.icon} className={detailStyles.identityIcon} />
                <div className={detailStyles.heroCopy}>
                  <div className={detailStyles.badges}>
                    <span data-tone="accent" className={detailStyles.badge}>{skill.category}</span>
                    {skill.featured
                      ? (
                          <span data-tone="accent" className={detailStyles.badge}>
                            <StarFill aria-hidden="true" />
                            精选
                          </span>
                        )
                      : null}
                    {skill.verified
                      ? (
                          <span data-tone="verified" className={detailStyles.badge}>
                            <CircleCheckFill aria-hidden="true" />
                            已验证
                          </span>
                        )
                      : null}
                    <SecurityBadge compact subject={skill} />
                  </div>
                  <h1 className={detailStyles.title}>{skill.name}</h1>
                </div>
              </div>
              <p className={detailStyles.summary}>
                <span className={detailStyles.summaryLabel}>主要用途</span>
                {skill.summary}
              </p>
              <div className={detailStyles.tagRow}>
                {[...new Set(skill.platforms)].map(item => <span key={`platform-${item}`} className={detailStyles.tag}>{item}</span>)}
                {[...new Set(skill.tags)].map(item => <span key={`tag-${item}`} className={detailStyles.tag}>{`#${item}`}</span>)}
              </div>
            </div>

            <aside aria-label="Skill 概览" className={detailStyles.heroAside}>
              <dl className={detailStyles.factGrid}>
                <HeroFact label="版本" mono value={skill.version || '未标注'} />
                <HeroFact label="作者" value={skill.author_name} />
                <HeroFact label="许可证" value={skill.license || '未标注'} />
                <HeroFact label="更新" value={formatDate(skill.updated_at)} />
              </dl>
              <div className={detailStyles.heroActions}>
                {skill.install_command
                  ? (
                      <a data-primary="true" href="#skill-install" className={detailStyles.actionLink}>
                        <Terminal aria-hidden="true" />
                        安装 Skill
                      </a>
                    )
                  : null}
                {skill.source_url
                  ? (
                      <a href={skill.source_url} rel="noopener noreferrer" target="_blank" className={detailStyles.actionLink}>
                        <Code aria-hidden="true" />
                        查看来源
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                    )
                  : null}
                {skill.homepage_url
                  ? (
                      <a href={skill.homepage_url} rel="noopener noreferrer" target="_blank" className={detailStyles.actionLink}>
                        项目主页
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                    )
                  : null}
              </div>
            </aside>
          </div>
        </header>

        <div className={detailStyles.main}>
          <div className={detailStyles.contentGrid}>
            <article className={detailStyles.article}>
              <header className={detailStyles.sectionHeader}>
                <div className={detailStyles.sectionHeaderCopy}>
                  <p className={detailStyles.eyebrow}>使用指南</p>
                  <h2 className={detailStyles.sectionTitle}>快速了解与使用</h2>
                  <p className={detailStyles.sectionDescription}>安装前先阅读能力边界、适用场景与配置要求。</p>
                </div>
              </header>
              {skill.description.trim()
                ? <MarkdownRenderer content={skill.description} demoteHeadings className={detailStyles.prose} />
                : <p className={detailStyles.emptyDocument}>该 Skill 暂未提供使用说明。</p>}
            </article>

            <aside aria-label="安装与 Skill 信息" className={detailStyles.sidebar}>
              {skill.install_command
                ? (
                    <section id="skill-install" data-tone="dark" className={detailStyles.sidePanel}>
                      <h2 className={detailStyles.sidePanelTitle}>
                        <Terminal aria-hidden="true" />
                        安装命令
                      </h2>
                      <p className={detailStyles.sidePanelDescription}>复制后在目标 Agent 环境中执行。</p>
                      <code className={detailStyles.command}>{skill.install_command}</code>
                      <CopyInstallButton command={skill.install_command} />
                    </section>
                  )
                : null}

              <section className={detailStyles.sidePanel}>
                <h2 className={detailStyles.sidePanelTitle}>适用信息</h2>
                <dl className={detailStyles.sideFacts}>
                  <SideFact label="分类" value={skill.category} />
                  <SideFact label="适配平台" value={skill.platforms.join(' / ') || '通用 Agent'} />
                  <SideFact label="内容来源" value={sourceKindLabel(skill.source_kind)} />
                  <SideFact label="发布状态" value="已审核发布" />
                </dl>
                <p className={detailStyles.assurance}>
                  <ShieldCheck aria-hidden="true" />
                  平台只展示已完成发布审核的内容，安装前仍建议检查权限和执行命令。
                </p>
              </section>
            </aside>
          </div>

          <div id="skill-security" className={detailStyles.securitySection}>
            <SecuritySummaryPanel subject={skill} />
          </div>

          {related.length
            ? (
                <section aria-labelledby="related-skills-title" className={detailStyles.relatedSection}>
                  <header className={detailStyles.relatedHeader}>
                    <div>
                      <p className={detailStyles.eyebrow}>继续探索</p>
                      <h2 id="related-skills-title" className={detailStyles.sectionTitle}>相关 Skills</h2>
                    </div>
                    <Link href="/skills" className={detailStyles.relatedLink}>浏览全部</Link>
                  </header>
                  <div className={detailStyles.relatedGrid}>{related.map(item => <SkillCard key={item.id} skill={item} />)}</div>
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

function SideFact({ label, value }: { label: string, value: string }) {
  return (
    <div className={detailStyles.sideFact}>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  )
}

function sourceKindLabel(value: 'external_page' | 'git_repository' | 'platform_content') {
  return ({ external_page: '外部页面', git_repository: 'Git 仓库', platform_content: '平台内容' } as const)[value]
}
