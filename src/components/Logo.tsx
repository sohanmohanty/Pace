/** The mark: a short path with a stop on it. Echoes the Day Line. */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M4 21 C 10 10, 18 10, 28 13"
        stroke="var(--brand)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="11.6" r="4.6" fill="var(--surface)" stroke="var(--brand)" strokeWidth="3" />
      <circle cx="28" cy="13" r="2.2" fill="var(--brand)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo />
      <span className="font-display text-[1.45rem] leading-none tracking-tight text-ink">Pace</span>
    </span>
  );
}
