'use client'

import { Copy, Plus, TrashBin } from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Description,
  Disclosure,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  TextArea,
  TextField,
} from '@heroui/react'
import { useState } from 'react'

import { MCP_AUTH_TYPES, MCP_TRANSPORTS } from '@/lib/mcps'

import { createEmptyMcpInstallation, parseConfigTemplate } from './types'

import type { McpInstallationDraft } from './types'

const ENV_PLACEHOLDER = '$' + '{API_TOKEN}'

interface McpInstallationEditorProps {
  isReadOnly?: boolean
  onChange: (value: McpInstallationDraft[]) => void
  value: McpInstallationDraft[]
}

export default function McpInstallationEditor({ isReadOnly = false, onChange, value }: McpInstallationEditorProps) {
  const patch = (index: number, next: McpInstallationDraft) => onChange(value.map((item, itemIndex) => itemIndex === index ? next : item))
  const add = () => {
    if (value.length >= 8)
      return
    const next = createEmptyMcpInstallation(value.length)
    next.id = uniqueInstallationId(next.id, value)
    onChange([...value, next])
  }
  const duplicate = (index: number) => {
    if (value.length >= 8)
      return
    const source = value[index]
    const clone = JSON.parse(JSON.stringify(source)) as McpInstallationDraft
    clone.id = uniqueInstallationId(`${source.id}-copy`, value)
    clone.label = `${source.label} 副本`.slice(0, 60)
    onChange([...value.slice(0, index + 1), clone, ...value.slice(index + 1)])
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= value.length)
      return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="mcp-installation-editor space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label isRequired>安装与连接方式</Label>
          <p className="mt-1 text-xs leading-5 text-muted">为不同客户端提供清晰的本地安装包或远程连接配置，最多 8 种。</p>
        </div>
        <Button type="button" size="sm" variant="secondary" isDisabled={isReadOnly || value.length >= 8} onPress={add}>
          <Plus />
          添加方式
        </Button>
      </div>

      {value.map((installation, index) => (
        <InstallationCard
          key={installation.id}
          isReadOnly={isReadOnly}
          canDelete={value.length > 1}
          canDuplicate={value.length < 8}
          index={index}
          installation={installation}
          total={value.length}
          onChange={next => patch(index, next)}
          onDelete={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
          onDuplicate={() => duplicate(index)}
          onMove={direction => move(index, direction)}
        />
      ))}
    </div>
  )
}

function authLabel(value: string) {
  return ({ 'api-key': 'API Key', 'custom': '自定义认证', 'none': '无需认证', 'oauth2': 'OAuth 2.0' } as Record<string, string>)[value] ?? value
}

function DynamicRows({ description, emptyLabel, isReadOnly, onChange, rows, title }: {
  description: string
  emptyLabel: string
  isReadOnly: boolean
  onChange: (value: McpInstallationDraft['env_vars']) => void
  rows: McpInstallationDraft['env_vars']
  title: string
}) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
        {!isReadOnly
          ? (
              <Button type="button" size="sm" variant="ghost" onPress={() => onChange([...rows, { description: '', name: '', required: true }])}>
                <Plus />
                {emptyLabel}
              </Button>
            )
          : null}
      </div>
      {rows.length
        ? (
            <div className="mt-3 space-y-2">
              {rows.map((row, index) => (
                // Environment-variable rows have no persisted identifier; the index is scoped to this local editor list.
                // eslint-disable-next-line react/no-array-index-key
                <div key={`${index}-${row.name}`} className="mcp-dynamic-row-grid grid gap-2 rounded-xl bg-surface-secondary/45 p-3 sm:grid-cols-[minmax(140px,0.7fr)_minmax(180px,1fr)_auto_auto] sm:items-end">
                  <TextField isReadOnly={isReadOnly} fullWidth value={row.name} onChange={name => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, name: name.toUpperCase() } : item))}>
                    <Label>变量名</Label>
                    <Input variant="secondary" placeholder="API_TOKEN" spellCheck={false} />
                  </TextField>
                  <TextField isReadOnly={isReadOnly} fullWidth value={row.description} onChange={next => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, description: next } : item))}>
                    <Label>用途说明</Label>
                    <Input variant="secondary" placeholder="用于调用服务的访问令牌" />
                  </TextField>
                  <Switch isDisabled={isReadOnly} isSelected={row.required} onChange={required => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, required } : item))}>
                    <Switch.Control><Switch.Thumb /></Switch.Control>
                    <Switch.Content>必填</Switch.Content>
                  </Switch>
                  {!isReadOnly
                    ? (
                        <Button
                          aria-label="删除环境变量"
                          type="button"
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          onPress={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          <TrashBin />
                        </Button>
                      )
                    : null}
                </div>
              ))}
            </div>
          )
        : null}
    </div>
  )
}

