export function constrainDescription(value: string) {
  const normalized = normalizeDescription(value)
  let characters = Array.from(normalized)
  if (characters.length < 30) {
    const base = normalized.replace(/[，。！？、；：]+$/u, '')
    characters = Array.from(base
      ? `${base}，帮助用户便捷获取相关信息、实用工具与清晰可靠的在线服务体验。`
      : '帮助用户便捷获取相关信息、实用工具与清晰可靠的在线服务体验。')
  }
  if (characters.length <= 40)
    return characters.join('')
  const result = characters.slice(0, 40).join('').replace(/[，、；：]$/, '')
  return /[。！？]$/.test(result) ? result : `${Array.from(result).slice(0, 39).join('')}。`
}

export function descriptionLength(value: string) {
  return Array.from(value).length
}

export function normalizeDescription(value: string) {
  return value
    .replace(/^(?:网站介绍|介绍|描述)\s*[：:]\s*/u, '')
    .replace(/^[“”"']+|[“”"']+$/gu, '')
    .replace(/\s+/g, '')
    .trim()
}
