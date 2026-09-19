import type { WebsiteExtractionIcon } from '@/types'

export function extractionIconToFile(icon: WebsiteExtractionIcon) {
  const separator = icon.dataUrl.indexOf(',')
  if (separator < 0)
    throw new Error('提取的图标数据无效')
  const binary = atob(icon.dataUrl.slice(separator + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index)
  return new File([bytes], icon.filename, { type: icon.mimeType })
}
