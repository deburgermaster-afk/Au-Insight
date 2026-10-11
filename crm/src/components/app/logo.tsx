export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.58 0.22 277)" />
          <stop offset="1" stopColor="oklch(0.62 0.21 320)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <path d="M10 8v13.5a2.5 2.5 0 0 0 2.5 2.5H22" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <circle cx="21.5" cy="11.5" r="2.5" fill="white" opacity=".9" />
    </svg>
  );
}
