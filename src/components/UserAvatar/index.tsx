import { useRouter } from '@bprogress/next/app'
import { Person } from '@gravity-ui/icons'
import { Button, Spinner, Tooltip } from '@heroui/react'

import UserMenu from '@/components/UserMenu'
import { useAuthUser } from '@/hooks/use-auth-user'

import type { FC } from 'react'

const UserAvatar: FC = () => {
  const router = useRouter()
  // 获取登录用户信息
  const { user, loading } = useAuthUser()

  return loading
    ? (
        <Spinner size="sm" />
      )
    : user
      ? (
          <UserMenu user={user} />
        )
      : (
          <Tooltip>
            <Button size="sm" variant="ghost" isIconOnly onPress={() => router.push('/login')}>
              <Person />
            </Button>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              登录
            </Tooltip.Content>
          </Tooltip>
        )
}
export default UserAvatar
