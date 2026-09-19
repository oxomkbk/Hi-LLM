import {
  PROMPT_GLOSSARY_PREVIEW_LANGUAGE,
  PROMPT_GLOSSARY_PREVIEW_PATH,
  PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION,
  PROMPT_GLOSSARY_PREVIEW_STYLE_PATH,
} from './glossary-preview'
import { subsetTerminologyPreviewCss } from './terminology-preview-css-subset'
import { TERMINOLOGY_STYLE_PREVIEWS } from './terminology-preview-scenes-styles'
import { TERMINOLOGY_SYSTEM_PREVIEWS } from './terminology-preview-scenes-systems'
import { TERMINOLOGY_UI_PREVIEWS } from './terminology-preview-scenes-ui'
import { TERMINOLOGY_SEMANTIC_PREVIEW_CSS } from './terminology-preview-semantic-styles'

import type { DevelopmentTerminologyCollectionSeed } from './development-terminology-data'
import type { PromptGlossaryItem } from './glossary'
import type { PromptDocumentInput } from '@/types'

export const DEVELOPMENT_TERMINOLOGY_PREVIEW_CSS = `.preview-root .pv-stage{display:flex;width:100%;height:148px;gap:12px;align-items:center;justify-content:center;padding:14px;background-color:var(--preview-bg);border:1px solid var(--preview-border);border-radius:16px}
.preview-root .pv-window{display:flex;width:100%;max-width:360px;flex-direction:column;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px;box-shadow:0px 8px 24px 0px var(--preview-shadow)}
.preview-root .pv-bar{display:flex;height:28px;gap:5px;align-items:center;padding:0 10px;background-color:var(--preview-accent-soft);border-bottom:1px solid var(--preview-border)}
.preview-root .pv-dot{display:block;width:7px;height:7px;background-color:var(--preview-muted);border-radius:999px}
.preview-root .pv-body{display:flex;min-height:92px;gap:10px;align-items:center;justify-content:center;padding:12px}
.preview-root .pv-col{display:flex;flex:1;flex-direction:column;gap:7px}
.preview-root .pv-row{display:flex;width:100%;gap:8px;align-items:center;justify-content:center}
.preview-root .pv-node{display:flex;min-width:54px;min-height:34px;align-items:center;justify-content:center;padding:7px 10px;color:var(--preview-text);background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-size:11px;font-weight:700;text-align:center}
.preview-root .pv-node-accent{color:var(--preview-accent);background-color:var(--preview-accent-soft);border-color:var(--preview-accent)}
.preview-root .pv-node-success{color:var(--preview-success);border-color:var(--preview-success)}
.preview-root .pv-node-danger{color:var(--preview-danger);border-color:var(--preview-danger)}
.preview-root .pv-arrow{color:var(--preview-muted);font-weight:700}
.preview-root .pv-copy{display:flex;flex:1;flex-direction:column;gap:5px}
.preview-root .pv-line{display:block;width:100%;height:6px;background-color:var(--preview-border);border-radius:999px}
.preview-root .pv-line-short{width:62%}
.preview-root .pv-button{display:inline-flex;min-height:28px;align-items:center;justify-content:center;padding:5px 12px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:8px;font-size:10px;font-weight:700}
.preview-root .pv-code{display:flex;flex:1;flex-direction:column;gap:6px;padding:10px;color:var(--preview-text);background-color:var(--preview-bg);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:10px}
.preview-root .pv-chip{display:inline-flex;min-height:24px;align-items:center;padding:4px 9px;color:var(--preview-accent);background-color:var(--preview-accent-soft);border:1px solid var(--preview-accent);border-radius:999px;font-size:10px;font-weight:700}
.preview-root .pv-chip-success{color:var(--preview-success);background-color:var(--preview-surface);border-color:var(--preview-success)}
.preview-root .pv-chip-warning{color:var(--preview-warning);background-color:var(--preview-surface);border-color:var(--preview-warning)}
.preview-root .pv-table{width:100%;max-width:330px;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-cell{padding:7px 9px;color:var(--preview-text);border-bottom:1px solid var(--preview-border);font-size:10px;text-align:left}
.preview-root .pv-cell-head{color:var(--preview-muted);background-color:var(--preview-bg);font-weight:700}
.preview-root .pv-list{display:flex;width:100%;max-width:330px;flex-direction:column;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-list-item{display:flex;gap:9px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--preview-border)}
.preview-root .pv-avatar{display:flex;width:30px;height:30px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border:1px solid var(--preview-border);border-radius:999px;font-size:10px;font-weight:700}
.preview-root .pv-card{display:flex;width:152px;min-height:108px;flex-direction:column;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:11px;box-shadow:0px 8px 24px 0px var(--preview-shadow)}
.preview-root .pv-card-top{display:flex;height:52px;align-items:center;justify-content:center;color:var(--preview-accent);background-color:var(--preview-accent-soft);font-weight:700}
.preview-root .pv-card-copy{display:flex;flex-direction:column;gap:4px;padding:8px 10px;font-size:10px}
.preview-root .pv-stat{display:flex;min-width:120px;flex-direction:column;gap:5px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-tab{display:inline-flex;min-height:30px;align-items:center;padding:5px 10px;color:var(--preview-muted);border-bottom:1px solid var(--preview-border);font-size:10px}
.preview-root .pv-tab-active{color:var(--preview-accent);border-color:var(--preview-accent);font-weight:700}
.preview-root .pv-tree{display:flex;width:100%;max-width:290px;flex-direction:column;gap:5px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-family:var(--preview-mono);font-size:10px}
.preview-root .pv-indent{margin-left:18px;color:var(--preview-accent)}
.preview-root .pv-indent-deep{margin-left:36px;color:var(--preview-muted)}
.preview-root .pv-swatch{display:flex;width:44px;height:44px;align-items:center;justify-content:center;color:var(--preview-text);background-color:var(--preview-accent-soft);border:1px solid var(--preview-accent);border-radius:11px;font-size:9px}
.preview-root .pv-swatch-dark{color:var(--preview-surface);background-color:var(--preview-accent)}
.preview-root .pv-field{display:flex;width:100%;min-height:36px;align-items:center;justify-content:space-between;padding:7px 10px;color:var(--preview-muted);background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px;font-size:10px}
.preview-root .pv-badge{display:flex;min-width:22px;height:22px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-danger);border-radius:999px;font-size:9px;font-weight:700}
.preview-root .pv-media{display:flex;width:178px;height:102px;align-items:center;justify-content:center;color:var(--preview-accent);background-color:var(--preview-accent-soft);border:1px solid var(--preview-border);border-radius:12px;font-weight:700}
.preview-root .pv-caption{color:var(--preview-muted);font-size:9px;text-align:center}
${TERMINOLOGY_SEMANTIC_PREVIEW_CSS}
@media (prefers-reduced-motion: reduce){.preview-root .pv-stage{transform:none}}`

