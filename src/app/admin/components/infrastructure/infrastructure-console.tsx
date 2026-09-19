'use client'

import {
  Cloud,
  FloppyDisk,
  HardDrive,
  PlugConnection,
} from '@gravity-ui/icons'
import {
  Alert,
  Button,
  Card,
  Chip,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
  toast,
} from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'

import { request } from '@/lib/request'
import { RESPONSE } from '@/lib/utils'

import { AdminPageHeader } from '../admin-ui'

interface DatabaseProfile {
  active: boolean
  config: {
    database: string
    host: string
    port: string
    rejectUnauthorized: boolean
    username: string
  }
  id: string
  lastCheckAt: string | null
  lastCheckCode: string | null
  lastCheckOk: boolean | null
  name: string
  provider: DatabaseProvider
  schemaVersion: string | null
  status: string
}
type DatabaseProvider = 'local-postgres' | 'tencent-postgres'

interface InfrastructureOverview {
  activeUploads: number
  configVersion: number
  databaseProfiles: DatabaseProfile[]
  storageProfiles: StorageProfile[]
  updatedAt: string
}

interface StorageProfile {
  active: boolean
  config: {
    appId?: string
    bucket?: string
    cdnDomain?: string
    region?: string
    rootDirectory?: string
    secretConfigured?: boolean
  }
  id: string
  lastCheckAt: string | null
  lastCheckCode: string | null
  lastCheckOk: boolean | null
  name: string
  provider: StorageProvider
  status: string
}

type StorageProvider = 'local-filesystem' | 'tencent-cos'

