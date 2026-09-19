'use client'

import { Button } from '@heroui/react'

import type { PublicCatalogSort } from '@/lib/catalog-sort'

export default function CatalogSortControls({ onChange, value }: { onChange: (value: PublicCatalogSort) => void, value: PublicCatalogSort }) {
  return (
    <div className="catalog-filter-row">
      <span className="catalog-filter-label">排序</span>
      <div aria-label="目录排序" role="group" className="flex min-w-0 flex-1 gap-1.5">
        <Button aria-pressed={value === 'latest'} size="sm" variant="ghost" onPress={() => onChange('latest')} className={`catalog-filter-option px-2.5 text-[11px] ${value === 'latest' ? 'is-active' : ''}`}>最新发布</Button>
        <Button aria-pressed={value === 'recommended'} size="sm" variant="ghost" onPress={() => onChange('recommended')} className={`catalog-filter-option px-2.5 text-[11px] ${value === 'recommended' ? 'is-active' : ''}`}>综合推荐</Button>
      </div>
    </div>
  )
}
