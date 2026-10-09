-- Text the chat read from a document (its text layer, or Gemini reading a scan or photo), kept so
-- each file is read once. Written by the chat as the signed-in owner (row-level security applies).
alter table public.documents add column if not exists extracted_text text;
alter table public.documents add column if not exists extracted_with text;
