'use client'

import { NodesRight, StarFill } from '@gravity-ui/icons'
import { Alert, Button, SearchField, Skeleton } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import CatalogContributionFooter from '@/components/catalog/catalog-contribution-footer'
import CatalogDirectoryHeader from '@/components/catalog/catalog-directory-header'
import CatalogMasthead from '@/components/catalog/catalog-masthead'
import CatalogPagination from '@/components/catalog/catalog-pagination'
import CatalogSortControls from '@/components/catalog/catalog-sort-controls'
import CatalogSubmitLink from '@/components/catalog/catalog-submit-link'
import McpCard from '@/components/McpCard'
import ReturnTargetRestorer from '@/components/navigation/return-target-restorer'
import NavigationAiAssistant from '@/components/NavigationAiAssistant'
import { MCP_CATEGORIES, MCP_CLIENTS, MCP_TRANSPORTS } from '@/lib/mcps'

import { buildMcpListHref } from './filter-model'

import type { PublicCatalogSort } from '@/lib/catalog-sort'
import type { IResponse, Mcp, PaginatingResponse } from '@/types'

const PAGE_SIZE = 24
const CACHE = new Map<string, { data: PaginatingResponse<Mcp>, expires: number }>()

interface ExplorerProps {
  initialCategory: string
  initialClient: string
  initialFeatured: boolean
  initialPage: number
  initialQuery: string
  initialSort: PublicCatalogSort
  initialTransport: string
}

export default function McpExplorer(props: ExplorerProps) {
  const [searchInput, setSearchInput] = useState(props.initialQuery)
  const query = useDebounced(searchInput.trim(), 280)
  const [category, setCategory] = useState(props.initialCategory)
  const [client, setClient] = useState(props.initialClient)
  const [transport, setTransport] = useState(props.initialTransport)
  const [featuredOnly, setFeaturedOnly] = useState(props.initialFeatured)
  const [sort, setSort] = useState<PublicCatalogSort>(props.initialSort)
  const [page, setPage] = useState(props.initialPage)
  const [result, setResult] = useState<PaginatingResponse<Mcp> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const resultsRef = useRef<HTMLElement>(null)
  const listHref = buildMcpListHref({ category, client, featured: featuredOnly, page, q: query, sort, transport })

  useEffect(() => {
    const controller = new AbortController()
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true)
    // eslint-disable-next-line react/set-state-in-effect
    setError(null)
    fetchMcps({ category, client, featured: featuredOnly ? true : undefined, pageIndex: page - 1, pageSize: PAGE_SIZE, q: query, sort, transport }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted)
          return

        const nextPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        if (page > nextPages) {
          setPage(nextPages)
          return
        }

        setResult(data)
      })
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError'))
          setError(reason instanceof Error ? reason.message : 'MCP 目录加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted)
          setLoading(false)
      })
    return () => controller.abort()
  }, [category, client, featuredOnly, page, query, retry, sort, transport])

  useEffect(() => {
    if (`${window.location.pathname}${window.location.search}` !== listHref)
      window.history.replaceState(window.history.state, '', listHref)
  }, [listHref])

  const list = result?.list ?? []
  const total = result?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(query || category || client || transport || featuredOnly || sort !== 'latest')
  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value)
    setPage(1)
  }
  const reset = () => {
    setSearchInput('')
    setCategory('')
    setClient('')
    setTransport('')
    setFeaturedOnly(false)
    setSort('latest')
    setPage(1)
  }
  const changeSearch = (value: string) => {
    setSearchInput(value)
    setPage(1)
  }
  const changePage = (nextPage: number) => {
    setPage(Math.min(pages, Math.max(1, nextPage)))
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div data-catalog-directory="mcp" className="catalog-page catalog-page--mcp mcp-page mcp-full-bleed w-full">
      <CatalogMasthead
        title="为 AI 连接工具和数据"
        channel="mcp"
        description="发现可接入的 MCP 服务，快速了解连接方式和安全状态。"
      >
        <div className="catalog-ai-search-dock">
          <SearchField
            aria-label="搜索 MCP Server"
            name="mcp-search"
            variant="secondary"
            fullWidth
            value={searchInput}
            onChange={changeSearch}
            className="catalog-ai-companion-search"
          >
            <SearchField.Group className="catalog-search-field">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="搜索 Server、能力或发布者…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <NavigationAiAssistant scope="mcp" />
        </div>
      </CatalogMasthead>

      <section ref={resultsRef} aria-labelledby="mcp-directory-title" id="mcp-directory" className="scroll-mt-24">
        <CatalogDirectoryHeader
          id="mcp-directory-title"
          title="全部 MCP"
          total={total}
        />

        <div className="catalog-filter-dock">
          <div className="catalog-shell catalog-filter-inner">
            <div className="catalog-filter-panel min-w-0">
              <FilterRow items={MCP_CATEGORIES} label="场景" value={category} onChange={value => changeFilter(setCategory, value)} />
              <FilterRow items={MCP_TRANSPORTS} label="连接" value={transport} onChange={value => changeFilter(setTransport, value)} />
              <FilterRow items={MCP_CLIENTS} label="客户端" value={client} onChange={value => changeFilter(setClient, value)} />
              <div className="catalog-filter-row">
                <span className="catalog-filter-label">精选</span>
                <div aria-label="按精选状态筛选" role="group" className="flex min-w-0 flex-1 gap-1.5">
                  <Button
                    aria-pressed={!featuredOnly}
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setFeaturedOnly(false)
                      setPage(1)
                    }}
                    className={`catalog-filter-option px-2.5 text-[11px] ${!featuredOnly ? 'is-active' : ''}`}
                  >
                    全部
                  </Button>
                  <Button
                    aria-pressed={featuredOnly}
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setFeaturedOnly(true)
                      setPage(1)
                    }}
                    className={`catalog-filter-option px-2.5 text-[11px] ${featuredOnly ? 'is-active' : ''}`}
                  >
                    <StarFill aria-hidden="true" className="size-3" />
                    仅看精选
                  </Button>
                </div>
              </div>
              <CatalogSortControls
                value={sort} onChange={(value) => {
                  setSort(value)
                  setPage(1)
                }}
              />
              {loading || hasFilters
                ? (
                    <div aria-live="polite" className="catalog-filter-summary">
                      <span>{loading ? '正在更新…' : '已应用筛选'}</span>
                      {hasFilters ? <button type="button" onClick={reset}>清除筛选</button> : null}
                    </div>
                  )
                : null}
            </div>
          </div>
        </div>

        <div aria-busy={loading} className="catalog-shell catalog-results-region">
          <ReturnTargetRestorer fallbackId="mcp-directory" ready={!loading && !error && result !== null} />
          {error
            ? (
                <Alert status="danger" className="catalog-error-alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>MCP 目录暂时无法加载</Alert.Title>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                  <Button size="sm" variant="danger" onPress={() => setRetry(value => value + 1)}>重新加载</Button>
                </Alert>
              )
            : loading && !result
              ? (
                  <div className="catalog-results-grid">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="catalog-card-skeleton" />)}</div>
                )
              : list.length
                ? (
                    <div className={`catalog-results-grid transition-opacity motion-reduce:transition-none ${loading ? 'opacity-55' : 'opacity-100'}`}>{list.map((mcp, index) => <McpCard key={mcp.id} index={index} mcp={mcp} returnTo={listHref} />)}</div>
                  )
                : (
                    <div className="catalog-empty-state">
                      <div className="max-w-md">
                        <NodesRight className="mx-auto size-8 text-[#0b6ef3]" />
                        <h3 className="mt-4 text-lg font-black">{featuredOnly ? '暂时还没有精选 MCP' : '没有匹配的 MCP'}</h3>
                        <p className="mt-2 text-xs leading-5 text-muted">{featuredOnly ? '管理员尚未设置精选内容，可查看全部 MCP。' : '调整筛选条件，或提交这个类别的 MCP 服务。'}</p>
                        <div className="catalog-empty-actions">
                          <Button size="sm" variant="secondary" onPress={reset}>重置筛选</Button>
                          <CatalogSubmitLink channel="mcp" placement="empty" />
                        </div>
                      </div>
                    </div>
                  )}

          <CatalogPagination ariaLabel="MCP 目录分页" disabled={loading} page={page} totalPages={pages} onPageChange={changePage} />
        </div>
      </section>

      <CatalogContributionFooter
        title="分享你的 MCP 服务"
        channel="mcp"
        description="提交连接方式和配置示例，通过检查后即可发布。"
      />
    </div>
  )
}

