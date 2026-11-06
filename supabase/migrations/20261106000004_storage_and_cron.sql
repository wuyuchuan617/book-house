-- Storage buckets 與排程。兩者都依賴 Supabase 平台；本機測試環境沒有時自動略過。

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('store-avatars', 'store-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
      ('store-banners', 'store-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
      ('og-images',     'og-images',     true, 2097152, array['image/png'])
    on conflict (id) do nothing;

    -- 路徑第一段必須是自己書店的 id：{bookstore_id}/{uuid}.webp
    execute $p$
      create policy store_images_write on storage.objects for insert to authenticated
      with check (bucket_id in ('store-avatars', 'store-banners')
                  and (storage.foldername(name))[1] = public.my_bookstore_id()::text)
    $p$;
    execute $p$
      create policy store_images_update on storage.objects for update to authenticated
      using (bucket_id in ('store-avatars', 'store-banners')
             and (storage.foldername(name))[1] = public.my_bookstore_id()::text)
    $p$;
    execute $p$
      create policy store_images_delete on storage.objects for delete to authenticated
      using (bucket_id in ('store-avatars', 'store-banners')
             and (storage.foldername(name))[1] = public.my_bookstore_id()::text)
    $p$;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- 每天 03:00（Asia/Taipei = 19:00 UTC）刪除申請超過 30 天的帳號
    perform cron.schedule('purge-deleted-accounts', '0 19 * * *', 'select public.purge_deleted_accounts()');
  end if;
end $$;
