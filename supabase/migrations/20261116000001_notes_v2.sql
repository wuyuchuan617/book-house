-- M11 心得改版：類型（摘句／心得／想法）、標題、頁碼、圖片、是否來自掃描
alter table public.reading_notes
  add column if not exists kind       text not null default 'reflection' check (kind in ('quote', 'reflection', 'thought')),
  add column if not exists title      text check (char_length(title) between 1 and 40),
  add column if not exists page_ref   text check (char_length(page_ref) between 1 and 20),
  add column if not exists photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  add column if not exists from_scan  boolean not null default false;

-- 頁碼只給摘句
alter table public.reading_notes drop constraint if exists reading_notes_page_ref_quote;
alter table public.reading_notes add constraint reading_notes_page_ref_quote check (page_ref is null or kind = 'quote');

-- 內容過濾也套用到標題
drop trigger if exists reading_notes_content on public.reading_notes;
create trigger reading_notes_content before insert or update of body, title on public.reading_notes
  for each row execute function public.guard_content('body', 'title');

-- 圖片：非公開 bucket，路徑 {bookstore_id}/{note_id}/{n}.jpg
-- 讀取：看得到這則心得的人（reading_notes 的 RLS 決定：店主本人，或公開、書店可見、沒有封鎖）
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('note-images', 'note-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy note_images_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'note-images'
             and exists (select 1 from public.reading_notes n where n.id::text = (storage.foldername(name))[2]))
    $p$;
    execute $p$
      create policy note_images_write on storage.objects for insert to authenticated
      with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = public.my_bookstore_id()::text)
    $p$;
    execute $p$
      create policy note_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'note-images' and (storage.foldername(name))[1] = public.my_bookstore_id()::text)
    $p$;
  end if;
end $$;
