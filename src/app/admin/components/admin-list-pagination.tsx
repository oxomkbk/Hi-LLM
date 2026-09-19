'use client'

import { Pagination } from '@heroui/react'

import { buildPageItems, pageRange } from '../content/pagination-model'

interface AdminListPaginationProps {
  loading: boolean
  onPageChange: (page: number) => void
  page: number
  pageSize: number
  total: number
}

export default function AdminListPagination({
  loading,
  onPageChange,
  page,
  pageSize,
  total,
}: AdminListPaginationProps) {
  if (total <= 0)
    return null

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const currentPage = Math.min(totalPages, Math.max(1, page))
  const range = pageRange(currentPage, pageSize, total)

  return (
    <Pagination aria-label="列表分页" size="sm" className="admin-list-pagination w-full">
      <Pagination.Summary>
        第
        {' '}
        {range.start}
        –
        {range.end}
        {' '}
        条，共
        {' '}
        {total}
        {' '}
        条
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous isDisabled={currentPage <= 1 || loading} onPress={() => onPageChange(currentPage - 1)}>
            <Pagination.PreviousIcon />
            <span>上一页</span>
          </Pagination.Previous>
        </Pagination.Item>
        {buildPageItems(currentPage, totalPages).map(item => typeof item === 'number'
          ? (
              <Pagination.Item key={item}>
                <Pagination.Link isActive={item === currentPage} isDisabled={loading} onPress={() => onPageChange(item)}>
                  {item}
                </Pagination.Link>
              </Pagination.Item>
            )
          : (
              <Pagination.Item key={item}>
                <Pagination.Ellipsis />
              </Pagination.Item>
            ))}
        <Pagination.Item>
          <Pagination.Next isDisabled={currentPage >= totalPages || loading} onPress={() => onPageChange(currentPage + 1)}>
            <span>下一页</span>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  )
}
