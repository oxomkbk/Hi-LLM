'use client'
import { ArrowRotateLeft, Magnifier, Plus } from '@gravity-ui/icons'
import { Button, SearchField, Spinner } from '@heroui/react'

import ColumnsVisibility from '@/components/ColumnsVisibility'

import { AdminSectionHeader, AdminToolbar } from '../../admin-ui'

import type { Category } from '@/types'
import type { useOverlayState } from '@heroui/react'
import type { Table } from '@tanstack/react-table'
import type { Dispatch, FC, KeyboardEvent, SetStateAction } from 'react'

interface HeaderContentProps {
  table: Table<Category>
  total: number
  name: string
  setName: Dispatch<SetStateAction<string>>
  loading: boolean
  handleSearch: VoidFunction
  handleReset: VoidFunction
  handleAdd: VoidFunction
  saveModalState: ReturnType<typeof useOverlayState>
}

const HeaderContent: FC<HeaderContentProps> = ({
  table,
  total,
  name,
  setName,
  loading = false,
  handleSearch,
  handleReset,
  handleAdd,
}) => {
  // 回车事件
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }
  return (
    <div>
      <AdminSectionHeader
        title="网站分类"
        actions={(
          <>
            <ColumnsVisibility table={table} />
            <Button size="sm" onPress={handleAdd}>
              <Plus />
              新增分类
            </Button>
          </>
        )}
        description="维护导航页的分类、排序和显示状态"
      />
      <AdminToolbar>
        <SearchField
          aria-label="分类名称"
          variant="secondary"
          value={name}
          onChange={setName}
          onKeyDown={handleKeyDown}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="分类名称" className="w-50" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Button size="sm" isPending={loading} onPress={handleSearch}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : <Magnifier />}
              查询
            </>
          )}
        </Button>
        <Button size="sm" variant="secondary" isDisabled={loading} onPress={handleReset}>
          <ArrowRotateLeft />
          重置
        </Button>
        <span className="admin-result-count">
          共
          {total}
          {' '}
          个分类
        </span>
      </AdminToolbar>
    </div>
  )
}
export default HeaderContent
