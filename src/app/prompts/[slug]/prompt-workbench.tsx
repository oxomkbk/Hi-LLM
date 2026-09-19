'use client'

import { ArrowLeft, ArrowRight, FileArrowDown, ShieldCheck } from '@gravity-ui/icons'
import Link from 'next/link'

import detailStyles from '@/components/catalog/detail-page.module.css'
import SecurityBadge from '@/components/security/security-badge'
import SecuritySummaryPanel from '@/components/security/security-summary-panel'
import { PROMPT_CONTENT_KINDS } from '@/lib/prompts'
import { selectPromptPreviewAssets } from '@/lib/prompts/detail-presentation'

import PromptGlossaryWorkbench from './prompt-glossary-workbench'
import PromptStandardWorkbench from './prompt-standard-workbench'

import type { PromptGlossaryDocument } from '@/lib/prompts/glossary'
import type { PromptGlossaryPreviewBundle } from '@/lib/prompts/glossary-preview'
import type { PromptAsset, PromptDetailView } from '@/types'

export default function PromptWorkbench({
  glossary,
  glossaryInvalid,
  glossaryPreview,
  initialTermQuery,
  prompt,
  returnHref,
}: {
  glossary: PromptGlossaryDocument | null
  glossaryInvalid: boolean
  glossaryPreview: PromptGlossaryPreviewBundle | null
  initialTermQuery: string
  prompt: PromptDetailView
  returnHref: string
}) {
  const previewCount = selectPromptPreviewAssets(prompt.assets).length
  const packageAsset = prompt.assets.find(asset => asset.role === 'source_package' && asset.url && asset.is_downloadable)
  const kind = PROMPT_CONTENT_KINDS.find(item => item.value === prompt.content_kind)
  const usageSteps = glossary
    ? [
        ['描述问题', '用自然语言搜索对应术语'],
        ['理解术语', '对照预览、解释和使用场景'],
        ['复制表达', '直接交给 AI 执行'],
      ]
    : [
        ['查看结果', '先确认成品方向是否匹配'],
        ['阅读说明', '理解内容结构和使用方式'],
        ['复制使用', '替换变量后交给 AI'],
      ]

  return (
    <div data-channel="prompt" className={`${detailStyles.page} catalog-detail-page catalog-detail-page--prompt prompt-detail-full-bleed`}>
      <div className={detailStyles.container}>
        <header className={`${detailStyles.hero} ${detailStyles.promptHero}`}>
          <Link href={returnHref} className={detailStyles.backLink}>
            <ArrowLeft aria-hidden="true" />
            返回 Prompts
          </Link>

          <div className={detailStyles.heroGrid}>
            <div className={detailStyles.heroMain}>
              <div className={detailStyles.identity}>
                <div className={detailStyles.heroCopy}>
                  <div className={detailStyles.badges}>
                    <span data-tone="accent" className={detailStyles.badge}>{kind?.label ?? 'Prompt'}</span>
                    {prompt.categories.slice(0, 2).map(category => <span key={category.id} className={detailStyles.badge}>{category.name}</span>)}
                    <SecurityBadge compact subject={prompt} />
                  </div>
                  <h1 className={detailStyles.title}>{prompt.title}</h1>
                </div>
              </div>
              <p className={detailStyles.summary}>
                <span className={detailStyles.summaryLabel}>主要用途</span>
                {prompt.summary}
              </p>
              <div aria-label="适配平台与标签" className={detailStyles.tagRow}>
                {[...new Set(prompt.compatibility.length ? prompt.compatibility : ['通用'])].slice(0, 5).map(item => <span key={`compatibility-${item}`} className={detailStyles.tag}>{item}</span>)}
                {[...new Set(prompt.tags)].slice(0, 5).map(tag => <span key={`tag-${tag}`} className={detailStyles.tag}>{`#${tag}`}</span>)}
              </div>
              <div className={detailStyles.promptHeroFooter}>
                <p className={detailStyles.promptUtilities}>
                  <span>{`${prompt.documents.length} 个内容文件`}</span>
                  <span>{previewCount ? `${previewCount} 个预览` : '以文字内容为主'}</span>
                  <span>{`更新于 ${formatDate(prompt.updated_at)}`}</span>
                </p>
              </div>
            </div>

            <aside aria-label="阅读路径" className={detailStyles.promptUsageRail}>
              <p>阅读路径</p>
              <ol>
                {usageSteps.map(([label, description], index) => (
                  <li key={label}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </div>
                  </li>
                ))}
              </ol>
              <nav aria-label="Prompt 操作" className={detailStyles.promptHeroActions}>
                <a data-primary="true" href="#prompt-content" className={detailStyles.actionLink}>
                  开始阅读
                  <ArrowRight aria-hidden="true" />
                </a>
                {packageAsset
                  ? (
                      <a href={downloadUrl(packageAsset)} className={detailStyles.actionLink}>
                        <FileArrowDown aria-hidden="true" />
                        下载源包
                      </a>
                    )
                  : null}
                <a href="#prompt-security" className={detailStyles.actionLink}>
                  <ShieldCheck aria-hidden="true" />
                  安全评测
                </a>
              </nav>
            </aside>
          </div>
        </header>

        <div id="prompt-content" className={detailStyles.main}>
          {glossaryInvalid
            ? <PromptContentError returnHref={returnHref} />
            : glossary
              ? <PromptGlossaryWorkbench title={prompt.title} document={glossary} initialQuery={initialTermQuery} previewBundle={glossaryPreview} slug={prompt.slug} />
              : <PromptStandardWorkbench prompt={prompt} />}

          <div id="prompt-security" className={detailStyles.securitySection}>
            <SecuritySummaryPanel subject={prompt} subjectKind="prompt" />
          </div>
        </div>
      </div>
    </div>
  )
}

function downloadUrl(asset: PromptAsset) {
  return `${asset.url}${asset.url?.includes('?') ? '&' : '?'}download=1`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

function PromptContentError({ returnHref }: { returnHref: string }) {
  return (
    <section aria-labelledby="prompt-content-error-title" className={detailStyles.promptContentError}>
      <span aria-hidden="true">!</span>
      <div>
        <p>内容状态</p>
        <h2 id="prompt-content-error-title">这份内容暂时无法阅读</h2>
        <p>内容结构未通过校验，我们没有把原始数据直接展示给你。可以先返回 Prompts 浏览其他内容。</p>
      </div>
      <Link href={returnHref} className={detailStyles.actionLink}>返回 Prompts</Link>
    </section>
  )
}
