/**
 * The Settings mark: a gear with eight teeth round a hole, outline style, in the text colour, on
 * the place icons' 24 grid and line, so it sits in the sidebar's Settings row beside them
 * (component specs 24.4). Settings is never where you are, so it has no filled form.
 */
export function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18.2 12.9l2 1.2-.9 2.2-2.2-.6-1.4 1.4.6 2.2-2.2.9-1.2-2h-1.8l-1.2 2-2.2-.9.6-2.2-1.4-1.4-2.2.6-.9-2.2 2-1.2v-1.8l-2-1.2.9-2.2 2.2.6 1.4-1.4-.6-2.2 2.2-.9 1.2 2h1.8l1.2-2 2.2.9-.6 2.2 1.4 1.4 2.2-.6.9 2.2-2 1.2z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
