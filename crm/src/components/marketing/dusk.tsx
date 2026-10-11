/**
 * A dusk landscape drawn in SVG: sky fading from night blue to a warm horizon, soft clouds and
 * layered ridges. Used behind the sign-in card and the landing hero, so no photo is shipped.
 */
export function DuskScene({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <svg className="absolute inset-0 size-full" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d1220" />
            <stop offset=".38" stopColor="#1d2638" />
            <stop offset=".6" stopColor="#3a3a48" />
            <stop offset=".74" stopColor="#7a5a4c" />
            <stop offset=".82" stopColor="#b9805c" />
            <stop offset="1" stopColor="#2a2224" />
          </linearGradient>
          <radialGradient id="sun" cx=".62" cy=".78" r=".45">
            <stop offset="0" stopColor="#ffbe7a" stopOpacity=".55" />
            <stop offset=".5" stopColor="#ff8f5a" stopOpacity=".12" />
            <stop offset="1" stopColor="#ff8f5a" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id="haze">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0" />
          </filter>
        </defs>
        <rect width="1600" height="1000" fill="url(#sky)" />
        <rect width="1600" height="1000" fill="url(#sun)" />
        <g filter="url(#soft)" opacity=".55">
          <ellipse cx="300" cy="420" rx="360" ry="42" fill="#c08a72" />
          <ellipse cx="980" cy="470" rx="420" ry="38" fill="#d39a78" />
          <ellipse cx="1350" cy="380" rx="300" ry="30" fill="#8d6f78" />
          <ellipse cx="640" cy="330" rx="280" ry="22" fill="#6b6176" />
        </g>
        <path filter="url(#haze)" fill="#3b3138" opacity=".9" d="M0 720 L120 650 L230 690 L360 600 L470 660 L600 590 L720 650 L860 570 L990 640 L1120 585 L1250 640 L1380 600 L1500 650 L1600 620 L1600 1000 L0 1000Z" />
        <path filter="url(#haze)" fill="#251f25" d="M0 790 L150 720 L300 770 L430 700 L560 760 L700 690 L830 760 L980 710 L1110 770 L1260 720 L1400 770 L1530 730 L1600 760 L1600 1000 L0 1000Z" />
        <path fill="#151215" d="M0 880 L180 820 L340 860 L520 800 L700 860 L900 810 L1080 870 L1280 820 L1460 870 L1600 840 L1600 1000 L0 1000Z" />
        <rect width="1600" height="1000" filter="url(#grain)" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" />
    </div>
  );
}
