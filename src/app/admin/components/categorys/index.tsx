'use client'
import { CircleCheckFill, CircleXmarkFill } from '@gravity-ui/icons'
import { toast, useOverlayState } from '@heroui/react'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import DataTablePagination from '@/components/DataTablePagination'
import useRequest from '@/hooks/use-request'
import { normalizeAdminPage } from '@/lib/admin/list-state'
import { get, RESPONSE } from '@/lib/utils'

import { getColumns } from './components/columns'
import DataTable from './components/data-table'
import DeleteDialog from './components/delete-dialog'
import HeaderContent from './components/header-content'
import SaveModal from './components/save-modal'

import type { Category, PaginatingResponse } from '@/types'
import type { PaginationState, SortingState, VisibilityState } from '@tanstack/react-table'
import type { FC } from 'react'

const Categorys: FC = () => {
  // 搜索参数
  const [name, setName] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const searchParams = useMemo(() => ({ name, ...pagination }), [name, pagination])
  // 排序
  const [sorting, setSorting] = useState<SortingState>([])
  // 受控列
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    updated_at: false,
  })
  // 保存弹窗
  const saveModalState = useOverlayState()
  // 删除弹窗
  const delDialogState = useOverlayState()
  // 编辑数据
  const [editData, setEditData] = useState<Category | null>(null)

  // 请求分类列表
  const { data, loading, run } = useRequest<PaginatingResponse<Category>>('/categorys', {
    manual: true,
    params: searchParams,
  })
  const total = useMemo(() => data?.total ?? 0, [data])
  const list = useMemo(() => data?.list ?? [], [data])
  const searchParamsRef = useRef(searchParams)

  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  // 发起请求
  const handleSearch = () => {
    if (pagination.pageIndex !== 0)
      setPagination(current => ({ ...current, pageIndex: 0 }))
    else
      void run(searchParams).catch(() => {})
  }

  // 重置
  const handleReset = () => {
    setName('')
    setPagination({ pageIndex: 0, pageSize: 10 })
    void run({
      name: '',
      pageIndex: 0,
      pageSize: 10,
    }).catch(() => {})
  }

  // 编辑回调
  const handleEdit = useCallback((row: Category) => {
    setEditData(row)
    saveModalState.open()
  }, [saveModalState])

  // 新增回调
  const handleAdd = useCallback(() => {
    setEditData(null)
    saveModalState.open()
  }, [saveModalState])

  // 删除分类
  const { loading: delLoading, run: fetchDelCategory } = useRequest('/categorys', {
    method: 'DELETE',
    manual: true,
    onSuccess: ({ code }) => {
      if (code === RESPONSE.SUCCESS) {
        delDialogState.close()
        toast.success('删除成功', {
          timeout: 2000,
          indicator: <CircleCheckFill />,
        })
        const nextIndex = normalizeAdminPage(pagination.pageIndex + 1, total - 1, pagination.pageSize) - 1
        if (nextIndex !== pagination.pageIndex)
          setPagination(current => ({ ...current, pageIndex: nextIndex }))
        else
          void run(searchParams).catch(() => {})
      }
    },
  })

  // 删除回调
  const handleDel = useCallback((row: Category) => {
    if (row?.websites?.length) {
      toast.danger('该分类下存在关联网站，无法直接删除.', {
        indicator: <CircleXmarkFill />,
        timeout: 3000,
      })
      return
    }
    setEditData(row)
    delDialogState.open()
  }, [delDialogState])

  // 确认删除回调
  const handleDelConfirm = () => {
    if (editData?.id) {
      void fetchDelCategory(editData.id).catch(() => {})
    }
  }

  // 列配置项
  const columns = useMemo(
    () => getColumns({ handleEdit, handleDel, page: get(data, 'page', 0), pageSize: get(data, 'pageSize', 0) }),
    [handleEdit, handleDel, data],
  )

  // 表格实例
  const table = useReactTable({
    data: list,
    columns,
    pageCount: Math.ceil((total || 0) / searchParams.pageSize),
    getRowId: (row: Category) => row.id,
    state: {
      pagination,
      sorting,
      columnVisibility,
    },
    onPaginationChange: setPagination,
    manualPagination: true,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
  })

  useEffect(() => {
    void run(searchParamsRef.current).catch(() => {})
  }, [run, pagination.pageIndex, pagination.pageSize])
  return (
    <>
      <section className="admin-data-view">
        <HeaderContent
          name={name}
          handleAdd={handleAdd}
          handleReset={handleReset}
          handleSearch={handleSearch}
          loading={loading}
          saveModalState={saveModalState}
          setName={setName}
          table={table}
          total={total}
        />
        <div className="border-y border-border py-3">
          <DataTable loading={loading} table={table} />
        </div>
        <div className="pt-3">
          <DataTablePagination table={table} total={total || 0} />
        </div>
      </section>
      {/* 保存弹窗 */}
      <SaveModal handleRefresh={handleSearch} initialValues={editData} state={saveModalState} onClose={() => setEditData(null)} />
      {/* 删除弹窗 */}
      <DeleteDialog handleDelConfirm={handleDelConfirm} loading={delLoading} state={delDialogState} onClose={() => setEditData(null)} />
    </>
  )
}
export default Categorys
