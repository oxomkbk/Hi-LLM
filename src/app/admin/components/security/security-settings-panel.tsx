'use client'

import { Button, toast } from '@heroui/react'
import { useEffect, useState } from 'react'

import { request } from '@/lib/request'

type SecurityMode = 'enforce' | 'observe' | 'off' | 'warn'

interface SecuritySettings {
  capabilities: { canManageSettings: boolean }
  confirmedLlmIdentity: Record<string, unknown> | null
  mcpMode: SecurityMode
  promptMode: SecurityMode
  publicShowGrade: boolean
  publicShowRiskCounts: boolean
  publicShowScore: boolean
  publicShowSummary: boolean
  settingsVersion: number
  skillMode: SecurityMode
}

const MODES: Array<{ description: string, label: string, value: SecurityMode }> = [
  { description: '不创建新任务，已有报告仍保留。', label: '关闭自动评测', value: 'off' },
  { description: '自动生成评分和建议，任何发现都不影响发布。', label: '只生成报告', value: 'observe' },
  { description: '自动生成报告并突出危险项，但仍允许管理员直接发布。', label: '危险项仅提醒', value: 'warn' },
  { description: '自动完成评测；只有危险命令、恶意执行或数据破坏行为会暂停发布。', label: '自动保护发布（推荐）', value: 'enforce' },
]

export default function SecuritySettingsPanel() {
  const [settings, setSettings] = useState<SecuritySettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmIdentity, setConfirmIdentity] = useState(false)

  useEffect(() => {
    void request<SecuritySettings>('/admin/security-settings').then(result => setSettings(result.data)).catch(() => undefined)
  }, [])

  if (!settings)
    return <p className="px-4 py-5 text-xs text-muted">正在读取安全策略…</p>

  const update = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    setSettings(current => current ? { ...current, [key]: value } : current)
  }
  const save = async () => {
    setSaving(true)
    try {
      const result = await request<SecuritySettings>('/admin/security-settings', {
        body: JSON.stringify({
          confirmLlmIdentity: confirmIdentity,
          mcpMode: settings.mcpMode,
          promptMode: settings.promptMode,
          publicShowGrade: settings.publicShowGrade,
          publicShowRiskCounts: settings.publicShowRiskCounts,
          publicShowScore: settings.publicShowScore,
          publicShowSummary: settings.publicShowSummary,
          skillMode: settings.skillMode,
        }),
        method: 'PUT',
      })
      setSettings(result.data)
      setConfirmIdentity(false)
      toast.success('安全评测策略已保存')
    }
    catch {
      // request() 已展示服务端错误；消费异常避免 onPress 产生未捕获 Promise。
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="security-settings-grid">
      <div className="security-mode-table">
        <div className="security-mode-heading">
          <p className="security-settings-label">为每类内容选择自动化程度</p>
          <span>普通建议只影响评分，不增加人工待办；建议使用“自动保护发布”。</span>
        </div>
        <ModeRow label="Skills" value={settings.skillMode} onChange={value => update('skillMode', value)} />
        <ModeRow label="MCP" value={settings.mcpMode} onChange={value => update('mcpMode', value)} />
        <ModeRow label="Prompts" value={settings.promptMode} onChange={value => update('promptMode', value)} />
      </div>
      <div>
        <p className="security-settings-label">前台向用户展示</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <PolicyCheck checked={settings.publicShowScore} label="显示分数" onChange={value => update('publicShowScore', value)} />
          <PolicyCheck checked={settings.publicShowGrade} label="显示等级" onChange={value => update('publicShowGrade', value)} />
          <PolicyCheck checked={settings.publicShowRiskCounts} label="显示风险数量" onChange={value => update('publicShowRiskCounts', value)} />
          <PolicyCheck checked={settings.publicShowSummary} label="显示安全摘要" onChange={value => update('publicShowSummary', value)} />
        </div>
        <label className="security-confirm-line">
          <input type="checkbox" checked={confirmIdentity} onChange={event => setConfirmIdentity(event.target.checked)} />
          <span>
            <strong>确认当前评测模型配置</strong>
            <small>更换模型、协议或服务地址后需要重新确认；仅更换 API Key 不影响已有报告。</small>
          </span>
        </label>
      </div>
      <div className="flex items-end justify-end">
        <Button isDisabled={!settings.capabilities.canManageSettings} isPending={saving} onPress={() => void save()}>保存策略</Button>
      </div>
    </div>
  )
}

function ModeRow({ label, onChange, value }: { label: string, onChange: (value: SecurityMode) => void, value: SecurityMode }) {
  const selected = MODES.find(mode => mode.value === value) ?? MODES[0]!
  return (
    <label className="security-mode-row">
      <span>
        <strong>{label}</strong>
        <small>{selected.description}</small>
      </span>
      <select aria-label={`${label} 安全模式`} value={value} onChange={event => onChange(event.target.value as SecurityMode)}>
        {MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
      </select>
    </label>
  )
}

function PolicyCheck({ checked, label, onChange }: { checked: boolean, label: string, onChange: (checked: boolean) => void }) {
  return (
    <label className="security-policy-check">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
