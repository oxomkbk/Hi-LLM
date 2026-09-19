export class RangeNotSatisfiableError extends Error {
  readonly status = 416

  constructor(readonly size: number) {
    super('请求的文件范围无效')
  }
}

export function parseSingleRange(value: string | null, size: number) {
  if (!value)
    return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2]))
    throw new RangeNotSatisfiableError(size)

  let start: number
  let end: number
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)
      throw new RangeNotSatisfiableError(size)
    start = Math.max(0, size - suffixLength)
    end = size - 1
  }
  else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start)
    throw new RangeNotSatisfiableError(size)
  return { end: Math.min(end, size - 1), start }
}
