-- v1.5 店主手記的編輯、刪除：處方簽還沒有人開才能改內容（避免大家的回答對不上題目）

create or replace function public.guard_prescription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if public.content_violation(new.title) or public.content_violation(new.body) then
    raise exception 'content not allowed' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.closes_at := now() + make_interval(days => new.duration_days);
    new.closed_at := null;
    new.extended := false;
    if (select count(*) from public.prescriptions p
        where p.user_id = new.user_id and p.closed_at is null and p.closes_at > now()) >= 3 then
      raise exception 'too many open prescriptions' using errcode = '23514';
    end if;
  elsif (new.title, new.body, new.tags) is distinct from (old.title, old.body, old.tags)
        and exists (select 1 from public.prescription_replies r where r.prescription_id = new.id) then
    raise exception 'prescription already has replies' using errcode = '23514';
  end if;
  return new;
end $$;
