'use client'

import { toast } from '@heroui/react'
import { useCallback, useReducer, useRef } from 'react'

import { request } from '@/lib/request'

import {
  createSourceCheckState,
  reduceSourceCheckState,
  sourceCheckKey,
} from './source-check-model'

import type {
  SecuritySourceCheckResult,
  SecuritySourceCheckSubjectType,
} from '@/lib/ai-security/source-check-contract'

export function useSourceChecks() {
  const [state, dispatch] = useReducer(reduceSourceCheckState, undefined, createSourceCheckState)
  const pendingRef = useRef(new Set<string>())

  const check = useCallback(async (input: {
    subjectId: string
    subjectType: SecuritySourceCheckSubjectType
  }) => {
    const key = sourceCheckKey(input.subjectType, input.subjectId)
    if (pendingRef.current.has(key))
      return null
    pendingRef.current.add(key)
    dispatch({ key, type: 'start' })
    try {
      const response = await request<SecuritySourceCheckResult>('/admin/security-source-checks', {
        body: JSON.stringify(input),
        method: 'POST',
      })
      dispatch({ key, result: response.data, type: 'succeed' })
      toast.success('来源链路正常', {
        description: `${response.data.projectPath} · ${response.data.sourceRevision.slice(0, 7)} · ${response.data.fileCount} 个文件`,
      })
      return response.data
    }
    catch {
      dispatch({ key, type: 'fail' })
      return null
    }
    finally {
      pendingRef.current.delete(key)
    }
  }, [])

  const isChecking = useCallback((subjectType: SecuritySourceCheckSubjectType, subjectId: string) => (
    state.pending.has(sourceCheckKey(subjectType, subjectId))
  ), [state.pending])

  const resultFor = useCallback((subjectType: SecuritySourceCheckSubjectType, subjectId: string) => (
    state.results[sourceCheckKey(subjectType, subjectId)] ?? null
  ), [state.results])

  return { check, isChecking, resultFor }
}
