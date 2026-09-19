const FILE_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const FILE_TOKEN_PATTERN = new RegExp(`^file:(${FILE_ID_PATTERN})$`, 'i')
const FILE_URL_PATTERN = new RegExp(`^/api/files/(${FILE_ID_PATTERN})$`, 'i')

/** Resolve only the URL shapes that are safe to render as catalog imagery. */
export function catalogIconSource(value: string | null | undefined) {
  const input = value?.trim()
  if (!input)
    return null

  const internal = normalizeCatalogFileReference(input)
  if (internal)
    return `/api/files/${internal.slice(5)}`

  try {
    const url = new URL(input)
    return url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}

/** Keep uploaded icons as storage-independent file tokens in persisted content. */
export function normalizeCatalogFileReference(value: string) {
  const input = value.trim()
  const match = FILE_TOKEN_PATTERN.exec(input) ?? FILE_URL_PATTERN.exec(input)
  return match?.[1] ? `file:${match[1].toLowerCase()}` : null
}
