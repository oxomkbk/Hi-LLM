export type AdminListParamValue = boolean | number | string | null | undefined
export type AdminSearchParam = string | string[] | null | undefined

export function buildAdminListHref(
  pathname: string,
  values: Readonly<Record<string, AdminListParamValue>>,
  defaults: Readonly<Record<string, AdminListParamValue>> = {},
) {
  const params = new URLSearchParams()

  for (const key of Object.keys(values).sort()) {
    const value = values[key]
    if (value === null || value === undefined || value === '' || Object.is(value, defaults[key]))
      continue
    params.set(key, String(value))
  }

  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function firstAdminParam(value: AdminSearchParam) {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

export function lastAdminPage(total: number, pageSize: number) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1
  return Math.max(1, Math.ceil(safeTotal / safePageSize))
}

export function normalizeAdminPage(page: number, total: number, pageSize: number) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
  return Math.min(safePage, lastAdminPage(total, pageSize))
}

export function readAdminEnum<const T extends string>(
  value: AdminSearchParam,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = firstAdminParam(value)
  return candidate && allowed.includes(candidate as T) ? candidate as T : fallback
}

export function readAdminPage(value: AdminSearchParam, maxPage: number) {
  const parsed = Number(firstAdminParam(value))
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maxPage ? parsed : 1
}

export function readAdminQuery(value: AdminSearchParam, maxLength: number) {
  return (firstAdminParam(value) ?? '').trim().slice(0, Math.max(0, maxLength))
}

export function shouldApplyAdminResponse(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId
}
