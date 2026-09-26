-- Run with `supabase test db`. Guards the "RLS on every table, no public access" rule.
begin;
select plan(5);

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

set local role anon;
select throws_ok(
  'select * from public.events',
  '42501',
  null,
  'anon cannot read events'
);

select * from finish();
rollback;
