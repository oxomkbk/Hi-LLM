import { Spinner } from '@heroui/react'

import type { FC } from 'react'

interface TableLoadingProps {
  loading: boolean
}

const TableLoading: FC<TableLoadingProps> = ({ loading }) => {
  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[1px] pointer-events-auto">
        <Spinner />
      </div>
    )
  }
  return null
}
export default TableLoading
