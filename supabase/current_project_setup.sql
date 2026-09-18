-- =====================================================================
-- إعداد قاعدة برنامج المحاسبة للمطابع - للمشروع الحالي
-- هذا الملف لا يحذف أي جدول أو بيانات موجودة.
-- شغّله مرة واحدة في SQL Editor للمشروع الصحيح.
-- قبل الاختبار: فعّل Authentication > Sign In / Providers > Anonymous Sign-Ins.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) نظام التحقق بالرمز السري
-- ---------------------------------------------------------------------
create table if not exists public.app_secret (
  id boolean primary key default true,
  code_hash text,
  constraint app_secret_singleton check (id = true)
);

insert into public.app_secret (id, code_hash)
values (true, null)
on conflict (id) do nothing;

create table if not exists public.access_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);

create table if not exists public.access_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists access_attempts_user_time_idx
  on public.access_attempts (user_id, attempted_at desc);

alter table public.app_secret enable row level security;
alter table public.access_verifications enable row level security;
alter table public.access_attempts enable row level security;

revoke all on public.app_secret from anon, authenticated;
revoke all on public.access_verifications from anon, authenticated;
revoke all on public.access_attempts from anon, authenticated;

create or replace function public.is_verified()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.access_verifications av
    where av.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_verified() from public, anon;
grant execute on function public.is_verified() to authenticated;

create or replace function public.verify_access_code(input_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_recent_attempts integer;
begin
  if v_uid is null then
    return false;
  end if;

  -- منع التوازي لنفس المستخدم أثناء فحص الرمز.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select count(*)
    into v_recent_attempts
  from public.access_attempts
  where user_id = v_uid
    and attempted_at > now() - interval '15 minutes';

  if v_recent_attempts >= 5 then
    return false;
  end if;

  select code_hash into v_hash
  from public.app_secret
  where id = true;

  if v_hash is null or input_code is null or length(trim(input_code)) = 0 then
    insert into public.access_attempts(user_id) values (v_uid);
    return false;
  end if;

  if crypt(trim(input_code), v_hash) <> v_hash then
    insert into public.access_attempts(user_id) values (v_uid);
    return false;
  end if;

  insert into public.access_verifications(user_id, verified_at)
  values (v_uid, now())
  on conflict (user_id) do update
    set verified_at = excluded.verified_at;

  delete from public.access_attempts where user_id = v_uid;
  return true;
end;
$$;

revoke all on function public.verify_access_code(text) from public, anon;
grant execute on function public.verify_access_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) توليد رقم طلب العمل بأمان نسبيًا عند تعدد الأجهزة.
-- ---------------------------------------------------------------------
create or replace function public.next_work_order_no()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next bigint;
begin
  perform pg_advisory_xact_lock(hashtext('program_accounting_work_order_no'));
  select coalesce(max(order_no), 0) + 1 into v_next from public.work_orders;
  return v_next;
end;
$$;

revoke all on function public.next_work_order_no() from public, anon;
grant execute on function public.next_work_order_no() to authenticated;

-- ---------------------------------------------------------------------
-- 3) RLS للجداول الحالية.
-- لا توجد بيانات تشغيلية حالية في هذه الجداول وفق الفحص الذي أجريناه.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'income', 'expenses', 'work_orders', 'work_order_payments', 'services',
    'inventory_items', 'inventory_movements', 'settings', 'income_types',
    'expense_types', 'order_statuses', 'paper_sizes', 'payment_methods',
    'print_types'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "verified_select_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "verified_insert_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "verified_update_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "verified_delete_%1$s" on public.%1$s', t);

    execute format('create policy "verified_select_%1$s" on public.%1$s for select to authenticated using ((select public.is_verified()))', t);
    execute format('create policy "verified_insert_%1$s" on public.%1$s for insert to authenticated with check ((select public.is_verified()))', t);
    execute format('create policy "verified_update_%1$s" on public.%1$s for update to authenticated using ((select public.is_verified())) with check ((select public.is_verified()))', t);
    execute format('create policy "verified_delete_%1$s" on public.%1$s for delete to authenticated using ((select public.is_verified()))', t);
  end loop;
end $$;

-- سجل العمليات: قراءة وإضافة فقط بعد التحقق.
alter table public.audit_logs enable row level security;
drop policy if exists "verified_select_audit_logs" on public.audit_logs;
drop policy if exists "verified_insert_audit_logs" on public.audit_logs;
drop policy if exists "verified_update_audit_logs" on public.audit_logs;
drop policy if exists "verified_delete_audit_logs" on public.audit_logs;
create policy "verified_select_audit_logs" on public.audit_logs
  for select to authenticated using ((select public.is_verified()));
create policy "verified_insert_audit_logs" on public.audit_logs
  for insert to authenticated with check ((select public.is_verified()));

-- ---------------------------------------------------------------------
-- 4) تشديد صلاحيات Data API: لا نعطي anon وصولًا للجداول التشغيلية.
-- authenticated يحصل على ما يحتاجه بعد RLS.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.income,
  public.expenses,
  public.work_orders,
  public.work_order_payments,
  public.services,
  public.inventory_items,
  public.inventory_movements,
  public.settings,
  public.income_types,
  public.expense_types,
  public.order_statuses,
  public.paper_sizes,
  public.payment_methods,
  public.print_types,
  public.audit_logs
  to authenticated;

