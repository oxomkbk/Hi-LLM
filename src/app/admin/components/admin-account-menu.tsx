'use client'

import { ArrowRightFromSquare, Person, Persons } from '@gravity-ui/icons'
import {
  AlertDialog,
  Avatar,
  Button,
  Dropdown,
  Label,
  Separator,
  Spinner,
  toast,
  useOverlayState,
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { signOut } from '@/lib/auth/client'

import type { Key } from 'react'

export interface AdminAccountUser {
  avatarUrl: string | null
  email: string
  name: string
}

export default function AdminAccountMenu({ user }: { user: AdminAccountUser }) {
  const router = useRouter()
  const alertState = useOverlayState()
  const [logoutLoading, setLogoutLoading] = useState(false)

  const handleMenuAction = (key: Key) => {
    if (key === 'users') {
      router.push('/admin/users')
      return
    }
    if (key === 'logout') {
      alertState.open()
    }
  }

  const handleLogout = async () => {
    setLogoutLoading(true)

    try {
      const { error } = await signOut()

      if (error) {
        throw error
      }

      alertState.close()
      router.replace('/login')
      router.refresh()
    }
    catch (error) {
      toast.danger('退出登录失败', {
        description: error instanceof Error ? error.message : '请稍后重试',
        timeout: 3000,
      })
    }
    finally {
      setLogoutLoading(false)
    }
  }

  return (
    <>
      <Dropdown>
        <Button
          aria-label="打开管理员账户菜单"
          variant="ghost"
          className="h-9 min-w-0 gap-2 rounded-lg px-1.5 hover:bg-surface-secondary sm:pr-2.5"
        >
          <span className="relative shrink-0">
            <Avatar size="sm">
              {user.avatarUrl ? <Avatar.Image alt={user.name} src={user.avatarUrl} /> : null}
              <Avatar.Fallback><Person className="size-4" /></Avatar.Fallback>
            </Avatar>
            <span className="absolute -bottom-px -right-px size-2 rounded-full border border-background bg-success" />
          </span>
          <span className="hidden max-w-28 truncate text-xs font-medium text-foreground md:block">
            {user.name}
          </span>
        </Button>
        <Dropdown.Popover placement="bottom end" className="min-w-60">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <Separator />
          <Dropdown.Menu aria-label="管理员账户操作" onAction={handleMenuAction}>
            <Dropdown.Item id="users" textValue="用户管理">
              <Persons className="size-4 shrink-0" />
              <Label>用户管理</Label>
            </Dropdown.Item>
            <Dropdown.Item id="logout" variant="danger" textValue="退出登录">
              <ArrowRightFromSquare className="size-4 shrink-0 text-danger" />
              <Label>退出登录</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <AlertDialog.Backdrop isDismissable={!logoutLoading} isKeyboardDismissDisabled={logoutLoading} isOpen={alertState.isOpen} onOpenChange={alertState.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-100">
            <AlertDialog.CloseTrigger aria-label="关闭退出确认" onPress={alertState.close} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>退出管理后台</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              确定退出当前账号吗？退出后需要重新登录才能继续管理内容。
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" slot="close" onPress={alertState.close}>取消</Button>
              <Button variant="danger" isPending={logoutLoading} onPress={handleLogout}>
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : <ArrowRightFromSquare className="size-4" />}
                    {isPending ? '正在退出...' : '确认退出'}
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  )
}
