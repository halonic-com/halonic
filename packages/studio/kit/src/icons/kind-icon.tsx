import type { ReactNode } from "react";
import { SettingsIcon } from "./settings-icon.tsx";

/**
 * The kinds `KindIcon` draws: an agent's item kinds (the ports' `InboxItemKind`), a notice, the
 * Inbox's own person step and setup item, and a sender nobody named.
 */
export type KindIconName =
  | "approval"
  | "question"
  | "action"
  | "elsewhere"
  | "task"
  | "comment"
  | "notice"
  | "wait"
  | "setup"
  | "unknown";

/**
 * What kind of item an Inbox or Needs you row is, as an outline glyph on the 24 grid
 * (`kit.avatar-badge`, Sofia's proposal on HAL-19491): a stamp for an approval, since a tick
 * already means "done"; a "?" for a question; steps for an action; an arrow out for an item answered
 * elsewhere; a sheet for a task; a speech bubble for a comment; a bell for a notice; a pause for a
 * person step; a gear for setup; a silhouette for a sender nobody named. Decoration: the row's
 * title and line say what it is.
 *
 * @example
 * <Avatar name="Chief" badge={<KindIcon kind="approval" />} />
 */
export function KindIcon({ kind }: { readonly kind: KindIconName }) {
  if (kind === "setup") return <SettingsIcon />;
  return <KindSvg>{kindPaths[kind]}</KindSvg>;
}

const kindPaths: Record<Exclude<KindIconName, "setup">, ReactNode> = {
  // Knob, neck, pad and ink line.
  approval: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M10.5 8.3 10 13" />
      <path d="M13.5 8.3 14 13" />
      <rect x="5" y="13" width="14" height="4.5" rx="1" />
      <path d="M7 21h10" />
    </>
  ),
  // A bare "?", not the Help mark's circled one, so it reads inside the round badge.
  question: (
    <>
      <path d="M8.5 8.5a3.5 3.5 0 1 1 4.9 3.2c-.8.4-1.4 1.2-1.4 2.1v.7" />
      <path d="M12 19h.01" />
    </>
  ),
  action: <path d="M4 19h5v-5h5V9h6" />,
  elsewhere: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  task: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  comment: <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  notice: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  wait: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

/** The kit's icon frame: outline style on the 24 grid, in the text colour. */
function KindSvg({ children }: { readonly children: ReactNode }) {
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
      {children}
    </svg>
  );
}
