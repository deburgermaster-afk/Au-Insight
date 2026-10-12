/** Where to land after an OAuth round trip: only in-app paths, never another site. */
export const safeReturn = (v: string | null | undefined, fallback: string) => (v && /^\/app(\/[\w\-/]*)?$/.test(v) ? v : fallback);
