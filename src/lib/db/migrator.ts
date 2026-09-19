import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { Pool } from 'pg'

import type { PoolConfig } from 'pg'

export type MigrationScope = 'business' | 'control'

export async function runMigrations(
  scope: MigrationScope,
  connectionString: string,
  options: Pick<PoolConfig, 'ssl'> = {},
) {
  const directory = path.join(process.cwd(), 'db', 'migrations', scope)
  const files = (await readdir(directory))
    .filter(file => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
  const pool = new Pool({
    connectionString,
    application_name: `hillm-nav-migrate-${scope}`,
    max: 1,
    ...options,
  })
  const client = await pool.connect()

  try {
    await client.query(`
      do $$
      begin
        if to_regclass('public.hillm_nav_schema_migrations') is null
          and to_regclass('public.better_nav_schema_migrations') is not null then
          alter table public.better_nav_schema_migrations rename to hillm_nav_schema_migrations;
        end if;
      end
      $$;

      create table if not exists public.hillm_nav_schema_migrations (
        scope text not null,
        version text not null,
        applied_at timestamptz not null default now(),
        primary key (scope, version)
      )
    `)

    const applied = await client.query<{ version: string }>(
      'select version from public.hillm_nav_schema_migrations where scope = $1',
      [scope],
    )
    const appliedVersions = new Set(applied.rows.map(row => row.version))

    for (const file of files) {
      if (appliedVersions.has(file))
        continue

      const migration = await readFile(path.join(directory, file), 'utf8')
      await client.query('begin')
      try {
        await client.query(migration)
        await client.query(
          'insert into public.hillm_nav_schema_migrations (scope, version) values ($1, $2)',
          [scope, file],
        )
        await client.query('commit')
      }
      catch (error) {
        await client.query('rollback')
        throw new Error(`${scope} 迁移 ${file} 失败`, { cause: error })
      }
    }
  }
  finally {
    client.release()
    await pool.end()
  }
}
