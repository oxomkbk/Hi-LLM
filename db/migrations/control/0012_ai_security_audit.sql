alter table control.audit_logs
  add column external_event_id uuid;

create unique index audit_logs_external_event_id_idx
  on control.audit_logs (external_event_id)
  where external_event_id is not null;
