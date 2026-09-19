'use client'

import { Button, Label, NumberField, Pagination } from '@heroui/react'
import { useState } from 'react'

import { getPaginationTokens, normalizePage } from '@/lib/pagination'

interface CatalogPaginationProps {
  ariaLabel: string
  disabled?: boolean
  onPageChange: (page: number) => void
  page: number
  totalPages: number
}

export default function CatalogPagination({ ariaLabel, disabled = false, onPageChange, page, totalPages }: CatalogPaginationProps) {
  if (totalPages <= 1)
    return null

  return (
    <div className="catalog-pagination-cluster">
      <Pagination aria-label={ariaLabel} size="sm" className="justify-center">
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous isDisabled={page <= 1 || disabled} onPress={() => onPageChange(page - 1)}>
              <Pagination.PreviousIcon />
              <span className="hidden sm:inline">上一页</span>
            </Pagination.Previous>
          </Pagination.Item>
          {getPaginationTokens(page, totalPages).map(token => token.type === 'ellipsis'
            ? <Pagination.Item key={token.key}><Pagination.Ellipsis /></Pagination.Item>
            : (
                <Pagination.Item key={token.key}>
                  <Pagination.Link isActive={token.value === page} isDisabled={disabled} onPress={() => onPageChange(token.value!)}>
                    {token.value}
                  </Pagination.Link>
                </Pagination.Item>
              ))}
          <Pagination.Item>
            <Pagination.Next isDisabled={page >= totalPages || disabled} onPress={() => onPageChange(page + 1)}>
              <span className="hidden sm:inline">下一页</span>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
      <CatalogPageJump
        key={`${page}:${totalPages}`}
        ariaLabel={ariaLabel}
        disabled={disabled}
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  )
}

function CatalogPageJump({ ariaLabel, disabled, onPageChange, page, totalPages }: Required<CatalogPaginationProps>) {
  const [jumpPage, setJumpPage] = useState(page)

  return (
    <form
      aria-label={`${ariaLabel}页码跳转`}
      onSubmit={(event) => {
        event.preventDefault()
        const nextPage = normalizePage(jumpPage, totalPages)
        setJumpPage(nextPage)
        if (nextPage !== page)
          onPageChange(nextPage)
      }}
      className="catalog-page-jump"
    >
      <span>跳至</span>
      <NumberField
        variant="secondary"
        isDisabled={disabled}
        maxValue={totalPages}
        minValue={1}
        value={jumpPage}
        onChange={setJumpPage}
        className="catalog-page-jump-field"
      >
        <Label className="sr-only">输入页码</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <span>
        /
        {' '}
        {totalPages}
        {' '}
        页
      </span>
      <Button type="submit" size="sm" variant="secondary" isDisabled={disabled}>跳转</Button>
    </form>
  )
}
