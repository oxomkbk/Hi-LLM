'use client'

import {
  CircleCheckFill,
  StarFill,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  SearchField,
  Skeleton,
} from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import CatalogContributionFooter from '@/components/catalog/catalog-contribution-footer'
import CatalogDirectoryHeader from '@/components/catalog/catalog-directory-header'
import CatalogMasthead from '@/components/catalog/catalog-masthead'
import CatalogPagination from '@/components/catalog/catalog-pagination'
import CatalogSortControls from '@/components/catalog/catalog-sort-controls'
import CatalogSubmitLink from '@/components/catalog/catalog-submit-link'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import NavigationAiAssistant from '@/components/NavigationAiAssistant'
import SkillCard from '@/components/SkillCard'
import { SKILL_CATEGORIES, SKILL_PLATFORMS, SKILL_SCENARIOS } from '@/lib/skill-constants'

import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type { IResponse, PaginatingResponse, Skill } from '@/types'

const PAGE_SIZE = 24
const SEARCH_DELAY_MS = 300
const SKILLS_CACHE_TTL_MS = 60_000
const SKILLS_CACHE_LIMIT = 40

const skillsRequestCache = new Map<string, { data: PaginatingResponse<Skill>, expiresAt: number }>()

interface SkillsExplorerProps {
  initialCategory?: string
  initialFeatured?: boolean
  initialPage?: number
  initialPlatform?: string
  initialQuery?: string
  initialScenario?: string
  initialSort?: PublicCatalogSort
}

