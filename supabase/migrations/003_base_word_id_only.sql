-- Base words are references to existing Turkish entries only.
alter table turkish.turkish_words
  drop constraint if exists turkish_words_base_id_requires_text_check;

alter table turkish.turkish_words
  drop column if exists base_word_text;

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

  insert into public.settings (id, turkish_words_total)
  values (1, v_total)
  on conflict (id) do update
    set turkish_words_total = excluded.turkish_words_total;

  return jsonb_build_object(
    'saved_count', cardinality(v_saved_ids),
    'word_ids', to_jsonb(v_saved_ids),
    'turkish_words_total', v_total
  );
end;
$$;

grant execute on function turkish.save_turkish_words_batch(jsonb)
to authenticated;