-- ---------------------------------------------------------------------
-- 5) إبقاء كلمة السر خارج المشروع.
-- بعد تشغيل الملف، نفّذ هذا السطر منفصلًا مع استبدال PLACEHOLDER
-- بالرمز الحقيقي. لا تضع الرمز الحقيقي في GitHub أو ملفات المشروع.
--
-- update public.app_secret
-- set code_hash = crypt('PLACEHOLDER', gen_salt('bf'))
-- where id = true;
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 6) مزامنة دفعات طلبات العمل مع paid_amount / remaining_amount
-- ---------------------------------------------------------------------
create or replace function public.recalculate_work_order_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_total numeric;
  v_paid numeric;
begin
  v_order_id := coalesce(NEW.work_order_id, OLD.work_order_id);
  if v_order_id is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select net_total into v_total from public.work_orders where id = v_order_id for update;
  if v_total is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select coalesce(sum(amount),0) into v_paid
  from public.work_order_payments
  where work_order_id = v_order_id;

  if v_paid > v_total then
    raise exception 'مجموع الدفعات يتجاوز صافي الطلب';
  end if;

  update public.work_orders
  set paid_amount = v_paid,
      remaining_amount = greatest(v_total - v_paid, 0),
      payment_status = case
        when v_paid <= 0 then 'unpaid'
        when v_paid < v_total then 'partial'
        else 'paid'
      end,
      updated_at = now()
  where id = v_order_id;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create or replace function public.check_work_order_payment_before_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
  v_paid_before numeric;
  v_new_total numeric;
begin
  select net_total into v_total from public.work_orders where id = NEW.work_order_id for update;
  if v_total is null then
    raise exception 'طلب العمل غير موجود';
  end if;

  select coalesce(sum(amount),0) into v_paid_before
  from public.work_order_payments
  where work_order_id = NEW.work_order_id
    and id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_new_total := v_paid_before + NEW.amount;
  if NEW.amount <= 0 then
    raise exception 'قيمة الدفعة يجب أن تكون أكبر من صفر';
  end if;
  if v_new_total > v_total then
    raise exception 'قيمة الدفعة تتجاوز المبلغ المتبقي للطلب';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_check_work_order_payment on public.work_order_payments;
create trigger trg_check_work_order_payment
before insert or update on public.work_order_payments
for each row execute function public.check_work_order_payment_before_change();

drop trigger if exists trg_recalculate_work_order_payment_totals on public.work_order_payments;
create trigger trg_recalculate_work_order_payment_totals
after insert or update or delete on public.work_order_payments
for each row execute function public.recalculate_work_order_payment_totals();

-- ---------------------------------------------------------------------
-- 7) تطبيق حركات المخزون على الكمية الحالية بشكل ذري.
-- ---------------------------------------------------------------------
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty numeric;
  v_delta numeric;
begin
  if NEW.quantity <= 0 then
    raise exception 'كمية حركة المخزون يجب أن تكون أكبر من صفر';
  end if;
  if NEW.movement_type not in ('in','out') then
    raise exception 'نوع حركة المخزون يجب أن يكون in أو out';
  end if;

  v_delta := case when NEW.movement_type = 'in' then NEW.quantity else -NEW.quantity end;
  select current_quantity into v_qty
  from public.inventory_items
  where id = NEW.inventory_item_id
  for update;

  if v_qty is null then
    raise exception 'صنف المخزون غير موجود';
  end if;
  if v_qty + v_delta < 0 then
    raise exception 'لا يمكن صرف كمية أكبر من المخزون الحالي';
  end if;

  update public.inventory_items
  set current_quantity = current_quantity + v_delta,
      updated_at = now()
  where id = NEW.inventory_item_id;

  return NEW;
end;
$$;

create or replace function public.reverse_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delta numeric;
  v_new_qty numeric;
begin
  v_delta := case when OLD.movement_type = 'in' then -OLD.quantity else OLD.quantity end;
  select current_quantity + v_delta into v_new_qty
  from public.inventory_items where id = OLD.inventory_item_id for update;
  if v_new_qty < 0 then
    raise exception 'لا يمكن حذف الحركة لأن ذلك سيجعل المخزون سالبًا';
  end if;
  update public.inventory_items set current_quantity = v_new_qty, updated_at = now() where id = OLD.inventory_item_id;
  return OLD;
end;
$$;

drop trigger if exists trg_apply_inventory_movement on public.inventory_movements;
create trigger trg_apply_inventory_movement
after insert on public.inventory_movements
for each row execute function public.apply_inventory_movement();

drop trigger if exists trg_reverse_inventory_movement on public.inventory_movements;
create trigger trg_reverse_inventory_movement
after delete on public.inventory_movements
for each row execute function public.reverse_inventory_movement();

revoke all on function public.recalculate_work_order_payment_totals() from public, anon, authenticated;
revoke all on function public.check_work_order_payment_before_change() from public, anon, authenticated;
revoke all on function public.apply_inventory_movement() from public, anon, authenticated;
revoke all on function public.reverse_inventory_movement() from public, anon, authenticated;
