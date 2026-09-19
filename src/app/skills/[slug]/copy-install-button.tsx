'use client'

import { Check, Copy } from '@gravity-ui/icons'
import { Button, toast } from '@heroui/react'
import { useEffect, useState } from 'react'

export default function CopyInstallButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied)
      return
    const timer = window.setTimeout(setCopied, 1800, false)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    }
    catch {
      toast.danger('复制失败，请手动选择安装命令')
    }
  }

  return (
    <Button size="sm" variant={copied ? 'secondary' : 'primary'} fullWidth onPress={() => void copy()}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? '已复制安装命令' : '复制安装命令'}
    </Button>
  )
}
