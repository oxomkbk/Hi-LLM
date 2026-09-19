'use client'

import {
  Code,
  Filmstrip,
  Magnifier,
  Picture,
  Sliders,
  StarFill,
} from '@gravity-ui/icons'
import { Alert, Button, SearchField, Spinner } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import CatalogContributionFooter from '@/components/catalog/catalog-contribution-footer'
import CatalogDirectoryHeader from '@/components/catalog/catalog-directory-header'
import CatalogMasthead from '@/components/catalog/catalog-masthead'
import CatalogPagination from '@/components/catalog/catalog-pagination'
import CatalogSortControls from '@/components/catalog/catalog-sort-controls'
import CatalogSubmitLink from '@/components/catalog/catalog-submit-link'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import NavigationAiAssistant from '@/components/NavigationAiAssistant'
import PromptCard from '@/components/PromptCard'
import { PROMPT_CONTENT_KINDS, PUBLIC_PROMPTS_PAGE_SIZE } from '@/lib/prompts'
import { request } from '@/lib/request'

import { buildPromptsListHref } from './filter-model'

import type { PromptFilters, PromptListState } from './filter-model'
import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type { PaginatingResponse, Prompt, PromptCategory, PromptContentKind } from '@/types'

const KIND_ICON = { adaptation: Sliders, image: Picture, video: Filmstrip, web_ui: Code }