function HeaderRows({ isReadOnly, onChange, rows }: { isReadOnly: boolean, onChange: (value: McpInstallationDraft['headers']) => void, rows: McpInstallationDraft['headers'] }) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">请求头</p>
          <p className="mt-1 text-xs leading-5 text-muted">鉴权请求头应引用环境变量占位符，不保存真实密钥。</p>
        </div>
        {!isReadOnly
          ? (
              <Button type="button" size="sm" variant="ghost" onPress={() => onChange([...rows, { id: `header-${rows.length + 1}`, name: '', value: '' }])}>
                <Plus />
                添加请求头
              </Button>
            )
          : null}
      </div>
      {rows.length
        ? (
            <div className="mt-3 space-y-2">
              {rows.map(row => (
                <div key={row.id} className="mcp-dynamic-row-grid grid gap-2 rounded-xl bg-surface-secondary/45 p-3 sm:grid-cols-[minmax(140px,0.7fr)_minmax(180px,1fr)_auto] sm:items-end">
                  <TextField isReadOnly={isReadOnly} fullWidth value={row.name} onChange={name => onChange(rows.map(item => item.id === row.id ? { ...item, name } : item))}>
                    <Label>请求头名称</Label>
                    <Input variant="secondary" placeholder="Authorization" spellCheck={false} />
                  </TextField>
                  <TextField isReadOnly={isReadOnly} fullWidth value={row.value} onChange={headerValue => onChange(rows.map(item => item.id === row.id ? { ...item, value: headerValue } : item))}>
                    <Label>值或占位符</Label>
                    <Input variant="secondary" placeholder={ENV_PLACEHOLDER} spellCheck={false} />
                  </TextField>
                  {!isReadOnly
                    ? (
                        <Button
                          aria-label="删除请求头"
                          type="button"
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          onPress={() => onChange(rows.filter(item => item.id !== row.id))}
                        >
                          <TrashBin />
                        </Button>
                      )
                    : null}
                </div>
              ))}
            </div>
          )
        : null}
    </div>
  )
}

