import type { ReactNode } from "react";

/*
 * The few icons the page's samples need. The kit has no icon set yet; these are drawn like its
 * AlertIcon: a 16px outline in the text colour.
 */

function Outline({ children }: { readonly children: ReactNode }) {
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
      {children}
    </svg>
  );
}

export const PlusIcon = () => (
  <Outline>
    <path d="M8 3.5v9M3.5 8h9" />
  </Outline>
);

export const CloseIcon = () => (
  <Outline>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Outline>
);

export const FlowIcon = () => (
  <Outline>
    <rect x="2" y="2.5" width="4" height="4" rx="1" />
    <rect x="10" y="9.5" width="4" height="4" rx="1" />
    <path d="M6 4.5h2.5a1.5 1.5 0 0 1 1.5 1.5v3.5" />
  </Outline>
);

export const SlidersIcon = () => (
  <Outline>
    <path d="M3 5h10M3 11h10" />
    <circle cx="6" cy="5" r="1.5" />
    <circle cx="10" cy="11" r="1.5" />
  </Outline>
);

export const ListIcon = () => (
  <Outline>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h0M2.5 8h0M2.5 12h0" />
  </Outline>
);
