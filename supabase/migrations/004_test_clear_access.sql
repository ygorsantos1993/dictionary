-- Temporary access for the test-only "clear library" button.
-- The app currently runs without login, so requests use the anon role.
alter function public.truncate_all_except_settings()
  security definer;

alter function public.truncate_all_except_settings()
  set search_path = public, turkish;

grant execute on function public.truncate_all_except_settings()
  to anon;
