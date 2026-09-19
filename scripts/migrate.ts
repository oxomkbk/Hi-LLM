import { runMigrations } from '../src/lib/db/migrator'

const scope = process.argv[2] ?? 'all'

if (!['all', 'business', 'control'].includes(scope))
  throw new Error('迁移范围必须是 all、control 或 business')

if (scope === 'all' || scope === 'control') {
  const url = process.env.CONTROL_DATABASE_URL
  if (!url)
    throw new Error('缺少 CONTROL_DATABASE_URL')
  await runMigrations('control', url)
  console.log('控制面数据库迁移完成')
}

if (scope === 'all' || scope === 'business') {
  const url = process.env.BUSINESS_DATABASE_URL
  if (!url)
    throw new Error('缺少 BUSINESS_DATABASE_URL')
  await runMigrations('business', url)
  console.log('业务数据库迁移完成')
}
