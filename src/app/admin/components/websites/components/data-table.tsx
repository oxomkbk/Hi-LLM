import { ChevronUp } from '@gravity-ui/icons'
import { cn, Table } from '@heroui/react'
import { flexRender } from '@tanstack/react-table'

import EmptyContent from '@/components/EmptyContent'
import TableLoading from '@/components/TableLoading'

import type { Website } from '@/types'
import type { Table as TableInstance } from '@tanstack/react-table'
import type { FC } from 'react'

interface DataTableProps {
  table: TableInstance<Website>
  loading: boolean
}

const DataTable: FC<DataTableProps> = ({ table, loading = false }) => {
  return (
    <div className="relative">
      <Table className="admin-crud-table admin-websites-table">
        <Table.ScrollContainer>
          <Table.Content aria-label="网站列表">
            <Table.Header>
              {table.getHeaderGroups()[0]!.headers.map((header) => {
                const sortDirection = header.column.getIsSorted()
                return (
                  <Table.Column
                    key={header.id}
                    id={header.id}
                    isRowHeader={header.id === 'name'}
                    allowsSorting={header.column.getCanSort()}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`admin-crud-column admin-crud-column--${header.id}`}
                  >
                    <div title={header.column.getCanSort() ? '对当前页排序' : undefined} className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortDirection && (
                        <ChevronUp
                          className={cn(
                            'size-3 transform transition-transform duration-100 ease-out',
                            sortDirection === 'desc' ? 'rotate-180' : '',
                          )}
                        />
                      )}
                    </div>
                  </Table.Column>
                )
              })}
            </Table.Header>
            <Table.Body renderEmptyState={() => <EmptyContent />}>
              {table.getRowModel().rows.map(row => (
                <Table.Row key={row.id} id={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <Table.Cell key={cell.id} className={`admin-crud-cell admin-crud-cell--${cell.column.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <TableLoading loading={loading} />
    </div>
  )
}
export default DataTable
