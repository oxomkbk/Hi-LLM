'use client'

import { Heart, HeartFill } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'

import { request } from '@/lib/request'

import styles from '../works.module.css'

export default function WorkEngagement({ canLike, initialCount, initialLiked, loginHref, workId }: {
  canLike: boolean
  initialCount: number
  initialLiked: boolean
  loginHref: string
  workId: string
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [likeCount, setLikeCount] = useState(initialCount)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void request(`/wonderland/works/${workId}/view`, { method: 'POST' }).catch(() => undefined)
  }, [workId])

  const toggle = async () => {
    if (!canLike) {
      window.location.assign(loginHref)
      return
    }
    if (pending)
      return
    setPending(true)
    try {
      const result = await request<{ likeCount: number, liked: boolean }>(`/wonderland/works/${workId}/like`, { method: 'POST' })
      setLiked(result.data.liked)
      setLikeCount(result.data.likeCount)
    }
    finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.engagement}>
      <button aria-pressed={liked} type="button" disabled={pending} onClick={() => void toggle()} className={`${styles.likeButton} ${liked ? styles.liked : ''}`}>
        {liked ? <HeartFill aria-hidden="true" /> : <Heart aria-hidden="true" />}
        {pending ? '正在更新' : liked ? `已喜欢 · ${likeCount}` : `喜欢这个作品 · ${likeCount}`}
      </button>
    </div>
  )
}
