'use client'

import { Link as LinkIcon } from '@gravity-ui/icons'
import { Button, toast } from '@heroui/react'

interface ProfileShareButtonProps {
  canonicalPath: string
  name: string
}

export function ProfileShareButton({ canonicalPath, name }: ProfileShareButtonProps) {
  const shareProfile = async () => {
    const url = new URL(canonicalPath, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ text: `查看 ${name} 的公开创作者主页`, title: `${name} | 社区创作者`, url })
        return
      }
      catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success('主页链接已复制')
    }
    catch {
      toast.danger('暂时无法复制主页链接')
    }
  }

  return (
    <Button size="sm" variant="tertiary" onPress={shareProfile}>
      <LinkIcon aria-hidden="true" />
      分享主页
    </Button>
  )
}
