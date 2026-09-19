export function normalizeNavigationAiPlainText(value: string, maxLength = 900) {
  const lines = value
    .replaceAll('\r', '')
    .replaceAll('```', '')
    .split('\n')
    .map(normalizeLine)

  return lines
    .join('\n')
    .replaceAll('**', '')
    .replaceAll('__', '')
    .replaceAll('~~', '')
    .replaceAll('`', '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function normalizeLine(value: string) {
  let line = value.trimEnd()
  line = line.replace(/^\s{0,3}#{1,6}\s+/, '')
  line = line.replace(/^\s{0,3}>\s?/, '')
  line = line.replace(/^\s{0,3}[-*+]\s+/, '• ')
  return line
}
