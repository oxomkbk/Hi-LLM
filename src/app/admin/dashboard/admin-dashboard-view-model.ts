interface DashboardContentCount {
  archived: number
  draft: number
  id: 'mcp' | 'prompts' | 'skills' | 'websites'
  published: number
  total: number
}

interface DashboardContentSummary {
  archived: number
  draft: number
  published: number
  total: number
}

const EMPTY_SUMMARY: DashboardContentSummary = {
  archived: 0,
  draft: 0,
  published: 0,
  total: 0,
}

export function formatAdminNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function summarizeDashboardContent(channels: readonly DashboardContentCount[]) {
  return channels.reduce((result, channel) => {
    addChannel(result.all, channel)
    if (channel.id !== 'websites')
      addChannel(result.directory, channel)
    return result
  }, {
    all: { ...EMPTY_SUMMARY },
    directory: { ...EMPTY_SUMMARY },
  })
}

function addChannel(summary: DashboardContentSummary, channel: DashboardContentCount) {
  summary.archived += channel.archived
  summary.draft += channel.draft
  summary.published += channel.published
  summary.total += channel.total
}
