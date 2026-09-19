export function recordWebsiteVisit(id: string) {
  void fetch(`/api/websites/${encodeURIComponent(id)}/visit`, {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch(() => {
    // 统计失败不应阻止用户打开网站。
  })
}
