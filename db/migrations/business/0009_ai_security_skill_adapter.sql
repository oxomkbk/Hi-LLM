-- Compatibility marker for an early Skill adapter configuration migration.
-- Migration 0012 replaces the complete adapter configuration, so a fresh
-- database does not need to replay the historical intermediate data update.
-- Keep this version to align new migration ledgers with existing databases.
select 1;
