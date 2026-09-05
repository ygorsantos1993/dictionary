create table if not exists turkish.settings (
  id smallint not null,
  turkish_words_total integer not null default 0,
  constraint turkish_settings_pkey primary key (id),
  constraint turkish_settings_single_row_check check (id = 1)
);

insert into turkish.settings (id, turkish_words_total)
select 1, coalesce(turkish_words_total, 0)
from public.settings
where id = 1
on conflict (id) do update
  set turkish_words_total = excluded.turkish_words_total;

alter table public.settings
  drop column if exists turkish_words_total;

grant select, insert, update, delete on table turkish.settings
  to authenticated;

grant usage, select on all sequences in schema turkish
  to authenticated;

create or replace function turkish.save_turkish_words_batch(
  p_words jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, turkish
as $$
declare
  v_word jsonb;
  v_meaning jsonb;
  v_word_id integer;
  v_saved_ids integer[] := '{}';
  v_total integer;
begin
  if p_words is null
     or jsonb_typeof(p_words) <> 'array'
     or jsonb_array_length(p_words) = 0 then
    raise exception 'No words were provided.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('dictionary.turkish_words.next_id', 0)
  );

  for v_word in select value from jsonb_array_elements(p_words)
  loop
    if nullif(btrim(v_word ->> 'word'), '') is null then
      raise exception 'A word is missing.';
    end if;

    if coalesce((v_word ->> 'etymology')::smallint, 0) < 1 then
      raise exception 'Invalid etymology for word "%".', v_word ->> 'word';
    end if;

    if jsonb_typeof(coalesce(v_word -> 'meanings', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_word -> 'meanings', '[]'::jsonb)) = 0 then
      raise exception 'Word "%" has no selected meanings.', v_word ->> 'word';
    end if;

    insert into turkish.turkish_words (
      id, word, etymology, pronunciation, forms, notes, analysis,
      base_word_id, alternative_forms
    )
    overriding system value
    values (
      (select coalesce(max(id), 0) + 1 from turkish.turkish_words),
      v_word ->> 'word',
      (v_word ->> 'etymology')::smallint,
      nullif(v_word -> 'pronunciation', 'null'::jsonb),
      nullif(v_word -> 'forms', 'null'::jsonb),
      nullif(v_word -> 'notes', 'null'::jsonb),
      nullif(v_word -> 'analysis', 'null'::jsonb),
      nullif(v_word ->> 'base_word_id', '')::integer,
      nullif(v_word -> 'alternative_forms', 'null'::jsonb)
    )
    returning id into v_word_id;

    v_saved_ids := array_append(v_saved_ids, v_word_id);

    for v_meaning in select value from jsonb_array_elements(v_word -> 'meanings')
    loop
      insert into turkish.turkish_meanings (
        word_id, part_of_speech, position, usage_label, meaning, examples
      )
      values (
        v_word_id,
        v_meaning ->> 'part_of_speech',
        (v_meaning ->> 'position')::smallint,
        nullif(btrim(v_meaning ->> 'usage_label'), ''),
        v_meaning ->> 'meaning',
        nullif(v_meaning -> 'examples', 'null'::jsonb)
      );
    end loop;
  end loop;

  select count(*)::integer
  into v_total
  from turkish.turkish_words;

  update turkish.settings
  set turkish_words_total = v_total
  where id = 1;

  return jsonb_build_object(
    'saved_count', cardinality(v_saved_ids),
    'word_ids', to_jsonb(v_saved_ids),
    'turkish_words_total', v_total
  );
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

  update turkish.settings
  set turkish_words_total = 0
  where id = 1;
end;
$$;

create or replace function public.truncate_all_except_settings()
returns jsonb
language plpgsql
security definer
set search_path = public, turkish
as $$
begin
  truncate turkish.turkish_meanings cascade;
  truncate turkish.turkish_words cascade;
  truncate public.english_words cascade;

  update turkish.settings
  set turkish_words_total = 0
  where id = 1;

  update public.settings
  set
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

grant execute on function turkish.save_turkish_words_batch(jsonb)
  to authenticated;

grant execute on function turkish.delete_all_turkish_words()
  to authenticated;

grant execute on function public.truncate_all_except_settings()
  to anon, authenticated;
