/**
 * The busy spinner: a quarter arc on a faint ring, in the text colour. It turns, the one loop
 * allowed in v0.1, because it is live status. It's decoration: the button says `aria-busy`.
 */
export function Spinner() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
