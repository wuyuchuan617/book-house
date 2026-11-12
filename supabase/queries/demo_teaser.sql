-- 示範資料：一間「示範書店」，下個月的策展開了預告（探索 › 策展最上面的「即將上架」會出現）。
-- 用法：貼到 Supabase Dashboard › SQL Editor 執行；可以重複執行（會先清掉舊的示範資料）。
-- 拿掉：執行最下面那三行 delete。
-- 預告不會顯示自己書店的，所以用另一個示範帳號。

delete from public.curations where bookstore_id in (select id from public.bookstores where owner_id = '00000000-0000-4000-a000-00000000d001');
delete from public.books where created_by = '00000000-0000-4000-a000-00000000d001';
delete from auth.users where id = '00000000-0000-4000-a000-00000000d001';

do $$
declare
  u uuid := '00000000-0000-4000-a000-00000000d001';
  s uuid;
  c uuid;
  b uuid[] := '{}';
  t text[] := array['夜晚的觀星手冊', '冬季星座故事集', '寒夜裡的一盞燈', '睡前讀一首詩'];
  a text[] := array['林星河', '周北辰', '陳冬至', '許夜'];
  i int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (u, 'demo-teaser@bookhaus.example', '{"name":"示範書店"}');
  select id into s from public.bookstores where owner_id = u;
  update public.bookstores
     set name = '冬日示範書店', slug = 'demo-winter', tagline = '這是示範資料，用來看「即將上架」的樣子。', color = 'olive', status = 'active', setup_done = true
   where id = s;

  for i in 1..4 loop
    insert into public.books (source, title, authors, created_by) values ('manual', t[i], array[a[i]], u) returning id into c;
    b := b || c;
  end loop;

  insert into public.curations (bookstore_id, period, title, description)
  values (s, (date_trunc('month', (now() at time zone 'Asia/Taipei')) + interval '1 month')::date,
          '冬天的星空指南', '天冷適合早睡早起看星星。這次選了 4 本，有一本是絕版重出的。')
  returning id into c;

  for i in 1..4 loop
    insert into public.curation_items (curation_id, book_id, position, note) values (c, b[i], i - 1, '示範推薦理由');
  end loop;

  -- 先公開前兩本
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform public.set_teaser(c, true, '天冷適合早睡早起看星星。這次有一本是絕版重出的。',
                            array(select id from public.curation_items where curation_id = c order by position limit 2));
end $$;

select public.teaser_json(c) from public.curations c where c.title = '冬天的星空指南' and c.teaser_on;

-- 拿掉示範資料（三行一起執行）：
-- delete from public.curations where bookstore_id in (select id from public.bookstores where owner_id = '00000000-0000-4000-a000-00000000d001');
-- delete from public.books where created_by = '00000000-0000-4000-a000-00000000d001';
-- delete from auth.users where id = '00000000-0000-4000-a000-00000000d001';