export default function SkillsExplorer({
  initialCategory = '',
  initialFeatured = false,
  initialPage = 1,
  initialPlatform = '',
  initialQuery = '',
  initialScenario = '',
  initialSort = 'latest',
}: SkillsExplorerProps) {
  const [searchInput, setSearchInput] = useState(initialQuery)
  const debouncedSearch = useDebouncedValue(searchInput.trim(), SEARCH_DELAY_MS)
  const [category, setCategory] = useState(initialCategory)
  const [platform, setPlatform] = useState(initialPlatform)
  const [scenario, setScenario] = useState(initialScenario)
  const [featuredOnly, setFeaturedOnly] = useState(initialFeatured)
  const [sort, setSort] = useState<PublicCatalogSort>(initialSort)
  const [page, setPage] = useState(initialPage)
  const [result, setResult] = useState<PaginatingResponse<Skill> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const resultsRef = useRef<HTMLElement>(null)
  const listHref = buildSkillsListHref({
    category,
    featured: featuredOnly,
    page,
    platform,
    q: debouncedSearch,
    scenario,
    sort,
  })

  useEffect(() => {
    const controller = new AbortController()
    const requestParams = {
      pageSize: PAGE_SIZE,
      q: debouncedSearch || undefined,
      category: category || undefined,
      platform: platform || undefined,
      featured: featuredOnly ? true : undefined,
      sort,
      scenario: scenario || undefined,
    }
    // Reset request state when filters change; the effect owns this fetch lifecycle.
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true)
    // eslint-disable-next-line react/set-state-in-effect
    setError(null)

    const loadPage = async () => {
      try {
        let data = await fetchSkills({ ...requestParams, pageIndex: page - 1 }, controller.signal)
        if (controller.signal.aborted)
          return

        const nextTotalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        if (page > nextTotalPages) {
          data = await fetchSkills({ ...requestParams, pageIndex: nextTotalPages - 1 }, controller.signal)
          if (controller.signal.aborted)
            return
          setPage(nextTotalPages)
        }

        setResult(data)
      }
      catch (reason: unknown) {
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return
        setError(reason instanceof Error ? reason.message : 'Skills 加载失败')
      }
      finally {
        if (!controller.signal.aborted)
          setLoading(false)
      }
    }

    void loadPage()

    return () => controller.abort()
  }, [category, debouncedSearch, featuredOnly, page, platform, requestVersion, scenario, sort])

  useEffect(() => {
    if (`${window.location.pathname}${window.location.search}` !== listHref)
      window.history.replaceState(window.history.state, '', listHref)
  }, [listHref])

  const total = result?.total ?? 0
  const list = result?.list ?? []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(debouncedSearch || category || platform || scenario || featuredOnly || sort !== 'latest')

  const resetFilters = () => {
    setSearchInput('')
    setCategory('')
    setPlatform('')
    setScenario('')
    setFeaturedOnly(false)
    setSort('latest')
    setPage(1)
  }

  const changePage = (nextPage: number) => {
    setPage(nextPage)
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const changeSearch = (value: string) => {
    setSearchInput(value)
    setPage(1)
  }

  const selectCategory = (value: string) => {
    setCategory(value)
    setPage(1)
  }

  const selectPlatform = (value: string) => {
    setPlatform(value)
    setPage(1)
  }

  const selectScenario = (value: string) => {
    setScenario(value)
    setPage(1)
  }

  const toggleFeatured = () => {
    setFeaturedOnly(value => !value)
    setPage(1)
  }

  return (
    <div data-catalog-directory="skill" className="catalog-page catalog-page--skill skills-page skills-full-bleed w-full">
      <CatalogMasthead
        title="为 Agent 找到可靠能力"
        channel="skill"
        description="发现可安装的工作流，快速了解用途、适配平台和可信评分。"
      >
        <div className="catalog-ai-search-dock">
          <SearchField
            aria-label="搜索 Skills"
            name="skills-search"
            variant="secondary"
            fullWidth
            value={searchInput}
            onChange={changeSearch}
            className="catalog-ai-companion-search"
          >
            <SearchField.Group className="catalog-search-field">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="搜索名称、用途、领域或作者…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <NavigationAiAssistant scope="skills" />
        </div>
      </CatalogMasthead>

      <section ref={resultsRef} aria-labelledby="skills-catalog-title" id="skills-catalog" className="scroll-mt-24">
        <CatalogDirectoryHeader
          id="skills-catalog-title"
          title="全部 Skills"
          total={total}
        />

        <div className="catalog-filter-dock skills-filter-dock">
          <div className="catalog-shell catalog-filter-inner">
            <div className="catalog-filter-row">
              <span className="catalog-filter-label">分类</span>
              <div aria-label="按分类筛选" role="group" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
                {['', ...SKILL_CATEGORIES].map(value => (
                  <Button
                    key={value || 'all'}
                    aria-pressed={category === value}
                    size="sm"
                    variant="ghost"
                    onPress={() => selectCategory(value)}
                    className={`catalog-filter-option shrink-0 px-2.5 text-[11px] ${category === value ? 'is-active' : ''}`}
                  >
                    {value || '全部'}
                  </Button>
                ))}
              </div>
            </div>
            <CatalogSortControls
              value={sort} onChange={(value) => {
                setSort(value)
                setPage(1)
              }}
            />
            <div className="catalog-filter-row">
              <span className="catalog-filter-label">领域</span>
              <div aria-label="按应用领域筛选" role="group" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
                {['', ...SKILL_SCENARIOS].map(value => (
                  <Button
                    key={value || 'all-scenarios'}
                    aria-pressed={scenario === value}
                    size="sm"
                    variant="ghost"
                    onPress={() => selectScenario(value)}
                    className={`catalog-filter-option shrink-0 px-2.5 text-[11px] ${scenario === value ? 'is-active' : ''}`}
                  >
                    {value || '全部'}
                  </Button>
                ))}
              </div>
            </div>
            <div className="catalog-filter-row">
              <span className="catalog-filter-label">平台</span>
              <div aria-label="按平台筛选" role="group" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
                {['', ...SKILL_PLATFORMS].map(value => (
                  <Button
                    key={value || 'all'}
                    aria-pressed={platform === value}
                    size="sm"
                    variant="ghost"
                    onPress={() => selectPlatform(value)}
                    className={`catalog-filter-option shrink-0 px-2.5 text-[11px] ${platform === value ? 'is-active' : ''}`}
                  >
                    {value || '全部'}
                  </Button>
                ))}
                <Button
                  aria-pressed={featuredOnly}
                  size="sm"
                  variant="ghost"
                  onPress={toggleFeatured}
                  className={`catalog-filter-option ml-auto shrink-0 px-2.5 text-[11px] ${featuredOnly ? 'is-active' : ''}`}
                >
                  <StarFill aria-hidden="true" className="size-3" />
                  仅看精选
                </Button>
              </div>
            </div>
            {loading || hasFilters
              ? (
                  <div aria-live="polite" className="catalog-filter-summary">
                    <span>{loading ? '正在更新…' : '已应用筛选'}</span>
                    {hasFilters ? <button type="button" onClick={resetFilters}>清除筛选</button> : null}
                  </div>
                )
              : null}
          </div>
        </div>

        <div aria-busy={loading} className="catalog-shell catalog-results-region">
          <ReturnTargetRestorer fallbackId="skills-catalog" ready={!loading && !error && result !== null} />
          {error
            ? (
                <Alert status="danger" className="catalog-error-alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Skills 目录暂时无法加载</Alert.Title>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                  <Button size="sm" variant="danger" onPress={() => setRequestVersion(value => value + 1)}>重新加载</Button>
                </Alert>
              )
            : loading && !result
              ? (
                  <div className="catalog-results-grid">
                    {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="catalog-card-skeleton" />)}
                  </div>
                )
              : list.length
                ? (
                    <div className={`catalog-results-grid transition-opacity motion-reduce:transition-none ${loading ? 'opacity-55' : 'opacity-100'}`}>
                      {list.map(skill => <SkillCard key={skill.id} returnTo={listHref} skill={skill} />)}
                    </div>
                  )
                : (
                    <div className="catalog-empty-state">
                      <div className="max-w-sm">
                        <CircleCheckFill aria-hidden="true" className="mx-auto size-8 text-emerald-500" />
                        <h3 className="mt-4 text-lg font-black">{featuredOnly ? '暂时还没有精选 Skill' : '没有匹配的 Skill'}</h3>
                        <p className="mt-2 text-xs leading-5 text-muted">{featuredOnly ? '管理员尚未设置精选内容，可查看全部 Skills。' : '换一个关键词或清除部分筛选，也可以把你熟悉的工作流投稿进来。'}</p>
                        <div className="catalog-empty-actions">
                          <Button size="sm" variant="secondary" onPress={resetFilters}>重置筛选</Button>
                          <CatalogSubmitLink channel="skill" placement="empty" />
                        </div>
                      </div>
                    </div>
                  )}

          {!error ? <CatalogPagination ariaLabel="Skills 目录分页" disabled={loading} page={page} totalPages={totalPages} onPageChange={changePage} /> : null}
        </div>
      </section>

      <CatalogContributionFooter
        title="分享你的 Agent 工作流"
        channel="skill"
        description="提交完整说明和适配平台，通过检查后即可发布。"
      />
    </div>
  )
}

