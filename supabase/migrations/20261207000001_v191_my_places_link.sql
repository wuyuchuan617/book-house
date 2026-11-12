-- v1.9.1 書櫃 › 地方（L3）：想去卡片顯示存想去時貼的連結
-- my_places() 多回傳 link（place_saves.link，只有自己看得到）；回傳欄位變了，要先 drop 再建
drop function if exists public.my_places(text);

create function public.my_places(p_kind text default 'want')
returns table (id uuid, name text, address text, category text, is_indie boolean, saved boolean, note text,
               saved_at timestamptz, my_checkins int, last_visit date, checkin_count int, photo_paths text[],
               link text)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select e.place_id, count(*)::int as n, max(e.entry_date) as last
    from public.diary_entries e where e.user_id = auth.uid() and e.place_id is not null group by e.place_id
  ),
  picked as (
    select s.place_id from public.place_saves s
    where p_kind = 'want' and s.user_id = auth.uid() and not exists (select 1 from mine m where m.place_id = s.place_id)
    union
    select m.place_id from mine m where p_kind = 'visited'
  )
  select pl.id, pl.name, pl.address, public.place_category(pl.id), public.place_category(pl.id) = 'indie',
         s.user_id is not null, s.note, s.created_at,
         coalesce(m.n, 0), m.last,
         (select count(*)::int from public.public_checkins c where c.place_id = pl.id),
         coalesce((select e.photo_paths from public.diary_entries e
                   where e.place_id = pl.id and e.user_id = auth.uid() and cardinality(e.photo_paths) > 0
                   order by e.created_at desc limit 1),
                  (select c.photo_paths from public.public_checkins c
                   where c.place_id = pl.id and cardinality(c.photo_paths) > 0 order by c.entry_date desc limit 1), '{}'),
         s.link
  from picked p
  join public.places pl on pl.id = p.place_id
  left join public.place_saves s on s.place_id = pl.id and s.user_id = auth.uid()
  left join mine m on m.place_id = pl.id
  order by coalesce(m.last::timestamptz, s.created_at) desc nulls last
$$;

revoke execute on function public.my_places(text) from public, anon;
grant execute on function public.my_places(text) to authenticated;
