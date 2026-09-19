import type { WonderWorkKind } from './domain'

export const WORK_KIND_LABELS: Record<WonderWorkKind, string> = {
  app: '应用',
  game: '游戏',
  library: '开源库',
  other: '其他',
  plugin: '插件',
  template: '模板',
}

export function workKindLabel(kind: string) {
  return Object.hasOwn(WORK_KIND_LABELS, kind)
    ? WORK_KIND_LABELS[kind as WonderWorkKind]
    : kind
}
