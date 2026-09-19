'use client'

import { useIsHydrated } from '@heroui/react'

import { useSession } from '@/lib/auth/client'

export function useAuthUser() {
  const hydrated = useIsHydrated()
  const { data, error, isPending } = useSession()

  return {
    error,
    loading: !hydrated || isPending,
    user: data?.user ?? null,
  }
}
