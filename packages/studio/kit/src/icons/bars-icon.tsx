/**
 * Four bars of different heights, outline style, in the text colour, on the place icons' 24 grid
 * and line, like `SettingsIcon`: Usage in Cloud's sidebar (HAL-16050).
 */
export function BarsIcon() {
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
      <path d="M5 19v-7M10 19V6M15 19v-10M20 19v-4" />
    </svg>
  );
}