export default function InfrastructureConsole() {
  const [overview, setOverview] = useState<InfrastructureOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null)
  const [editingDatabase, setEditingDatabase] = useState<DatabaseProfile | null>(null)
  const [editingStorage, setEditingStorage] = useState<StorageProfile | null>(null)
  const [databaseProvider, setDatabaseProvider] = useState<DatabaseProvider>('local-postgres')
  const [storageProvider, setStorageProvider] = useState<StorageProvider>('local-filesystem')
  const [savingDatabase, setSavingDatabase] = useState(false)
  const [savingStorage, setSavingStorage] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await request<InfrastructureOverview>('/admin/infrastructure')
      if (result.code !== RESPONSE.SUCCESS)
        throw new Error(result.msg)
      setOverview(result.data)
      setSelectedDatabase(current => current ?? result.data.databaseProfiles.find(item => item.active)?.id ?? null)
      setSelectedStorage(current => current ?? result.data.storageProfiles.find(item => item.active)?.id ?? null)
    }
    catch (error) {
      toast.danger(error instanceof Error ? error.message : '基础设施配置加载失败')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const switchProfiles = async () => {
    if (!selectedDatabase || !selectedStorage)
      return toast.danger('请选择数据库和存储配置')
    setSwitching(true)
    try {
      const result = await request('/admin/infrastructure', {
        body: JSON.stringify({ databaseProfileId: selectedDatabase, storageProfileId: selectedStorage }),
        method: 'PUT',
      })
      if (result.code === RESPONSE.SUCCESS) {
        toast.success(result.msg)
        await load()
      }
    }
    finally {
      setSwitching(false)
    }
  }

  const saveDatabase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSavingDatabase(true)
    try {
      const result = await request('/admin/infrastructure/database-profiles', {
        body: JSON.stringify({
          connectionString: String(form.get('connectionString') ?? '').trim(),
          id: editingDatabase?.id,
          name: String(form.get('name') ?? '').trim(),
          provider: databaseProvider,
          rejectUnauthorized: form.get('rejectUnauthorized') !== 'false',
        }),
        method: 'POST',
      })
      if (result.code === RESPONSE.SUCCESS) {
        toast.success(result.msg)
        setEditingDatabase(null)
        setDatabaseProvider('local-postgres')
        await load()
      }
    }
    finally {
      setSavingDatabase(false)
    }
  }

  const saveStorage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSavingStorage(true)
    try {
      const result = await request('/admin/infrastructure/storage-profiles', {
        body: JSON.stringify({
          appId: readFormValue(form, 'appId'),
          bucket: readFormValue(form, 'bucket'),
          cdnDomain: readFormValue(form, 'cdnDomain'),
          id: editingStorage?.id,
          name: readFormValue(form, 'name'),
          provider: storageProvider,
          region: readFormValue(form, 'region'),
          rootDirectory: readFormValue(form, 'rootDirectory'),
          secretId: readFormValue(form, 'secretId'),
          secretKey: readFormValue(form, 'secretKey'),
        }),
        method: 'POST',
      })
      if (result.code === RESPONSE.SUCCESS) {
        toast.success(result.msg)
        setEditingStorage(null)
        setStorageProvider('local-filesystem')
        await load()
      }
    }
    finally {
      setSavingStorage(false)
    }
  }

  const editDatabase = (profile: DatabaseProfile) => {
    setEditingDatabase(profile)
    setDatabaseProvider(profile.provider)
  }
  const cancelDatabaseEdit = () => {
    setEditingDatabase(null)
    setDatabaseProvider('local-postgres')
  }
  const editStorage = (profile: StorageProfile) => {
    setEditingStorage(profile)
    setStorageProvider(profile.provider)
  }
  const cancelStorageEdit = () => {
    setEditingStorage(null)
    setStorageProvider('local-filesystem')
  }

  if (loading && !overview) {
    return (
      <div className="grid min-h-72 place-items-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!overview) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>基础设施配置不可用</Alert.Title>
          <Alert.Description>请检查固定控制面 PostgreSQL 与配置加密密钥。</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="danger" onPress={() => void load()}>重试</Button>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="基础设施"
        actions={(
          <div data-ready={overview.activeUploads === 0} className="admin-connection-status">
            <span aria-hidden="true" />
            <div>
              <strong>{overview.activeUploads ? '正在处理上传' : '连接可切换'}</strong>
              <small>
                活动上传
                {overview.activeUploads}
                {' '}
                个
              </small>
            </div>
          </div>
        )}
        description="管理业务数据库与文件存储连接；切换配置不会复制或迁移现有数据。"
      />

      <Card className="admin-flat-panel overflow-hidden">
        <Card.Header className="border-b border-border p-0 pb-3">
          <Card.Title>连接组合</Card.Title>
        </Card.Header>
        <Card.Content className="grid gap-4 px-0 py-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <ProfileSelect
            label="业务 PostgreSQL"
            options={overview.databaseProfiles.map(item => ({ id: item.id, label: item.name, suffix: databaseProviderLabel(item.provider) }))}
            value={selectedDatabase}
            onChange={setSelectedDatabase}
          />
          <ProfileSelect
            label="默认文件存储"
            options={overview.storageProfiles.map(item => ({ id: item.id, label: item.name, suffix: storageProviderLabel(item.provider) }))}
            value={selectedStorage}
            onChange={setSelectedStorage}
          />
          <Button isDisabled={overview.activeUploads > 0} isPending={switching} onPress={() => void switchProfiles()}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : <PlugConnection />}
                应用连接组合
              </>
            )}
          </Button>
        </Card.Content>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <ProfilePanel
          title="数据库配置"
          profiles={overview.databaseProfiles.map(profile => ({
            active: profile.active,
            detail: `${profile.config.username}@${profile.config.host}:${profile.config.port}/${profile.config.database}`,
            id: profile.id,
            name: profile.name,
            provider: databaseProviderLabel(profile.provider),
            ready: profile.lastCheckOk,
          }))}
          onEdit={id => editDatabase(overview.databaseProfiles.find(item => item.id === id)!)}
        >
          <DatabaseProfileForm
            key={editingDatabase?.id ?? 'new-database'}
            editing={editingDatabase}
            provider={databaseProvider}
            saving={savingDatabase}
            onCancel={cancelDatabaseEdit}
            onProviderChange={setDatabaseProvider}
            onSubmit={saveDatabase}
          />
        </ProfilePanel>

        <ProfilePanel
          title="存储配置"
          profiles={overview.storageProfiles.map(profile => ({
            active: profile.active,
            detail: profile.provider === 'local-filesystem'
              ? profile.config.rootDirectory || ''
              : `${profile.config.bucket}-${profile.config.appId} / ${profile.config.region}`,
            id: profile.id,
            name: profile.name,
            provider: storageProviderLabel(profile.provider),
            ready: profile.lastCheckOk,
          }))}
          onEdit={id => editStorage(overview.storageProfiles.find(item => item.id === id)!)}
        >
          <StorageProfileForm
            key={editingStorage?.id ?? 'new-storage'}
            editing={editingStorage}
            provider={storageProvider}
            saving={savingStorage}
            onCancel={cancelStorageEdit}
            onProviderChange={setStorageProvider}
            onSubmit={saveStorage}
          />
        </ProfilePanel>
      </div>
    </div>
  )
}

