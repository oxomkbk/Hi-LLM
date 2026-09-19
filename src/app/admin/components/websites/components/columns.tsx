'use client'

import { PencilToSquare, TrashBin } from '@gravity-ui/icons'
import {
  Button,
  Chip,
  Description,
  Link,
  Tooltip,
} from '@heroui/react'
import { createColumnHelper } from '@tanstack/react-table'
import Image from 'next/image'

import { formatDate, generateLogoUrl } from '@/lib/utils'

import type { Website } from '@/types'

const columnHelper = createColumnHelper<Website>()

interface ColumnsProps {
  handleEdit: (row: Website) => void
  handleDel: (row: Website) => void
  page: number
  pageSize: number
}

export function getColumns({
  handleEdit,
  handleDel,
  page = 1,
  pageSize = 10,
}: ColumnsProps) {
  const booleanColumns = [
    { key: 'pinned', header: '置顶' },
    { key: 'vpn', header: 'VPN' },
    { key: 'recommend', header: '推荐' },
    { key: 'commonlyUsed', header: '常用' },
  ] as const

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
      header: '网站名称',
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="admin-website-identity">
            <span className="admin-website-logo">
              {row.logo ? <Image alt="" height={32} src={generateLogoUrl(row.logo)} width={32} className="object-contain" /> : row.name.slice(0, 1)}
            </span>
            <div>
              <Link href={row.url} rel="noopener noreferrer" target="_blank">
                {info.getValue()}
                <Link.Icon />
              </Link>
              <span title={row.url}>{row.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
            </div>
          </div>
        )
      },
    }),

    columnHelper.accessor('desc', {
      header: '网站描述',
      cell: (info) => {
        const val = info.getValue()

        if (!val)
          return '--'

        return (
          <Tooltip delay={0}>
            <Tooltip.Trigger aria-label="Description">
              <span className="truncate">
                {val.length > 15 ? `${val.slice(0, 15)}...` : val}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              <p>{val}</p>
            </Tooltip.Content>
          </Tooltip>
        )
      },
    }),

    columnHelper.accessor('logo', {
      header: 'Logo',
      cell: (info) => {
        const url = info.getValue()
        const row = info.row.original

        if (!url)
          return '--'

        return (
          <div className="flex justify-center size-8 relative">
            <Image
              alt={row.name}
              fill
              src={generateLogoUrl(url)}
              className="object-contain rounded-lg"
            />
          </div>
        )
      },
    }),

    columnHelper.accessor('tags', {
      header: '标签',
      cell: (info) => {
        const tags = info.getValue()

        if (!tags?.length)
          return '--'

        return (
          <div className="flex flex-wrap items-center gap-1 min-w-40 max-w-64">
            {tags.map(tag => (
              <Chip key={tag} size="sm" variant="soft">{tag}</Chip>
            ))}
          </div>
        )
      },
    }),

    columnHelper.display({
      id: 'category',
      header: '所属分类',
      cell: ({ row }) => {
        const categories = row.original.categories?.length
          ? row.original.categories
          : [row.original.category]
        const visibleCategories = categories.slice(0, 1)
        return (
          <div title={categories.map(category => category.name).join('、')} className="flex min-w-32 max-w-64 flex-wrap gap-1">
            {visibleCategories.map(category => (
              <Chip key={category.id} size="sm" variant="soft">
                {category.name}
              </Chip>
            ))}
            {categories.length > visibleCategories.length
              ? <Chip color="accent" size="sm" variant="soft">{`+${categories.length - visibleCategories.length}`}</Chip>
              : null}
          </div>
        )
      },
    }),

    columnHelper.accessor('visitCount', {
      header: '访问次数',
      cell: info => (
        <span className="admin-table-number">
          {info.getValue()}
        </span>
      ),
    }),

    columnHelper.accessor('sort', {
      header: '排序',
      cell: info => (
        <span className="admin-table-number">
          {info.getValue()}
        </span>
      ),
    }),

    ...booleanColumns.map(({ key, header }) =>
      columnHelper.accessor(key, {
        header,
        cell: info => (
          <span data-enabled={info.getValue()} className="admin-boolean-status">
            {info.getValue() ? '已开启' : '未开启'}
          </span>
        ),
      }),
    ),

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
