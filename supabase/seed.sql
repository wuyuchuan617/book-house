-- V1 固定主題標籤（清單內容待 PM 確認，見 PRD 第 11 節）
insert into public.tags (slug, name, kind, sort) values
  ('nature',   '自然與動物', 'system', 10),
  ('life',     '生活',       'system', 20),
  ('business', '創業',       'system', 30),
  ('science',  '科普',       'system', 40),
  ('fiction',  '小說',       'system', 50),
  ('essay',    '散文',       'system', 60),
  ('history',  '歷史',       'system', 70),
  ('art',      '藝術與設計', 'system', 80)
on conflict (slug) do nothing;
