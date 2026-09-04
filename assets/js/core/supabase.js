import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://bqgweziunlzwdousflkf.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_aZKwM2_YzG3OzL6KLnSg0A_XWrRYF1J";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export const turkishDb =
  supabase.schema("turkish");