async function fetchMcps(params: Record<string, string | number | boolean | undefined>, signal: AbortSignal) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '')
      search.set(key, String(value))
  })
  const key = search.toString()
  const cached = CACHE.get(key)
  if (cached && cached.expires > Date.now())
    return cached.data
  const response = await fetch(`/api/public/mcps?${search}`, { signal })
  const payload = await response.json() as IResponse<PaginatingResponse<Mcp>>
  if (!response.ok || payload.code !== 200)
    throw new Error(payload.msg || 'MCP 目录加载失败')
  CACHE.set(key, { data: payload.data, expires: Date.now() + 60_000 })
  if (CACHE.size > 32)
    CACHE.delete(CACHE.keys().next().value!)
  return payload.data
}

function FilterRow({ items, label, onChange, value }: { items: readonly string[], label: string, onChange: (value: string) => void, value: string }) {
  return (
    <div className="catalog-filter-row">
      <span className="catalog-filter-label">{label}</span>
      <div aria-label={`按${label}筛选`} role="group" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
        {['', ...items].map(item => (
          <Button
            key={item || 'all'}
            aria-pressed={value === item}
            size="sm"
            variant="ghost"
            onPress={() => onChange(item)}
            className={`catalog-filter-option shrink-0 px-2.5 text-[11px] ${value === item ? 'is-active' : ''}`}
          >
            {item || '全部'}
          </Button>
        ))}
      </div>
    </div>
  )
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(setDebounced, delay, value)
    return () => window.clearTimeout(timer)
  }, [delay, value])
  return debounced
}
