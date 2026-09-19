-- This migration number was used by a private deployment to publish two
-- installation-specific acknowledgement images. Public installations do not
-- have those file records, so the migration intentionally performs no data
-- mutation while preserving the append-only migration sequence.
select 1;
