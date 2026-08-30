--
-- PostgreSQL database dump
--

\restrict 6D6cG6oa2oaNtGYE7DX94MChQ7QzOvrqKUsxWXKaR7ZshMqpxlEsEhYftkGcKwi

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: save_turkish_words_batch(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_turkish_words_batch(p_words jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


  for v_word in
    select value
    from jsonb_array_elements(p_words)
  loop

    if nullif(btrim(v_word ->> 'word'), '') is null then
      raise exception 'A word is missing.';
    end if;


    if coalesce((v_word ->> 'etymology')::smallint, 0) < 1 then
      raise exception 'Invalid etymology for word "%".', v_word ->> 'word';
    end if;


    if jsonb_typeof(
      coalesce(
        v_word -> 'meanings',
        '[]'::jsonb
      )
    ) <> 'array'
    or jsonb_array_length(
      coalesce(
        v_word -> 'meanings',
        '[]'::jsonb
      )
    ) = 0 then
      raise exception 'Word "%" has no selected meanings.', v_word ->> 'word';
    end if;


    insert into public.turkish_words (
      word,
      etymology,
      pronunciation,
      forms,
      notes,
      surface_analysis,
      base_word_text,
      base_word_id,
      alternative_forms
    )
    values (
      v_word ->> 'word',
      (v_word ->> 'etymology')::smallint,

      case
        when v_word ? 'pronunciation'
          then v_word -> 'pronunciation'
        else null
      end,

      case
        when v_word ? 'forms'
          then v_word -> 'forms'
        else null
      end,

      case
        when v_word ? 'notes'
          then v_word -> 'notes'
        else null
      end,

      case
        when nullif(btrim(v_word ->> 'surface_analysis'), '') is not null
          then to_jsonb(v_word ->> 'surface_analysis')
        else null
      end,

      nullif(
        btrim(
          v_word ->> 'base_word_text'
        ),
        ''
      ),

      case
        when nullif(
          v_word ->> 'base_word_id',
          ''
        ) is not null
          then (v_word ->> 'base_word_id')::integer
        else null
      end,

      case
        when v_word ? 'alternative_forms'
          then v_word -> 'alternative_forms'
        else null
      end
    )
    returning id
    into v_word_id;


    v_saved_ids :=
      array_append(
        v_saved_ids,
        v_word_id
      );


    for v_meaning in
      select value
      from jsonb_array_elements(
        v_word -> 'meanings'
      )
    loop

      if nullif(
        btrim(
          v_meaning ->> 'part_of_speech'
        ),
        ''
      ) is null then
        raise exception 'A meaning for "%" has no part of speech.', v_word ->> 'word';
      end if;


      if coalesce(
        (v_meaning ->> 'position')::smallint,
        0
      ) < 1 then
        raise exception 'A meaning for "%" has an invalid position.', v_word ->> 'word';
      end if;


      if nullif(
        btrim(
          v_meaning ->> 'meaning'
        ),
        ''
      ) is null then
        raise exception 'A meaning for "%" is empty.', v_word ->> 'word';
      end if;


      insert into public.turkish_meanings (
        word_id,
        part_of_speech,
        position,
        usage_label,
        meaning,
        examples
      )
      values (
        v_word_id,
        v_meaning ->> 'part_of_speech',
        (v_meaning ->> 'position')::smallint,
        nullif(
          btrim(
            v_meaning ->> 'usage_label'
          ),
          ''
        ),
        v_meaning ->> 'meaning',

        case
          when v_meaning ? 'examples'
            then v_meaning -> 'examples'
          else null
        end
      );

    end loop;

  end loop;


  select count(*)::integer
  into v_total
  from public.turkish_words;


  insert into public.settings (
    id,
    turkish_words_total
  )
  values (
    1,
    v_total
  )
  on conflict (id)
  do update
    set turkish_words_total =
      excluded.turkish_words_total;


  return jsonb_build_object(
    'saved_count',
    cardinality(v_saved_ids),
    'word_ids',
    to_jsonb(v_saved_ids),
    'turkish_words_total',
    v_total
  );

end;
$$;


--
-- Name: turkish_meanings_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.turkish_meanings_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if
    new.word_id is distinct from old.word_id
    or new.position is distinct from old.position
    or new.usage_label is distinct from old.usage_label
    or new.meaning is distinct from old.meaning
    or new.examples is distinct from old.examples
  then
    new.updated_at = now();
  end if;

  return new;
end;
$$;


--
-- Name: turkish_meanings_touch_word(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.turkish_meanings_touch_word() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin

  -- Novo meaning
  if tg_op = 'INSERT' then

    update public.turkish_words
    set updated_at = now()
    where id = new.word_id;

    return new;

  end if;


  -- Meaning removido
  if tg_op = 'DELETE' then

    update public.turkish_words
    set updated_at = now()
    where id = old.word_id;

    return old;

  end if;


  -- Meaning atualizado
  if tg_op = 'UPDATE' then

    if
      new.word_id is distinct from old.word_id
      or new.position is distinct from old.position
      or new.usage_label is distinct from old.usage_label
      or new.meaning is distinct from old.meaning
      or new.examples is distinct from old.examples
    then

      -- Se o meaning mudou de word,
      -- a word antiga também precisa ser marcada.
      if new.word_id is distinct from old.word_id then

        update public.turkish_words
        set updated_at = now()
        where id = old.word_id;

      end if;


      update public.turkish_words
      set updated_at = now()
      where id = new.word_id;

    end if;

    return new;

  end if;

  return null;
end;
$$;


--
-- Name: turkish_words_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.turkish_words_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if
    new.word is distinct from old.word
    or new.etymology is distinct from old.etymology
    or new.part_of_speech is distinct from old.part_of_speech
    or new.pronunciation is distinct from old.pronunciation
    or new.forms is distinct from old.forms
    or new.notes is distinct from old.notes
  then
    new.updated_at = now();
  end if;

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: english_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.english_words (
    id integer NOT NULL,
    word text NOT NULL,
    turkish_word_ids integer[],
    msa_word_ids integer[],
    chinese_word_ids integer[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: english_words_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.english_words ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.english_words_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id smallint NOT NULL,
    turkish_words_total integer DEFAULT 0 NOT NULL,
    msa_words_total integer DEFAULT 0 NOT NULL,
    chinese_words_total integer DEFAULT 0 NOT NULL,
    CONSTRAINT settings_single_row_check CHECK ((id = 1))
);


--
-- Name: turkish_meanings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turkish_meanings (
    id integer NOT NULL,
    word_id integer NOT NULL,
    part_of_speech text NOT NULL,
    "position" smallint NOT NULL,
    usage_label text,
    meaning text NOT NULL,
    examples jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turkish_meanings_position_check CHECK (("position" >= 1))
);


--
-- Name: turkish_meanings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.turkish_meanings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.turkish_meanings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: turkish_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turkish_words (
    id integer NOT NULL,
    word text NOT NULL,
    etymology smallint DEFAULT 1 NOT NULL,
    pronunciation jsonb,
    forms jsonb,
    notes jsonb,
    surface_analysis jsonb,
    base_word_text text,
    base_word_id integer,
    alternative_forms jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turkish_words_base_id_requires_text_check CHECK (((base_word_id IS NULL) OR ((base_word_text IS NOT NULL) AND (btrim(base_word_text) <> ''::text)))),
    CONSTRAINT turkish_words_base_not_self_check CHECK (((base_word_id IS NULL) OR (base_word_id <> id))),
    CONSTRAINT turkish_words_base_requires_surface_analysis_check CHECK (((base_word_id IS NULL) OR (surface_analysis IS NOT NULL))),
    CONSTRAINT turkish_words_etymology_check CHECK ((etymology >= 1))
);


--
-- Name: turkish_words_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.turkish_words ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.turkish_words_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: english_words english_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_words
    ADD CONSTRAINT english_words_pkey PRIMARY KEY (id);


--
-- Name: english_words english_words_word_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_words
    ADD CONSTRAINT english_words_word_key UNIQUE (word);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: turkish_meanings turkish_meanings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turkish_meanings
    ADD CONSTRAINT turkish_meanings_pkey PRIMARY KEY (id);


--
-- Name: turkish_meanings turkish_meanings_word_pos_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turkish_meanings
    ADD CONSTRAINT turkish_meanings_word_pos_position_key UNIQUE (word_id, part_of_speech, "position");


--
-- Name: turkish_words turkish_words_entry_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turkish_words
    ADD CONSTRAINT turkish_words_entry_key UNIQUE (word, etymology);


--
-- Name: turkish_words turkish_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turkish_words
    ADD CONSTRAINT turkish_words_pkey PRIMARY KEY (id);


--
-- Name: turkish_meanings turkish_meanings_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turkish_meanings
    ADD CONSTRAINT turkish_meanings_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.turkish_words(id) ON DELETE CASCADE;


--
-- Name: turkish_words turkish_words_base_word_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turkish_words
    ADD CONSTRAINT turkish_words_base_word_fkey FOREIGN KEY (base_word_id) REFERENCES public.turkish_words(id) ON DELETE SET NULL;


--
-- Name: english_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.english_words ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: turkish_meanings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.turkish_meanings ENABLE ROW LEVEL SECURITY;

--
-- Name: turkish_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.turkish_words ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION save_turkish_words_batch(p_words jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_turkish_words_batch(p_words jsonb) TO authenticated;


--
-- Name: TABLE english_words; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.english_words TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.english_words TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.english_words TO service_role;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.settings TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.settings TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.settings TO service_role;


--
-- Name: TABLE turkish_meanings; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.turkish_meanings TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.turkish_meanings TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.turkish_meanings TO service_role;


--
-- Name: TABLE turkish_words; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.turkish_words TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.turkish_words TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.turkish_words TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict 6D6cG6oa2oaNtGYE7DX94MChQ7QzOvrqKUsxWXKaR7ZshMqpxlEsEhYftkGcKwi