function InstallationCard({
  canDelete,
  canDuplicate,
  index,
  installation,
  isReadOnly,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  total,
}: {
  canDelete: boolean
  canDuplicate: boolean
  index: number
  installation: McpInstallationDraft
  isReadOnly: boolean
  onChange: (value: McpInstallationDraft) => void
  onDelete: () => void
  onDuplicate: () => void
  onMove: (direction: -1 | 1) => void
  total: number
}) {
  const [templateError, setTemplateError] = useState<string | null>(null)
  const patch = <Key extends keyof McpInstallationDraft>(key: Key, value: McpInstallationDraft[Key]) => onChange({ ...installation, [key]: value })
  const formatTemplate = () => {
    try {
      patch('config_template_text', JSON.stringify(parseConfigTemplate(installation.config_template_text), null, 2))
      setTemplateError(null)
    }
    catch (reason) {
      setTemplateError(reason instanceof Error ? reason.message : '高级配置格式无效')
    }
  }

  return (
    <Disclosure defaultExpanded={index === 0}>
      <div className="overflow-visible rounded-2xl border border-border bg-background">
        <Disclosure.Heading>
          <Button variant="ghost" slot="trigger" className="h-auto w-full justify-between rounded-none px-4 py-3.5 text-left">
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">{installation.label.trim() || `连接方式 ${index + 1}`}</span>
              <span className="mt-1 block truncate text-xs font-normal text-muted">{installationSummary(installation)}</span>
            </span>
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="border-t border-border p-4 sm:p-5">
            <div className="mcp-installation-fields-grid grid gap-4 sm:grid-cols-2">
              <TextField
                isReadOnly={isReadOnly}
                isRequired
                fullWidth
                maxLength={60}
                value={installation.label}
                onChange={next => patch('label', next)}
              >
                <Label>显示名称</Label>
                <Input variant="secondary" placeholder="例如：NPM 本地安装" />
              </TextField>
              <TextField
                isReadOnly={isReadOnly}
                isRequired
                fullWidth
                maxLength={80}
                value={installation.id}
                onChange={next => patch('id', next)}
              >
                <Label>配置 ID</Label>
                <Input variant="secondary" placeholder="npm-stdio" spellCheck={false} />
              </TextField>

              <Select
                aria-label="传输方式" variant="secondary" isDisabled={isReadOnly} isRequired value={installation.transport}
                onChange={(key) => {
                  const transport = String(key) as McpInstallationDraft['transport']
                  onChange({ ...installation, kind: transport === 'stdio' ? 'package' : 'remote', transport })
                }}
              >
                <Label>传输方式</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {MCP_TRANSPORTS.map(transport => (
                      <ListBox.Item key={transport} id={transport} textValue={transport}>
                        {transport === 'stdio' ? 'stdio · 本地进程' : 'Streamable HTTP · 远程服务'}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <Select
                aria-label="认证方式"
                variant="secondary"
                isDisabled={isReadOnly}
                isRequired
                value={installation.auth_type}
                onChange={key => patch('auth_type', String(key) as McpInstallationDraft['auth_type'])}
              >
                <Label>认证方式</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {MCP_AUTH_TYPES.map(auth => (
                      <ListBox.Item key={auth} id={auth} textValue={auth}>
                        {authLabel(auth)}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              {installation.transport === 'stdio'
                ? (
                    <>
                      <TextField
                        isReadOnly={isReadOnly}
                        isRequired
                        fullWidth
                        maxLength={200}
                        value={installation.package}
                        onChange={next => patch('package', next)}
                      >
                        <Label>包名称</Label>
                        <Input variant="secondary" placeholder="@scope/mcp-server" spellCheck={false} />
                      </TextField>
                      <TextField isReadOnly={isReadOnly} fullWidth maxLength={40} value={installation.version} onChange={next => patch('version', next)}>
                        <Label>固定版本（可选）</Label>
                        <Input variant="secondary" placeholder="1.2.0" spellCheck={false} />
                      </TextField>
                      <TextField
                        isReadOnly={isReadOnly}
                        isRequired
                        fullWidth
                        maxLength={120}
                        value={installation.command}
                        onChange={next => patch('command', next)}
                      >
                        <Label>启动命令</Label>
                        <Input variant="secondary" placeholder="npx" spellCheck={false} />
                      </TextField>
                      <TextField isReadOnly={isReadOnly} fullWidth value={installation.args.join('\n')} onChange={next => patch('args', next.split('\n').map(item => item.trim()).filter(Boolean))}>
                        <Label>启动参数（每行一项）</Label>
                        <TextArea variant="secondary" placeholder="-y&#10;@scope/mcp-server" rows={3} spellCheck={false} className="font-mono text-xs" />
                      </TextField>
                    </>
                  )
                : (
                    <TextField
                      type="url"
                      isReadOnly={isReadOnly}
                      isRequired
                      fullWidth
                      value={installation.remote_url}
                      onChange={next => patch('remote_url', next)}
                      className="sm:col-span-2"
                    >
                      <Label>远程 HTTPS 端点</Label>
                      <Input variant="secondary" placeholder="https://api.example.com/mcp" spellCheck={false} />
                      <Description>平台只保存连接声明，不会在编辑时调用第三方服务。</Description>
                    </TextField>
                  )}
            </div>

            <DynamicRows
              title="环境变量"
              isReadOnly={isReadOnly}
              description="只声明变量名称和用途，不要填写真实密钥。"
              emptyLabel="添加环境变量"
              rows={installation.env_vars}
              onChange={next => patch('env_vars', next)}
            />
            <HeaderRows isReadOnly={isReadOnly} rows={installation.headers} onChange={next => patch('headers', next)} />

            <Disclosure>
              <Disclosure.Heading>
                <Button type="button" variant="ghost" slot="trigger" className="mt-4 h-auto w-full justify-between rounded-xl border border-border px-3.5 py-3 text-left">
                  <span>
                    <span className="block text-sm font-bold">高级配置模板</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted">仅在需要嵌套客户端配置时使用，支持任意 JSON 对象结构。</span>
                  </span>
                  <Disclosure.Indicator />
                </Button>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="pt-3">
                  {templateError
                    ? (
                        <Alert status="danger" className="mb-3">
                          <Alert.Indicator />
                          <Alert.Content><Alert.Description>{templateError}</Alert.Description></Alert.Content>
                        </Alert>
                      )
                    : null}
                  <TextField
                    isReadOnly={isReadOnly} fullWidth value={installation.config_template_text} onChange={(next) => {
                      patch('config_template_text', next)
                      setTemplateError(null)
                    }}
                  >
                    <Label>配置模板 JSON</Label>
                    <TextArea variant="secondary" rows={9} spellCheck={false} className="font-mono text-xs leading-5" />
                    <Description>
                      敏感字段必须写成已声明环境变量，例如 $
                      {'{API_TOKEN}'}
                      。
                    </Description>
                  </TextField>
                  {!isReadOnly ? <Button type="button" size="sm" variant="secondary" onPress={formatTemplate} className="mt-2">校验并格式化</Button> : null}
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>

            {!isReadOnly
              ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="ghost" isDisabled={index === 0} onPress={() => onMove(-1)}>上移</Button>
                      <Button type="button" size="sm" variant="ghost" isDisabled={index === total - 1} onPress={() => onMove(1)}>下移</Button>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="ghost" isDisabled={!canDuplicate} onPress={onDuplicate}>
                        <Copy />
                        复制
                      </Button>
                      <Button type="button" size="sm" variant="danger-soft" isDisabled={!canDelete} onPress={onDelete}>
                        <TrashBin />
                        删除
                      </Button>
                    </div>
                  </div>
                )
              : null}
          </Disclosure.Body>
        </Disclosure.Content>
      </div>
    </Disclosure>
  )
}

function installationSummary(value: McpInstallationDraft) {
  if (value.transport === 'stdio')
    return `${value.package.trim() || '待填写包名'} · ${value.command.trim() || '待填写命令'}`
  return `${value.remote_url.trim() || '待填写远程端点'} · ${authLabel(value.auth_type)}`
}

function uniqueInstallationId(base: string, items: McpInstallationDraft[]) {
  const used = new Set(items.map(item => item.id))
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}