export default function PromptsExplorer({ initialCategories, initialFilters, initialPage, initialPrompts, initialTotal }: { initialCategories: PromptCategory[], initialFilters: PromptFilters, initialPage: number, initialPrompts: Prompt[], initialTotal: number }) {
  const [prompts, setPrompts] = useState(initialPrompts)
  const [total, setTotal] = useState(initialTotal)
  const [q, setQ] = useState(initialFilters.q)
  const [kind, setKind] = useState<PromptContentKind | ''>(initialFilters.kind)
  const [category, setCategory] = useState(initialFilters.category)
  const [featuredOnly, setFeaturedOnly] = useState(initialFilters.featured)
  const [sort, setSort] = useState<PublicCatalogSort>(initialFilters.sort)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSubmittedFiltersRef = useRef<PromptListState>({ ...initialFilters, page: initialPage })
  const requestControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const resultsRef = useRef<HTMLElement>(null)
  const listHref = buildPromptsListHref(lastSubmittedFiltersRef.current)
  const pages = Math.max(1, Math.ceil(total / PUBLIC_PROMPTS_PAGE_SIZE))

  useEffect(() => () => requestControllerRef.current?.abort(), [])

  useEffect(() => {
    syncPromptUrl(listHref)
  }, [listHref])

  const load = async (next: Partial<PromptListState> = {}, retry = false) => {
    const requestId = ++requestIdRef.current
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller
    let values = retry ? lastSubmittedFiltersRef.current : { category: next.category ?? category, featured: next.featured ?? featuredOnly, kind: next.kind ?? kind, page: next.page ?? page, q: next.q ?? q, sort: next.sort ?? sort }
    if (!retry)
      lastSubmittedFiltersRef.current = values
    setCategory(values.category)
    setFeaturedOnly(values.featured)
    setKind(values.kind)
    setPage(values.page)
    setQ(values.q)
    setSort(values.sort)
    syncPromptUrl(buildPromptsListHref(values))
    setLoading(true)
    setError(null)
    try {
      let result = await request<PaginatingResponse<Prompt>>('/public/prompts', { params: { category: values.category, featured: values.featured ? true : undefined, kind: values.kind, pageIndex: values.page - 1, pageSize: PUBLIC_PROMPTS_PAGE_SIZE, q: values.q, sort: values.sort }, signal: controller.signal })
      if (requestId !== requestIdRef.current)
        return
      const nextPages = Math.max(1, Math.ceil(result.data.total / PUBLIC_PROMPTS_PAGE_SIZE))
      if (values.page > nextPages) {
        values = { ...values, page: nextPages }
        result = await request<PaginatingResponse<Prompt>>('/public/prompts', { params: { category: values.category, featured: values.featured ? true : undefined, kind: values.kind, pageIndex: values.page - 1, pageSize: PUBLIC_PROMPTS_PAGE_SIZE, q: values.q, sort: values.sort }, signal: controller.signal })
        if (requestId !== requestIdRef.current)
          return
        lastSubmittedFiltersRef.current = values
        setPage(values.page)
        syncPromptUrl(buildPromptsListHref(values))
      }
      setPrompts(result.data.list)
      setTotal(result.data.total)
    }
    catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === 'AbortError')
        return
      if (requestId === requestIdRef.current)
        setError(reason instanceof Error ? reason.message : 'Prompts 目录加载失败')
    }
    finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        requestControllerRef.current = null
      }
    }
  }

  const changePage = (nextPage: number) => {
    void load({ page: Math.min(pages, Math.max(1, nextPage)) })
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div data-catalog-directory="prompt" className="catalog-page catalog-page--prompt prompts-full-bleed prompts-page">
      <CatalogMasthead
        title="从成熟提示词开始创作"
        channel="prompt"
        description="浏览图片、视频与网页提示词，查看预览并复用完整内容。"
      >
        <div className="catalog-ai-search-dock">
          <div className="catalog-search-combo catalog-ai-companion-search">
            <SearchField
              aria-label="搜索 Prompts"
              name="prompts-search"
              variant="secondary"
              value={q}
              onChange={setQ}
              onSubmit={() => void load({ page: 1 })}
            >
              <SearchField.Group className="catalog-search-field">
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="搜索界面、风格、模型或场景…" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Button aria-label="执行 Prompts 搜索" isIconOnly isPending={loading} onPress={() => void load({ page: 1 })}>
              {loading ? <Spinner color="current" size="sm" /> : <Magnifier />}
            </Button>
          </div>
          <NavigationAiAssistant scope="prompts" />
        </div>
      </CatalogMasthead>

      <div>
        <section ref={resultsRef} aria-labelledby="prompts-directory-title" id="prompts-directory" className="scroll-mt-24">
          <CatalogDirectoryHeader
            id="prompts-directory-title"
            title={kind ? `${PROMPT_CONTENT_KINDS.find(item => item.value === kind)?.label} Prompts` : '全部 Prompts'}
            total={total}
          />

          <div className="catalog-filter-dock">
            <div aria-label="筛选 Prompts" className="catalog-shell catalog-filter-inner prompts-filter-panel">
              <div className="catalog-filter-row">
                <span className="catalog-filter-label">类型</span>
                <div className="prompts-kind-tabs">
                  <FilterButton active={!kind} label="全部" onPress={() => void load({ kind: '', page: 1 })} />
                  {PROMPT_CONTENT_KINDS.map(item => <FilterButton key={item.value} active={kind === item.value} icon={KIND_ICON[item.value]} label={item.label} onPress={() => void load({ kind: item.value, page: 1 })} />)}
                </div>
              </div>
              <div className="catalog-filter-row">
                <span className="catalog-filter-label">分类</span>
                <div className="prompts-category-row">
                  <button aria-pressed={!category} type="button" onClick={() => void load({ category: '', page: 1 })} className={`prompts-category-pill ${!category ? 'is-active' : ''}`}>全部分类</button>
                  {initialCategories.map(item => <button key={item.id} aria-pressed={category === item.slug} type="button" onClick={() => void load({ category: item.slug, page: 1 })} className={`prompts-category-pill ${category === item.slug ? 'is-active' : ''}`}>{item.name}</button>)}
                </div>
              </div>
              <div className="catalog-filter-row">
                <span className="catalog-filter-label">精选</span>
                <div aria-label="按精选状态筛选" role="group" className="flex min-w-0 flex-1 gap-1.5">
                  <FilterButton active={!featuredOnly} label="全部" onPress={() => void load({ featured: false, page: 1 })} />
                  <FilterButton active={featuredOnly} icon={StarFill} label="仅看精选" onPress={() => void load({ featured: true, page: 1 })} />
                </div>
              </div>
              <CatalogSortControls value={sort} onChange={value => void load({ page: 1, sort: value })} />
              {loading || q || kind || category || featuredOnly || sort !== 'latest'
                ? (
                    <div aria-live="polite" className="catalog-filter-summary">
                      <span>{loading ? '正在更新…' : '已应用筛选'}</span>
                      {q || kind || category || featuredOnly || sort !== 'latest'
                        ? <button type="button" onClick={() => void load({ category: '', featured: false, kind: '', page: 1, q: '', sort: 'latest' })}>清除筛选</button>
                        : null}
                    </div>
                  )
                : null}
            </div>
          </div>

          <div aria-busy={loading} className="catalog-shell catalog-results-region prompts-results">
            <ReturnTargetRestorer fallbackId="prompts-directory" ready={!loading && !error} />
            {error
              ? (
                  <Alert status="danger" className="catalog-error-alert">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Prompts 目录暂时无法加载</Alert.Title>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                    <Button size="sm" variant="danger" onPress={() => void load({}, true)}>重新加载</Button>
                  </Alert>
                )
              : null}
            {prompts.length
              ? <div className={`prompts-grid transition-opacity motion-reduce:transition-none ${loading ? 'opacity-55' : 'opacity-100'}`}>{prompts.map(prompt => <PromptCard key={prompt.id} prompt={prompt} returnTo={listHref} termQuery={lastSubmittedFiltersRef.current.q} />)}</div>
              : !loading && !error
                  ? (
                      <div className="prompts-empty catalog-empty-state">
                        <Magnifier className="size-8" />
                        <h3>{featuredOnly ? '暂时还没有精选 Prompt' : '没有匹配的 Prompt'}</h3>
                        <p>{featuredOnly ? '管理员尚未设置精选内容，可查看全部 Prompts。' : '换一个关键词或清除筛选，也可以提交你的 Prompt。'}</p>
                        <div className="catalog-empty-actions">
                          <Button size="sm" variant="secondary" onPress={() => void load({ category: '', featured: false, kind: '', page: 1, q: '', sort: 'latest' })}>重置筛选</Button>
                          <CatalogSubmitLink channel="prompt" placement="empty" />
                        </div>
                      </div>
                    )
                  : loading
                    ? <div aria-label="正在加载 Prompts" className="catalog-prompt-loading"><Spinner size="sm" /></div>
                    : null}

            <CatalogPagination ariaLabel="Prompts 目录分页" disabled={loading} page={page} totalPages={pages} onPageChange={changePage} />
          </div>
        </section>
      </div>

      <CatalogContributionFooter
        title="分享你的 Prompt 与样式"
        channel="prompt"
        description="支持提示词、Markdown、样式文件、图片、视频和完整资源包。"
      />
    </div>
  )
}

function FilterButton({ active, icon: Icon, label, onPress }: { active: boolean, icon?: typeof Code, label: string, onPress: VoidFunction }) {
  return (
    <button aria-pressed={active} type="button" onClick={onPress} className={`prompts-kind-button ${active ? 'is-active' : ''}`}>
      {Icon ? <Icon className="size-4" /> : null}
      {label}
    </button>
  )
}

function syncPromptUrl(nextUrl: string) {
  if (`${window.location.pathname}${window.location.search}` !== nextUrl)
    window.history.replaceState(window.history.state, '', nextUrl)
}