export function buildDevelopmentTerminologyPreviewDocuments(
  collection: DevelopmentTerminologyCollectionSeed,
): PromptDocumentInput[] {
  const items = collection.document.sections.flatMap(section => section.items.map(item => ({
    ...buildPreview(item),
    termId: item.id,
  })))
  const css = subsetTerminologyPreviewCss(DEVELOPMENT_TERMINOLOGY_PREVIEW_CSS, items)
  return [
    {
      content: JSON.stringify({ items, schemaVersion: PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION }),
      isPrimary: false,
      language: PROMPT_GLOSSARY_PREVIEW_LANGUAGE,
      name: '术语预览',
      role: 'example',
      sourcePath: PROMPT_GLOSSARY_PREVIEW_PATH,
    },
    {
      content: css,
      isPrimary: false,
      language: 'css',
      name: '术语预览样式',
      role: 'style',
      sourcePath: PROMPT_GLOSSARY_PREVIEW_STYLE_PATH,
    },
  ]
}

const SEMANTIC_PREVIEW_CATALOG = Object.freeze({
  ...TERMINOLOGY_UI_PREVIEWS,
  ...TERMINOLOGY_SYSTEM_PREVIEWS,
  ...TERMINOLOGY_STYLE_PREVIEWS,
})

function buildPreview(item: PromptGlossaryItem) {
  const summary = `${item.label}：${item.description}`
  const html = buildSpecificPreview(item) ?? SEMANTIC_PREVIEW_CATALOG[item.id]
  if (!html)
    throw new Error(`术语 ${item.id} 缺少语义预览，禁止回退为通用占位图`)
  return { html, summary }
}

