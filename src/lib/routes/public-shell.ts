export function isProfileRoute(pathname: string) {
  return pathname === '/account' || pathname.startsWith('/users/')
}

const PUBLIC_EDITOR_ROUTES = new Set([
  '/mcp/submit',
  '/prompts/submit',
  '/skills/submit',
  '/wonderland/ask',
  '/wonderland/works/new',
])

const ADMIN_EDITOR_ROUTE_PATTERNS = [
  /^\/admin\/mcp\/(?:new|[^/]+\/edit)$/,
  /^\/admin\/mcp\/submissions\/[^/]+\/review$/,
  /^\/admin\/skills\/(?:new|[^/]+\/edit)$/,
  /^\/admin\/skills\/submissions\/[^/]+\/review$/,
  /^\/admin\/wonderland\/works\/(?:new|[^/]+\/edit)$/,
]

export function isEditorWorkspaceRoute(pathname: string) {
  if (PUBLIC_EDITOR_ROUTES.has(pathname))
    return true
  return ADMIN_EDITOR_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))
}
