set local search_path = auth, public;

create index if not exists user_role_status_idx
  on auth."user" (role, status);

create index if not exists user_created_at_idx
  on auth."user" ("createdAt" desc);
