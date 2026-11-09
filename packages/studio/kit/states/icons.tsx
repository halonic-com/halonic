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
