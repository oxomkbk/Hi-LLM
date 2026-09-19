'use client'

import { CircleCheckFill, FloppyDisk, PlugConnection } from '@gravity-ui/icons'
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Switch,
  TextField,
  toast,
} from '@heroui/react'
import { useEffect, useState } from 'react'

import { request } from '@/lib/request'
import { formatDate, RESPONSE } from '@/lib/utils'

import { AdminPageHeader } from './admin-ui'

import type { AdminLlmSettings, LlmProtocol } from '@/types'
import type { FormEvent } from 'react'

const DEFAULT_BASE_URLS: Record<LlmProtocol, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
}

export default function LlmSettingsForm({ initialSettings }: { initialSettings: AdminLlmSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [protocol, setProtocol] = useState<LlmProtocol>(initialSettings.protocol)
  const [baseUrl, setBaseUrl] = useState(initialSettings.baseUrl)
  const [model, setModel] = useState(initialSettings.model)
  const [navigationAiEnabled, setNavigationAiEnabled] = useState(initialSettings.navigationAiEnabled)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const changed = protocol !== settings.protocol
    || baseUrl !== settings.baseUrl
    || model !== settings.model
    || navigationAiEnabled !== settings.navigationAiEnabled
    || Boolean(apiKey)

  useEffect(() => {
    if (!changed)
      return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [changed])

  const changeProtocol = (next: LlmProtocol) => {
    setProtocol(next)
    if (!baseUrl || Object.values(DEFAULT_BASE_URLS).includes(baseUrl))
      setBaseUrl(DEFAULT_BASE_URLS[next])
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await request<AdminLlmSettings>('/admin/llm-settings', {
        body: JSON.stringify({
          apiKey,
          baseUrl,
          model,
          navigationAiEnabled,
          protocol,
        }),
        method: 'PUT',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return
      setSettings(result.data)
      setApiKey('')
      toast.success(result.msg, { indicator: <CircleCheckFill /> })
    }
    finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      const result = await request('/admin/llm-settings/test', { method: 'POST' })
      if (result.code === RESPONSE.SUCCESS) {
        setSettings(current => ({
          ...current,
          lastCheckAt: new Date().toISOString(),
          lastCheckCode: 'LLM_READY',
          lastCheckOk: true,
        }))
        toast.success(result.msg, { indicator: <CircleCheckFill /> })
      }
    }
    finally {
      setTesting(false)
    }
  }

  return (
    <div className="admin-settings-page max-w-4xl pb-10">
      <AdminPageHeader
        title="大模型服务"
        actions={(
          <div data-ready={settings.lastCheckOk === true} className="admin-connection-status">
            <span aria-hidden="true" />
            <div>
              <strong>{settings.apiKeyConfigured ? '密钥已配置' : '等待配置'}</strong>
              <small>
                {settings.lastCheckAt
                  ? `${settings.lastCheckOk ? '连接正常' : '连接失败'} · ${formatDate(settings.lastCheckAt, 'datetime')}`
                  : (settings.apiKeyHint ?? '尚未执行连接测试')}
              </small>
            </div>
          </div>
        )}
        description="配置站内智能检索使用的模型接口、访问密钥与前台启用范围。"
      />

      <Form id="llm-settings-form" onSubmit={save} className="grid gap-5">
        <section aria-labelledby="navigation-ai-heading" className="admin-flat-panel admin-settings-section p-4 sm:p-5">
          <Switch isSelected={navigationAiEnabled} onChange={setNavigationAiEnabled}>
            <Switch.Content className="w-full items-start justify-between gap-6">
              <div>
                <p id="navigation-ai-heading" className="text-sm font-semibold">前台 AI 智能检索</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
                  开启后，导航、Skills、MCP、Prompts 与妙妙屋显示各自的 AI 检索入口。助手只读取对应页面的已发布内容，不保存访客对话。
                </p>
              </div>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Content>
          </Switch>
        </section>

        <section className="admin-settings-section admin-flat-panel p-4 sm:p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold">接口与凭据</h2>
            <p className="mt-1 text-xs leading-5 text-muted">先选择兼容协议，再填写服务地址、模型名称和服务端密钥。</p>
          </div>
          <div className="grid gap-5">
            <Select
              aria-label="接口协议"
              name="protocol"
              variant="secondary"
              value={protocol}
              onChange={value => changeProtocol(String(value) as LlmProtocol)}
            >
              <Label>接口协议</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="openai" textValue="OpenAI 兼容协议">
                    OpenAI 兼容协议
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="anthropic" textValue="Anthropic Messages 协议">
                    Anthropic Messages 协议
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            <TextField isRequired value={baseUrl} onChange={setBaseUrl}>
              <Label>Base URL</Label>
              <Input
                variant="secondary"
                fullWidth
                placeholder={DEFAULT_BASE_URLS[protocol]}
                spellCheck={false}
              />
              <FieldError />
            </TextField>

            <TextField isRequired value={model} onChange={setModel}>
              <Label>模型名称</Label>
              <Input
                variant="secondary"
                fullWidth
                placeholder={protocol === 'openai' ? 'gpt-5-mini' : 'claude-sonnet-4-5'}
                spellCheck={false}
              />
              <FieldError />
            </TextField>

            <TextField name="apiKey" isRequired={!settings.apiKeyConfigured} value={apiKey} onChange={setApiKey}>
              <Label>API Key</Label>
              <Input
                type="password"
                variant="secondary"
                autoComplete="new-password"
                fullWidth
                placeholder={settings.apiKeyConfigured ? `留空保留当前密钥（${settings.apiKeyHint}）` : '输入 API Key'}
              />
              <FieldError />
            </TextField>
          </div>
        </section>

        <div className="admin-settings-actions">
          <span data-dirty={changed ? 'true' : 'false'}>{changed ? '有未保存的更改' : '所有设置已保存'}</span>
          <Button type="submit" isDisabled={testing || !changed} isPending={saving}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : <FloppyDisk />}
                保存设置
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            isDisabled={saving || !settings.apiKeyConfigured}
            isPending={testing}
            onPress={() => void test()}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : <PlugConnection />}
                测试已保存配置
              </>
            )}
          </Button>
        </div>
      </Form>
    </div>
  )
}
