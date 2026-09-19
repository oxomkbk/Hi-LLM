set local search_path = auth, public;

create table auth."user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  check (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

create table auth."session" (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references auth."user"(id) on delete cascade
);

create index session_user_id_idx on auth."session" ("userId");
create index session_expires_at_idx on auth."session" ("expiresAt");

create table auth.account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references auth."user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("providerId", "accountId")
);

create index account_user_id_idx on auth.account ("userId");

create table auth.verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index verification_identifier_idx on auth.verification (identifier);

create table auth."rateLimit" (
  id text primary key,
  key text not null unique,
  count integer not null,
  "lastRequest" bigint not null
);

create or replace function auth.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."updatedAt" := now();
  return new;
end;
$$;

create trigger user_set_updated_at before update on auth."user"
for each row execute function auth.set_updated_at();
create trigger session_set_updated_at before update on auth."session"
for each row execute function auth.set_updated_at();
create trigger account_set_updated_at before update on auth.account
for each row execute function auth.set_updated_at();
create trigger verification_set_updated_at before update on auth.verification
for each row execute function auth.set_updated_at();

revoke all on all tables in schema auth from public;
revoke all on all sequences in schema auth from public;
revoke all on all functions in schema auth from public;
