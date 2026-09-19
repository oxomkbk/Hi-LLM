-- Keep structured source fields for Skills, but remove repetitive editorial
-- provenance text from the public summary and description.
update public.ds_skills
set
  summary = regexp_replace(summary, E'\\s+来源\\s+.*$', ''),
  description = case
    when position(E'\n\n## 来源与热度\n' in description) > 0
      and position(E'\n\n## 使用提醒\n' in description) > 0
      then split_part(description, E'\n\n## 来源与热度\n', 1)
        || E'\n\n## 使用提醒\n'
        || split_part(description, E'\n\n## 使用提醒\n', 2)
    when position(E'\n\n## 来源与热度\n' in description) > 0
      then split_part(description, E'\n\n## 来源与热度\n', 1)
    else description
  end,
  updated_at = now()
where homepage_url like 'https://skills.sh/%'
  and (
    summary ~ E'\\s+来源\\s+'
    or position(E'\n\n## 来源与热度\n' in description) > 0
  );

-- The earlier catalog import marked too many sites as recommended. Start from
-- a clean editorial state; future recommendations remain available in admin.
update public.ds_websites
set recommend = false, updated_at = now()
where recommend = true;

-- Match the index to the public ordering: pinned, recommended, manual sort.
drop index if exists public.ds_websites_category_order_idx;
create index ds_websites_category_order_idx on public.ds_websites
  (category_id, pinned desc, recommend desc, sort desc, created_at desc);
