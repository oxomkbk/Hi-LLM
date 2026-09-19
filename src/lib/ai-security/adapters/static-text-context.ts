export function findActionableTextIndex(content: string, pattern: RegExp) {
  let offset = 0
  for (const line of content.split('\n')) {
    pattern.lastIndex = 0
    const match = pattern.exec(line)
    if (match?.index !== undefined && !isSafetyProhibition(line, match.index))
      return offset + match.index
    offset += line.length + 1
  }
  return -1
}

export function findDirectiveTextIndex(content: string, pattern: RegExp) {
  let offset = 0
  for (const line of content.split('\n')) {
    pattern.lastIndex = 0
    const match = pattern.exec(line)
    if (match?.index !== undefined && isActionDirective(line, match.index))
      return offset + match.index
    offset += line.length + 1
  }
  return -1
}

export function isActionDirective(line: string, actionIndex: number) {
  if (isSafetyProhibition(line, actionIndex))
    return false

  const prefix = currentClausePrefix(line, actionIndex)
  const plain = prefix
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s+|\$\s*)?/, '')
    .replace(/[`*_~]+/g, '')
    .trim()

  if (!plain)
    return true

  if (/^(?:please|then|next|finally|(?:you|the\s+(?:agent|skill))\s+(?:must|should|need\s+to)|must|should|need\s+to|请|然后|接着|必须|务必|应当|需要)$/i.test(plain))
    return true

  return /^(?:please\s+|then\s+|next\s+|finally\s+)?(?:read|open|print|show|return|send|upload|post|run|execute|install|configure|add)\b/i.test(plain)
    || /^(?:请|然后|接着|必须|务必|应当|需要)?(?:读取|打开|输出|显示|发送|上传|传输|运行|执行|安装|配置|添加)/.test(plain)
}

export function isSafetyProhibition(line: string, actionIndex: number) {
  const prefix = currentClausePrefix(line, actionIndex)
  return /\b(?:avoid|do\s+not|don't|forbid(?:den)?|must\s+not|never|prohibit(?:ed)?|should\s+not)\b|不要|不得|严禁|切勿|禁止|避免/i.test(prefix)
}

function currentClausePrefix(line: string, actionIndex: number) {
  const prefix = line.slice(0, Math.max(0, actionIndex)).normalize('NFC')
  const boundary = Math.max(
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?'),
    prefix.lastIndexOf(';'),
    prefix.lastIndexOf('。'),
    prefix.lastIndexOf('！'),
    prefix.lastIndexOf('？'),
    prefix.lastIndexOf('；'),
  )
  return prefix.slice(boundary + 1)
}
