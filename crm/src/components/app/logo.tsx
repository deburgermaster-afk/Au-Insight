export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.83 0.14 70)" />
          <stop offset=".55" stopColor="oklch(0.68 0.21 20)" />
          <stop offset="1" stopColor="oklch(0.6 0.2 310)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <path d="M10.5 8v13a2.5 2.5 0 0 0 2.5 2.5h8.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <circle cx="21" cy="11.5" r="2.4" fill="white" opacity=".92" />
    </svg>
  );
}