function buildSkillsListHref({
  category,
  featured,
  page,
  platform,
  q,
  scenario,
  sort,
}: {
  category: string
  featured: boolean
  page: number
  platform: string
  q: string
  scenario: string
  sort: PublicCatalogSort
}) {
  const query = new URLSearchParams()
  if (q)
    query.set('q', q)
  if (category)
    query.set('category', category)
  if (platform)
    query.set('platform', platform)
  if (scenario)
    query.set('scenario', scenario)
  if (featured)
    query.set('featured', 'true')
  if (sort !== 'latest')
    query.set('sort', sort)
  if (page > 1)
    query.set('page', String(page))
  const search = query.toString()
  return search ? `/skills?${search}` : '/skills'
}

async function fetchSkills(
  params: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '')
      query.set(key, String(value))
  })

  const cacheKey = query.toString()
  const cached = skillsRequestCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    if (signal?.aborted)
      throw new DOMException('The operation was aborted', 'AbortError')
    return cached.data
  }
  if (cached)
    skillsRequestCache.delete(cacheKey)

  const response = await fetch(`/api/public/skills?${cacheKey}`, { signal })
  const payload = await response.json() as IResponse<PaginatingResponse<Skill>> | PaginatingResponse<Skill>
  if (!response.ok) {
    const message = 'msg' in payload && typeof payload.msg === 'string' ? payload.msg : 'Skills 加载失败'
    throw new Error(message)
  }

  const result = unwrapResponse(payload)
  if (!result || !Array.isArray(result.list))
    throw new Error('Skills 数据格式无效')

  if (skillsRequestCache.size >= SKILLS_CACHE_LIMIT) {
    const oldestKey = skillsRequestCache.keys().next().value
    if (typeof oldestKey === 'string')
      skillsRequestCache.delete(oldestKey)
  }
  skillsRequestCache.set(cacheKey, { data: result, expiresAt: Date.now() + SKILLS_CACHE_TTL_MS })
  return result
}

function unwrapResponse<T>(payload: T | IResponse<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload)
    return (payload as IResponse<T>).data
  return payload as T
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(setDebouncedValue, delayMs, value)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])

  return debouncedValue
}
