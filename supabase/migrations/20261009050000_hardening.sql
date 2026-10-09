-- Security advisor: pin the search path of the helper used by the section search column.
alter function public.heading_text(text[]) set search_path = '';
