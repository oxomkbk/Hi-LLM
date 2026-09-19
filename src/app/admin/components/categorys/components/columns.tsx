'use client'
import { PencilToSquare, TrashBin } from '@gravity-ui/icons'
import { Button, Description } from '@heroui/react'
import { createColumnHelper } from '@tanstack/react-table'

import { formatDate } from '@/lib/utils'

import type { Category } from '@/types'

const columnHelper = createColumnHelper<Category>()

interface ColumnsProps {
  handleEdit: (row: Category) => void
  handleDel: (row: Category) => void
  page: number
  pageSize: number
}

export function getColumns({
  handleEdit,
  handleDel,
  page = 1,
  pageSize = 10,
}: ColumnsProps) {
  return [
    columnHelper.display({
      id: 'index',
      header: '序号',
      cell: ({ row }) => (
        <span className="admin-table-number">
          {(page - 1) * pageSize + row.index + 1}
        </span>
      ),
    }),

    columnHelper.accessor('name', {
      header: '分类名称',
      cell: ({ getValue }) => (
        <strong className="font-medium">
          {getValue()}
        </strong>
      ),
    }),

    columnHelper.display({
      id: 'websites',
      header: '站点个数',
      cell: ({ row }) => (
        <span className="admin-table-number">
          {row.original.websites?.length || 0}
        </span>
      ),
    }),

    columnHelper.accessor('sort', {
      header: '排序',
      cell: ({ getValue }) => (
        <span className="admin-table-number">
          {getValue()}
        </span>
      ),
    }),

    columnHelper.accessor('created_at', {
      header: '创建时间',
      cell: ({ getValue }) => (
        <Description>
          {formatDate(getValue(), 'datetime')}
        </Description>
      ),
    }),

    columnHelper.accessor('updated_at', {
      header: '更新时间',
      cell: ({ getValue }) => (
        <Description>
          {formatDate(getValue(), 'datetime')}
        </Description>
      ),
    }),

    columnHelper.display({
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex items-center justify-center min-w-25">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleEdit(row.original)}
            className="text-xs"
          >
            <PencilToSquare />
            修改
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleDel(row.original)}
            className="text-xs text-danger hover:bg-danger-soft"
          >
            <TrashBin />
            删除
          </Button>
        </div>
      ),
    }),
  ]
}
