type LogoProps = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
};

/**
 * Original TOCKINAX mark: a gold geometric "T" built from two bars,
 * wrapped by an orbit swoosh (drawn paths — not copied artwork).
 */
export default function Logo({ size = 32, showWordmark = true, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="img" aria-label="TOCKINAX logo">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* orbit swoosh */}
        <ellipse
          cx="24"
          cy="24"
          rx="21"
          ry="9.5"
          transform="rotate(-24 24 24)"
          stroke="#F0B90B"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="86 46"
        />
        {/* geometric T: crossbar */}
        <path d="M11 13.5h26l-2.6 6H13.6l-2.6-6Z" fill="#F0B90B" />
        {/* geometric T: stem */}
        <path d="M20.6 20.5h6.8l-1.4 14.2a2 2 0 0 1-2 1.8 2 2 0 0 1-2-1.8l-1.4-14.2Z" fill="#F0B90B" />
        {/* orbit satellite dot */}
        <circle cx="40.5" cy="14.5" r="2.6" fill="#F0B90B" />
      </svg>
      {showWordmark && (
        <span className="font-display text-xl font-bold tracking-[0.18em] text-white">
          TOCKINAX
        </span>
      )}
    </span>
  );
}
