create table control.email_settings (
  id boolean primary key default true check (id = true),
  provider text not null default 'smtp' check (provider = 'smtp'),
  host text not null,
  port integer not null check (port between 1 and 65535),
  encryption text not null check (encryption in ('tls', 'starttls')),
  username text not null,
  from_email text not null,
  from_name text not null,
  encrypted_password jsonb not null,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger email_settings_set_updated_at
before update on control.email_settings
for each row execute function control.set_updated_at();

revoke all on control.email_settings from public;