function buildSpecificPreview(item: PromptGlossaryItem) {
  const label = escapeHtml(item.label)
  const term = escapeHtml(item.term)
  switch (item.id) {
    case 'frontend':
      return windowPreview(label, '用户看到并操作的界面', '立即体验')
    case 'component':
      return stage(`<div class="pv-node pv-node-accent">共享组件 · ${term}</div><span class="pv-arrow">→</span><div class="pv-col"><span class="pv-node">首页</span><span class="pv-node">详情页</span></div>`)
    case 'state':
      return stage('<span class="pv-node">未提交</span><span class="pv-arrow">→</span><span class="pv-node pv-node-accent">保存中</span><span class="pv-arrow">→</span><span class="pv-node pv-node-success">已保存</span>')
    case 'dom':
      return treePreview('&lt;main&gt;', '&lt;section&gt;', '&lt;button&gt;保存&lt;/button&gt;')
    case 'undo':
      return stage(`<div class="pv-col"><span class="pv-node pv-node-danger">导航改动</span><span class="pv-caption">刚才的修改</span></div><span class="pv-arrow">←</span><div class="pv-col"><span class="pv-node pv-node-success">原始导航</span><span class="pv-caption">其他内容保留</span></div>`)
    case 'markdown':
      return codeResultPreview('# 项目计划', '<strong>项目计划</strong><span>• 需求确认</span>')
    case 'html':
      return codeResultPreview('&lt;h1&gt;项目&lt;/h1&gt;', '<strong>项目</strong><span>语义化标题</span>')
    case 'css':
      return codeResultPreview('.button { color: … }', '<span class="pv-button">主题按钮</span>')
    case 'title-tag':
      return windowPreview('术语表达助手', '浏览器标签页标题', '×')
    case 'page-metadata':
      return stage('<div class="pv-list"><div class="pv-list-item"><strong>title</strong><span>页面标题</span></div><div class="pv-list-item"><strong>description</strong><span>搜索摘要</span></div><div class="pv-list-item"><strong>share</strong><span>分享信息</span></div></div>')
    case 'favicon':
      return stage('<div class="pv-window"><div class="pv-bar"><span class="pv-node pv-node-accent">AI</span><strong>项目详情</strong><span>×</span></div><div class="pv-body"><span class="pv-caption">标签页小图标，不是页面 Logo</span></div></div>')
    case 'open-graph':
      return stage('<div class="pv-card"><div class="pv-card-top">分享预览图</div><div class="pv-card-copy"><strong>文章标题</strong><span>摘要与站点信息</span></div></div>')
    case 'web-app-manifest':
      return stage('<div class="pv-row"><span class="pv-swatch pv-swatch-dark">APP</span><div class="pv-copy"><strong>可安装网页应用</strong><span>名称 · 图标 · 启动路径</span></div><span class="pv-button">安装</span></div>')
    case 'accessibility':
      return stage('<div class="pv-col"><span class="pv-field">姓名 <strong>键盘焦点</strong></span><span class="pv-node pv-node-accent">屏幕阅读器：姓名输入框</span></div>')
    case 'table':
      return stage('<table class="pv-table"><thead><tr><th class="pv-cell pv-cell-head">项目</th><th class="pv-cell pv-cell-head">状态</th><th class="pv-cell pv-cell-head">更新</th></tr></thead><tbody><tr><td class="pv-cell">官网改版</td><td class="pv-cell">进行中</td><td class="pv-cell">刚刚</td></tr><tr><td class="pv-cell">年度设计</td><td class="pv-cell">已完成</td><td class="pv-cell">昨天</td></tr></tbody></table>')
    case 'list':
      return stage('<div class="pv-list"><div class="pv-list-item"><span class="pv-avatar">评</span><div class="pv-copy"><strong>评论者提交了一条评论</strong><span>摘要 · 刚刚</span></div></div><div class="pv-list-item"><span class="pv-avatar">协</span><div class="pv-copy"><strong>协作者发出邀请</strong><span>项目 · 2 分钟前</span></div></div></div>')
    case 'card':
      return stage('<div class="pv-card"><div class="pv-card-top">商品图片</div><div class="pv-card-copy"><strong>轻量双肩包</strong><span>日常系列 · ¥299</span></div></div>')
    case 'tag':
      return stage('<span class="pv-chip">进行中</span><span class="pv-chip pv-chip-success">已完成</span><span class="pv-chip pv-chip-warning">已逾期</span>')
    case 'badge':
      return stage('<div class="pv-row"><span class="pv-node">通知</span><span class="pv-badge">5</span><span class="pv-node">消息</span><span class="pv-badge">99+</span></div>')
    case 'avatar':
      return stage('<div class="pv-row"><span class="pv-avatar">林</span><span class="pv-avatar">周</span><span class="pv-avatar">AI</span><span class="pv-avatar">+5</span></div>')
    case 'descriptions':
      return stage('<div class="pv-list"><div class="pv-list-item"><strong>名称</strong><span>季度报告</span></div><div class="pv-list-item"><strong>状态</strong><span>已发布</span></div><div class="pv-list-item"><strong>时间</strong><span>今天 10:30</span></div></div>')
    case 'statistic':
      return stage('<div class="pv-stat"><small>本月用户</small><strong>12,480</strong><span class="pv-chip pv-chip-success">+18.2%</span></div><div class="pv-stat"><small>成交额</small><strong>¥86K</strong><span class="pv-caption">实时汇总</span></div>')
    case 'tabs':
      return stage('<div class="pv-row"><span class="pv-tab pv-tab-active">概览</span><span class="pv-tab">活动</span><span class="pv-tab">设置</span></div>')
    case 'collapse':
      return stage('<div class="pv-list"><div class="pv-list-item"><strong>常见问题一</strong><span>＋</span></div><div class="pv-list-item"><div class="pv-copy"><strong>退款需要多久？</strong><span>通常会在 3—5 个工作日原路退回。</span></div><span>－</span></div></div>')
    case 'carousel':
      return stage('<span class="pv-node">上一张</span><div class="pv-media">当前图片 2 / 4</div><span class="pv-node">下一张</span>')
    case 'image':
      return stage('<div class="pv-col"><div class="pv-media">产品图片</div><span class="pv-caption">替代文字：蓝色运动鞋侧面</span></div>')
    case 'file':
      return stage('<div class="pv-list"><div class="pv-list-item"><span class="pv-node">PDF</span><div class="pv-copy"><strong>季度报告.pdf</strong><span>2.4 MB · 下载</span></div></div></div>')
    case 'icon':
      return stage('<div class="pv-row"><span class="pv-node">⌕</span><span class="pv-node">＋</span><span class="pv-node">✓</span><span class="pv-caption">图标配合可读标签</span></div>')
    case 'quote':
      return stage('<div class="pv-card"><div class="pv-card-copy"><strong>“上线后的工单减少了 42%。”</strong><span>— 运营负责人 · 已核实案例</span></div></div>')
    case 'video':
      return stage('<div class="pv-col"><div class="pv-media">▶ 01:24</div><span class="pv-caption">产品演示 · 可暂停 · 有字幕</span></div>')
    case 'rich-text':
      return codeResultPreview('标题 · 加粗 · 列表 · 链接', '<strong>可排版的正文内容</strong><span>支持结构化编辑</span>')
    case 'timeline':
      return stage('<div class="pv-col"><div class="pv-row"><span class="pv-badge">1</span><span class="pv-node">需求确认</span></div><div class="pv-row"><span class="pv-badge">2</span><span class="pv-node pv-node-accent">设计完成</span></div><div class="pv-row"><span class="pv-badge">3</span><span class="pv-node">等待发布</span></div></div>')
    case 'chat-ui':
      return stage('<div class="pv-col"><div class="pv-row"><span class="pv-node">用户：查一下库存</span></div><div class="pv-row"><span class="pv-node pv-node-accent">AI：正在调用库存工具</span></div></div>')
    case 'empty':
      return stage('<div class="pv-col"><span class="pv-node">0 条结果</span><div class="pv-copy"><strong>还没有项目</strong><span>创建第一个项目，或清除当前筛选。</span></div><span class="pv-button">新建项目</span></div>')
    case 'filter':
      return stage('<div class="pv-row"><span class="pv-chip">状态：进行中</span><span class="pv-chip">负责人：我</span><span class="pv-node">共 8 条结果</span></div>')
    case 'sort':
      return stage('<div class="pv-col"><span class="pv-node">最近更新 ↓</span><span class="pv-node pv-node-accent">今天 · 项目 A</span><span class="pv-node">昨天 · 项目 B</span></div>')
    case 'pagination':
      return stage('<div class="pv-row"><span class="pv-node">上一页</span><span class="pv-node pv-node-accent">1</span><span class="pv-node">2</span><span class="pv-node">3</span><span class="pv-node">下一页</span></div>')
    case 'chart':
      return stage('<div class="pv-row"><div class="pv-stat"><small>一月</small><strong>42</strong></div><div class="pv-stat"><small>二月</small><strong>68</strong></div><div class="pv-stat"><small>三月</small><strong>91</strong></div></div>')
    case 'app-icon':
      return stage('<div class="pv-row"><span class="pv-swatch pv-swatch-dark">AI</span><span class="pv-swatch">32</span><span class="pv-swatch pv-swatch-dark">64</span><div class="pv-copy"><strong>应用图标</strong><span>多尺寸 · 统一识别</span></div></div>')
    default:
      return null
  }
}

function codeResultPreview(source: string, result: string) {
  return stage(`<div class="pv-code"><small>源码</small><span>${source}</span></div><span class="pv-arrow">→</span><div class="pv-code"><small>浏览器呈现</small>${result}</div>`)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function stage(content: string) {
  return `<div class="pv-stage">${content}</div>`
}

function treePreview(root: string, child: string, leaf: string) {
  return stage(`<div class="pv-tree"><span>${root}</span><span class="pv-indent">${child}</span><span class="pv-indent-deep">${leaf}</span><span class="pv-indent">${child.replace('&lt;', '&lt;/')}</span><span>${root.replace('&lt;', '&lt;/')}</span></div>`)
}

function windowPreview(title: string, description: string, action: string) {
  return stage(`<div class="pv-window"><div class="pv-bar"><span class="pv-dot"></span><span class="pv-dot"></span><span class="pv-dot"></span><strong>${title}</strong></div><div class="pv-body"><div class="pv-copy"><strong>${title}</strong><span>${description}</span></div><span class="pv-button">${action}</span></div></div>`)
}
