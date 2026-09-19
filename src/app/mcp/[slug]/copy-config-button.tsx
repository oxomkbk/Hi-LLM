'use client'

import { Check, Copy } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useState } from 'react'

export default function CopyConfigButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(setCopied, 1800, false)
    }
    catch {
      setCopied(false)
    }
  }
  return (
    <Button size="sm" variant="ghost" onPress={copy} className="rounded-full text-white hover:bg-white/10">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? '已复制' : '复制配置'}
    </Button>
  )
}