function DatabaseProfileForm({ editing, onCancel, onProviderChange, onSubmit, provider, saving }: {
  editing: DatabaseProfile | null
  onCancel: () => void
  onProviderChange: (value: DatabaseProvider) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  provider: DatabaseProvider
  saving: boolean
}) {
  return (
    <Form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black">{editing ? `编辑：${editing.name}` : '新增数据库配置'}</p>
        {editing && <Button size="sm" variant="ghost" onPress={onCancel}>取消编辑</Button>}
      </div>
      <TextField name="name" isRequired defaultValue={editing?.name ?? ''} maxLength={80}>
        <Label>配置名称</Label>
        <Input variant="secondary" fullWidth placeholder="例如：本地业务库" />
        <FieldError />
      </TextField>
      <Select aria-label="数据库类型" name="provider" variant="secondary" value={provider} onChange={key => onProviderChange(String(key) as DatabaseProvider)}>
        <Label>数据库类型</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="local-postgres" textValue="本地 PostgreSQL">
              本地 PostgreSQL
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="tencent-postgres" textValue="腾讯云 PostgreSQL">
              腾讯云 PostgreSQL
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      <TextField name="connectionString" isRequired={!editing}>
        <Label>PostgreSQL 连接地址</Label>
        <Input type="password" variant="secondary" autoComplete="new-password" fullWidth placeholder={editing ? `留空保留（当前 ${editing.config.host}）` : 'postgresql://user:password@host:5432/database'} />
        <FieldError />
      </TextField>
      {provider === 'tencent-postgres' && (
        <Select aria-label="TLS 证书校验" name="rejectUnauthorized" variant="secondary" defaultValue={editing?.config.rejectUnauthorized === false ? 'false' : 'true'}>
          <Label>TLS 证书校验</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="true" textValue="严格校验证书">
                严格校验证书
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="false" textValue="不校验证书链">
                不校验证书链（仅兼容旧实例）
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      )}
      <Button type="submit" isPending={saving} fullWidth>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner color="current" size="sm" /> : <FloppyDisk />}
            {editing ? '校验并更新' : '校验、迁移并创建'}
          </>
        )}
      </Button>
    </Form>
  )
}

function databaseProviderLabel(provider: DatabaseProvider) {
  return provider === 'local-postgres' ? '本地 PostgreSQL' : '腾讯云 PostgreSQL'
}

