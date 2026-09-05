create or replace function turkish.update_turkish_word(
  p_word jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, turkish
as $$
declare
  v_word_id integer;
  v_meaning jsonb;
begin
  v_word_id := (p_word ->> 'id')::integer;

  if v_word_id is null then
    raise exception 'A word id is required.';
  end if;

  if nullif(btrim(p_word ->> 'word'), '') is null then
    raise exception 'A word is required.';
  end if;

  if jsonb_typeof(coalesce(p_word -> 'meanings', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_word -> 'meanings', '[]'::jsonb)) = 0 then
    raise exception 'At least one meaning is required.';
  end if;

  update turkish.turkish_words
  set
    word = p_word ->> 'word',
    pronunciation = nullif(p_word -> 'pronunciation', 'null'::jsonb),
    forms = nullif(p_word -> 'forms', 'null'::jsonb),
    notes = nullif(p_word -> 'notes', 'null'::jsonb),
    analysis = nullif(p_word -> 'analysis', 'null'::jsonb),
    base_word_id = nullif(p_word ->> 'base_word_id', '')::integer,
    alternative_forms = nullif(p_word -> 'alternative_forms', 'null'::jsonb),
    updated_at = now()
  where id = v_word_id;

  if not found then
    raise exception 'Word with id % was not found.', v_word_id;
  end if;

  delete from turkish.turkish_meanings
  where word_id = v_word_id;

  for v_meaning in select value from jsonb_array_elements(p_word -> 'meanings')
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

  return jsonb_build_object(
    'id', v_word_id,
    'success', true
  );
end;
$$;

grant execute on function turkish.update_turkish_word(jsonb)
  to anon, authenticated;
