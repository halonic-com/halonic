/**
 * The lock: a closed padlock, outline style, in the text colour. Used before a line about what
 * is kept safe or who a run may reach, such as the first run's trust line. Decoration: the words
 * next to it say what it's about.
 */
export function LockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.25" y="7.25" width="9.5" height="6.5" rx="1.25" />
      <path d="M5.25 7.25V5a2.75 2.75 0 0 1 5.5 0v2.25" />
    </svg>
  );
}
