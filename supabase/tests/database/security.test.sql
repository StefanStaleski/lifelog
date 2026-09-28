-- Run with `supabase test db`. Guards the "RLS on every table, no public access" rule.
begin;
select plan(12);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has RLS enabled'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public'),
  0,
  'no RLS policies exist (server code only)'
);

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')),
  0,
  'anon and authenticated have no table privileges'
);

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'anon and authenticated cannot execute public functions'
);

-- Phase 5 tables exist with RLS on (the checks above then cover their privileges).
select is(
  (select count(*)::int from pg_tables
    where schemaname = 'public' and rowsecurity
      and tablename in ('desktop_usage', 'calls', 'sms_messages', 'message_counts', 'people',
                        'work_settings', 'app_tags', 'server_secrets', 'app_usage_windows')),
  9,
  'phase 5 tables exist with RLS enabled'
);

select results_eq(
  'select days, start_local, end_local, untagged_desktop_is_work from public.work_settings',
  $$values ('{1,2,3,4,5}'::integer[], '09:00'::time, '17:00'::time, true)$$,
  'work_settings has the single default row'
);

select ok(
  (select count(*) = 1 and bool_and(contact_salt ~ '^[0-9a-f]{64}$') from public.server_secrets),
  'server_secrets holds one random 64-hex contact salt'
);

select throws_ok(
  'insert into public.work_settings (id) values (2)',
  '23514',
  null,
  'work_settings stays a single row'
);

set local role anon;
select throws_ok(
  'select * from public.events',
  '42501',
  null,
  'anon cannot read events'
);

select throws_ok(
  'select * from public.server_secrets',
  '42501',
  null,
  'anon cannot read the contact salt'
);

select throws_ok(
  'select * from public.people',
  '42501',
  null,
  'anon cannot read people'
);

reset role;
set local role authenticated;
select throws_ok(
  'select * from public.message_counts',
  '42501',
  null,
  'authenticated cannot read message counts'
);

select * from finish();
rollback;
