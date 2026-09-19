-- Compatibility marker for a historical advisory-report copy update.
-- The update only affected rows that existed before this version; fresh
-- databases have no historical reports to transform. Keep the version so the
-- repository and existing migration ledgers remain comparable.
select 1;
