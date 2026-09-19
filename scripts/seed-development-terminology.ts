import { Pool } from 'pg'

import { DEVELOPMENT_TERMINOLOGY_COLLECTIONS } from '../src/lib/prompts/development-terminology-data'
import { seedDevelopmentTerminology } from '../src/lib/prompts/development-terminology-seed'

const connectionString = process.env.BUSINESS_DATABASE_URL?.trim()
if (!connectionString)
  throw new Error('缺少 BUSINESS_DATABASE_URL')

const pool = new Pool({
  application_name: 'hillm-nav-development-terminology-seed',
  connectionString,
  max: 1,
  statement_timeout: 30_000,
})
const client = await pool.connect()

try {
  await client.query('begin')
  if (process.argv.includes('--upgrade-previews')) {
    for (const collection of DEVELOPMENT_TERMINOLOGY_COLLECTIONS) {
      const archived = await client.query(`
        update public.ds_prompts
        set status = 'archived'
        where slug = $1
          and source_import_id = $2::uuid
          and status = 'published'
      `, [collection.slug, collection.sourceImportId])
      if (archived.rowCount !== 1)
        throw new Error(`托管术语合集状态不一致，已回滚：${collection.slug}`)
    }
  }
  const result = await seedDevelopmentTerminology(client)
  await client.query('commit')
  console.log(JSON.stringify(result, null, 2))
}
catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
}
finally {
  client.release()
  await pool.end()
}
