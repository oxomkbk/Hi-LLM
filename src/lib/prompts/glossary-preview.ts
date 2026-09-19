import type { PromptDocument } from '@/types'

export const PROMPT_GLOSSARY_PREVIEW_LANGUAGE = 'prompt-glossary-preview+json'
export const PROMPT_GLOSSARY_PREVIEW_PATH = 'PREVIEWS.json'
export const PROMPT_GLOSSARY_PREVIEW_STYLE_PATH = 'styles/glossary-preview.css'
export const PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION = 1

export interface PromptGlossaryPreview {
  html: string
  summary: string
}

export interface PromptGlossaryPreviewBundle {
  css: string
  fingerprint: string
  items: Record<string, PromptGlossaryPreview>
}

export interface PromptGlossaryPreviewDocument {
  items: Array<PromptGlossaryPreview & { termId: string }>
  schemaVersion: typeof PROMPT_GLOSSARY_PREVIEW_SCHEMA_VERSION
}

const LIGHT_THEME = [
  '--preview-bg:#f7f8fa',
  '--preview-surface:#ffffff',
  '--preview-muted:#6b7280',
  '--preview-border:#d9dde5',
  '--preview-text:#20242c',
  '--preview-accent:#4f6df5',
  '--preview-accent-soft:#e8edff',
  '--preview-success:#2d8a5b',
  '--preview-warning:#b66a14',
  '--preview-danger:#c74d55',
  '--preview-blue:#2866df',
  '--preview-clay:#b85f3c',
  '--preview-cyan:#047f9b',
  '--preview-dark-bg:#101318',
  '--preview-dark-surface:#1b2130',
  '--preview-dark-text:#f5f7ff',
  '--preview-earth:#356b4c',
  '--preview-gold:#8a6518',
  '--preview-ink:#17181c',
  '--preview-paper:#fffdf7',
  '--preview-pink:#b72f75',
  '--preview-purple:#6948d6',
  '--preview-red:#c6322d',
  '--preview-sand:#eee2c8',
  '--preview-terminal:#48c968',
  '--preview-yellow:#9a7300',
  '--preview-shadow:rgba(32,36,44,.12)',
  '--preview-font:ui-sans-serif,system-ui,sans-serif',
  '--preview-mono:ui-monospace,SFMono-Regular,monospace',
].join(';')

const DARK_THEME = [
  '--preview-bg:#16181d',
  '--preview-surface:#22252d',
  '--preview-muted:#a1a8b5',
  '--preview-border:#3a3f4b',
  '--preview-text:#f0f2f6',
  '--preview-accent:#91a4ff',
  '--preview-accent-soft:#303a66',
  '--preview-success:#69c994',
  '--preview-warning:#e2a457',
  '--preview-danger:#ef8c92',
  '--preview-blue:#7da4ff',
  '--preview-clay:#e69976',
  '--preview-cyan:#5edcf6',
  '--preview-dark-bg:#090b0f',
  '--preview-dark-surface:#171c27',
  '--preview-dark-text:#f5f7ff',
  '--preview-earth:#7fbd91',
  '--preview-gold:#edc96f',
  '--preview-ink:#111217',
  '--preview-paper:#fffdf7',
  '--preview-pink:#f083bd',
  '--preview-purple:#a995ff',
  '--preview-red:#ff847d',
  '--preview-sand:#d8c69f',
  '--preview-terminal:#78f08f',
  '--preview-yellow:#f5d465',
  '--preview-shadow:rgba(0,0,0,.28)',
  '--preview-font:ui-sans-serif,system-ui,sans-serif',
  '--preview-mono:ui-monospace,SFMono-Regular,monospace',
].join(';')

const BASE_CSS = `*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--preview-bg);color:var(--preview-text);font-family:var(--preview-font);font-size:14px}.preview-root{display:flex;width:100%;height:100%;min-height:180px;align-items:center;justify-content:center;padding:18px}`

export function buildGlossaryPreviewSrcDoc(
  preview: PromptGlossaryPreview,
  css: string,
  theme: 'dark' | 'light',
) {
  const palette = theme === 'dark'
    ? DARK_THEME
    : LIGHT_THEME
  const title = escapeHtml(preview.summary)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="${theme}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${BASE_CSS}:root{${palette}}${css}</style></head><body><div class="preview-root">${preview.html}</div></body></html>`
}

export function isGlossaryPreviewDocument(document: Pick<PromptDocument, 'language' | 'role' | 'source_path'>) {
  return document.role === 'example'
    && document.language.trim().toLowerCase() === PROMPT_GLOSSARY_PREVIEW_LANGUAGE
    && document.source_path === PROMPT_GLOSSARY_PREVIEW_PATH
}

export function isGlossaryPreviewStyleDocument(document: Pick<PromptDocument, 'language' | 'role' | 'source_path'>) {
  return document.role === 'style'
    && document.language.trim().toLowerCase() === 'css'
    && document.source_path === PROMPT_GLOSSARY_PREVIEW_STYLE_PATH
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}
