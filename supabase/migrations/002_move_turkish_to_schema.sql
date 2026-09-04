-- Keep Turkish-specific database objects isolated from the shared public schema.
create schema if not exists turkish;

grant usage on schema turkish to anon, authenticated, service_role;

alter table if exists public.turkish_words
  set schema turkish;

alter table if exists public.turkish_meanings
  set schema turkish;

alter sequence if exists public.turkish_words_id_seq
  set schema turkish;

alter sequence if exists public.turkish_meanings_id_seq
  set schema turkish;

alter function public.save_turkish_words_batch(jsonb)
  set schema turkish;

alter function public.turkish_words_set_updated_at()
  set schema turkish;

alter function public.turkish_meanings_set_updated_at()
  set schema turkish;

alter function public.turkish_meanings_touch_word()
  set schema turkish;

-- ALTER ... SET SCHEMA preserves function bodies verbatim. Rewrite the
-- qualified references that used to point at public.
do $$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'turkish'
      and p.proname in (
        'save_turkish_words_batch',
        'delete_all_turkish_words',
        'turkish_words_set_updated_at',
        'turkish_meanings_set_updated_at',
        'turkish_meanings_touch_word'
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(v_definition, 'public.turkish_words', 'turkish.turkish_words');
    v_definition := replace(v_definition, 'public.turkish_meanings', 'turkish.turkish_meanings');
    execute v_definition;
  end loop;
end;
$$;

create or replace function turkish.delete_all_turkish_words()
returns void
language plpgsql
security invoker
set search_path = public, turkish
as $$
begin
  delete from turkish.turkish_words;

  update public.settings
  set turkish_words_total = 0
  where id = 1;
end;
$$;

drop function if exists public.delete_all_turkish_words();

grant select, insert, update, delete on all tables in schema turkish
  to authenticated;

grant usage, select on all sequences in schema turkish
  to authenticated;

grant execute on function turkish.save_turkish_words_batch(jsonb)
  to authenticated;

grant execute on function turkish.delete_all_turkish_words()
  to authenticated;

-- The cleanup function is shared, but Turkish tables now live in their own schema.
create or replace function public.truncate_all_except_settings()
returns jsonb
language plpgsql
security invoker
set search_path = public, turkish
as $$
begin
  truncate turkish.turkish_meanings cascade;
  truncate turkish.turkish_words cascade;
  truncate public.english_words cascade;

  update public.settings
  set
    turkish_words_total = 0,
    msa_words_total = 0,
    chinese_words_total = 0
  where id = 1;

  return jsonb_build_object(
    'success', true,
    'message', 'Todas as tabelas foram limpas com sucesso',
    'tables_truncated', array[
      'turkish.turkish_meanings',
      'turkish.turkish_words',
      'public.english_words'
    ],
    'settings', 'Zerada (exceto id)'
  );
end;
$$;