function ProfilePanel({ children, onEdit, profiles, title }: {
  children: React.ReactNode
  onEdit: (id: string) => void
  profiles: { active: boolean, detail: string, id: string, name: string, provider: string, ready: boolean | null }[]
  title: string
}) {
  return (
    <Card className="admin-flat-panel overflow-hidden">
      <Card.Header className="border-b border-border p-0 pb-3">
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content className="divide-y divide-border border-b border-border px-0 py-2">
        {profiles.map(profile => (
          <div key={profile.id} className="flex items-start gap-3 py-3">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${profile.ready === false ? 'bg-danger' : 'bg-success'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-black">{profile.name}</p>
                {profile.active && <Chip size="sm" variant="soft">使用中</Chip>}
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-muted">{profile.provider}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{profile.detail}</p>
            </div>
            <Button size="sm" variant="tertiary" onPress={() => onEdit(profile.id)}>编辑</Button>
          </div>
        ))}
      </Card.Content>
      <Card.Content className="px-0 py-4">{children}</Card.Content>
    </Card>
  )
}

function ProfileSelect({ label, onChange, options, value }: {
  label: string
  onChange: (value: string) => void
  options: { id: string, label: string, suffix: string }[]
  value: string | null
}) {
  return (
    <Select aria-label={label} variant="secondary" fullWidth value={value} onChange={key => key && onChange(String(key))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(option => (
            <ListBox.Item key={option.id} id={option.id} textValue={`${option.label} ${option.suffix}`}>
              <span className="flex min-w-0 flex-col">
                <span className="font-bold">{option.label}</span>
                <span className="text-xs text-muted">{option.suffix}</span>
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

function readFormValue(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}

function SimpleField({ className, label, name, placeholder, required, type = 'text', value }: {
  className?: string
  label: string
  name: string
  placeholder?: string
  required?: boolean
  type?: 'password' | 'text'
  value?: string
}) {
  return (
    <TextField name={name} isRequired={required} defaultValue={value ?? ''} className={className}>
      <Label>{label}</Label>
      <Input type={type} variant="secondary" autoComplete={type === 'password' ? 'new-password' : 'off'} fullWidth placeholder={placeholder} />
      <FieldError />
    </TextField>
  )
}

function StorageProfileForm({ editing, onCancel, onProviderChange, onSubmit, provider, saving }: {
  editing: StorageProfile | null
  onCancel: () => void
  onProviderChange: (value: StorageProvider) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  provider: StorageProvider
  saving: boolean
}) {
  return (
    <Form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black">{editing ? `编辑：${editing.name}` : '新增存储配置'}</p>
        {editing && <Button size="sm" variant="ghost" onPress={onCancel}>取消编辑</Button>}
      </div>
      <TextField name="name" isRequired defaultValue={editing?.name ?? ''} maxLength={80}>
        <Label>配置名称</Label>
        <Input variant="secondary" fullWidth placeholder="例如：腾讯云文件存储" />
        <FieldError />
      </TextField>
      <Select aria-label="存储类型" name="provider" variant="secondary" value={provider} onChange={key => onProviderChange(String(key) as StorageProvider)}>
        <Label>存储类型</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="local-filesystem" textValue="本地文件目录">
              <HardDrive />
              本地文件目录
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="tencent-cos" textValue="腾讯云 COS">
              <Cloud />
              腾讯云 COS
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      {provider === 'local-filesystem'
        ? (
            <TextField name="rootDirectory" isRequired defaultValue={editing?.provider === provider ? editing.config.rootDirectory : ''}>
              <Label>持久化目录</Label>
              <Input variant="secondary" fullWidth placeholder="/data/hillm-nav/storage" />
              <FieldError />
            </TextField>
          )
        : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SimpleField name="appId" label="AppId" required value={editing?.provider === provider ? editing.config.appId : ''} />
              <SimpleField name="region" label="地域" placeholder="ap-guangzhou" required value={editing?.provider === provider ? editing.config.region : ''} />
              <SimpleField name="bucket" label="Bucket 名称（可不带 AppId）" required value={editing?.provider === provider ? editing.config.bucket : ''} className="sm:col-span-2" />
              <SimpleField name="secretId" label="SecretId" placeholder={editing ? '留空保留现有密钥' : ''} required={!editing} />
              <SimpleField name="secretKey" type="password" label="SecretKey" placeholder={editing ? '留空保留现有密钥' : ''} required={!editing} />
              <SimpleField name="cdnDomain" label="CDN 域名（可选）" placeholder="files.example.com" value={editing?.provider === provider ? editing.config.cdnDomain : ''} className="sm:col-span-2" />
            </div>
          )}
      <Button type="submit" isPending={saving} fullWidth>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner color="current" size="sm" /> : <FloppyDisk />}
            {editing ? '读写校验并更新' : '读写校验并创建'}
          </>
        )}
      </Button>
    </Form>
  )
}

function storageProviderLabel(provider: StorageProvider) {
  return provider === 'local-filesystem' ? '本地文件目录' : '腾讯云 COS'
}
