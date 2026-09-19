'use client'
import { ArrowRotateLeft, Magnifier, Plus } from '@gravity-ui/icons'
import {
  Button,
  ListBox,
  SearchField,
  Select,
  Spinner,
} from '@heroui/react'

import ColumnsVisibility from '@/components/ColumnsVisibility'

import { AdminSectionHeader, AdminToolbar } from '../../admin-ui'

import type { CategoryOption, Website } from '@/types'
import type { useOverlayState } from '@heroui/react'
import type { Table } from '@tanstack/react-table'
import type { Dispatch, FC, KeyboardEvent, SetStateAction } from 'react'

interface HeaderContentProps {
  table: Table<Website>
  total: number
  categorysList: CategoryOption[]
  name: string
  setName: Dispatch<SetStateAction<string>>
  categoryId: string
  setCategoryId: Dispatch<SetStateAction<string>>
  loading: boolean
  handleSearch: VoidFunction
  handleReset: VoidFunction
  handleAdd: VoidFunction
  saveModalState: ReturnType<typeof useOverlayState>
}

const HeaderContent: FC<HeaderContentProps> = ({
  table,
  total,
  categorysList = [],
  name,
  setName,
  categoryId,
  setCategoryId,
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
        title="导航网站"
        actions={(
          <>
            <ColumnsVisibility table={table} />
            <Button size="sm" onPress={handleAdd}>
              <Plus />
              新增网站
            </Button>
          </>
        )}
        description="管理网站资料、所属分类、排序和展示状态"
      />
      <AdminToolbar>
        <SearchField
          aria-label="网站名称"
          variant="secondary"
          value={name}
          onChange={setName}
          onKeyDown={handleKeyDown}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="网站名称" className="w-50" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Select
          aria-label="所属分类"
          variant="secondary"
          placeholder="所属分类"
          value={categoryId}
          onChange={id => setCategoryId(id as string)}
          className="w-60"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {categorysList?.map(({ id, name }) => (
                <ListBox.Item key={id} id={id} textValue={name}>
                  {name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
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
          个网站
        </span>
      </AdminToolbar>
    </div>
  )
}
export default HeaderContent
