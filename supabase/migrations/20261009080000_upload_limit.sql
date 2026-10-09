-- Any file type, up to 50 MB each (the free plan's per-file maximum).
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = null where id = 'case-documents';
