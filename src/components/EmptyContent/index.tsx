import { Tray } from '@gravity-ui/icons'
import { Description } from '@heroui/react'

import type { FC } from 'react'

const EmptyContent: FC = () => {
  return (
    <div className="flex flex-col gap-2 justify-center items-center text-muted py-20">
      <Tray className="size-10" />
      <Description>暂无数据</Description>
    </div>
  )
}
export default EmptyContent
