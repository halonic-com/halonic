import { Spinner } from "@halonicjs/studio-kit";
import { type Ref, useId } from "react";

/** A workspace remembered on this device, as a Recent row on the Welcome screen shows it. */
export interface WelcomeRecentWorkspace {
  /** Its folder's location, which opens it. */
  readonly location: string;
  /** Its name, such as "Acme Support". */
  readonly name: string;
  /** True when it was created as the Acme sample on this device: its row ends in a Sample tag. */
  readonly sample?: boolean | undefined;
}

/** What a screen reader hears while a row is busy: the same word as the Open folder button (microcopy 3.2). */
export const openingStatus = "Opening…";

/** The tag at the end of a sample's row: a fact, so an outline tag and not a tone chip (flow-first-run 2.1). */
export const sampleTag = "Sample";

const tagClasses =
  "shrink-0 rounded-xs border border-border px-1.5 text-caption text-fg-muted contrast-more:border-border-control";

/** The Welcome screen shows this many Recent rows at most (flow-workspace 2.1). */
export const WELCOME_RECENT_ROWS = 5;

/** Props for {@link WelcomeRecent}. */
export interface WelcomeRecentProps {
  /** The remembered workspaces, most recent first; only the first five show. */
  readonly workspaces: readonly WelcomeRecentWorkspace[];
  /** The row whose folder is opening, which is busy. */
  readonly opening: string | undefined;
  readonly onOpen: (location: string) => void;
  /** Takes each row's button, by location, so focus can move to a row. */
  readonly rowRef: (location: string) => Ref<HTMLButtonElement>;
  /** The row whose folder failed to open: it gets the danger outline and is described by the alert line. */
  readonly failed?: { readonly location: string; readonly alertId: string } | undefined;
}

/** How much of a folder's end always shows when its line is cut in the middle. */
const TAIL_LENGTH = 24;

/** A folder that, when too long, is cut in the middle so its end, which tells folders apart, stays; the cut lands on a "/" when it can. */
function MiddleCut({ text }: { readonly text: string }) {
  const cut = Math.max(0, text.length - TAIL_LENGTH);
  // Cut at a "/" so the end starts on a whole folder name, when there is one to cut at.
  const slash = text.lastIndexOf("/", cut);
  const at = slash > 0 ? slash : cut;
  return (
    <span className="flex min-w-0 text-caption text-fg-subtle">
      <span className="truncate">{text.slice(0, at)}</span>
      <span className="shrink-0 whitespace-pre">{text.slice(at)}</span>
    </span>
  );
}

/**
 * The Welcome screen's Recent list (states-flow-map W2): the heading **Recent** and up to five
 * rows, each a button with the workspace's name over its folder, read "*Acme Support*,
 * *~/Documents/Acme Support*" (microcopy 19.6). One press opens it. The row whose folder is
 * opening is busy: a spinner at its end, `aria-busy`, presses ignored, and a polite "Opening…" status for screen readers. Hidden while nothing is
 * remembered, with no "No recent workspaces" sentence.
 *
 * @example
 * <WelcomeRecent workspaces={recent} opening={undefined} onOpen={open} rowRef={rowRef} />
 */
export function WelcomeRecent({ workspaces, opening, onOpen, rowRef, failed }: WelcomeRecentProps) {
  const headingId = useId();
  const shown = workspaces.slice(0, WELCOME_RECENT_ROWS);
  if (shown.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-1 text-start">
      <h2 id={headingId} className="px-2 text-body-strong text-fg-muted">
        Recent
      </h2>
      <ul className="flex flex-col">
        {shown.map((workspace) => {
          const busy = workspace.location === opening;
          const failedRow = workspace.location === failed?.location;
          return (
            <li key={workspace.location}>
              <button
                ref={rowRef(workspace.location)}
                type="button"
                aria-label={`${workspace.name}, ${workspace.location}${workspace.sample === true ? `, ${sampleTag}` : ""}`}
                aria-busy={busy || undefined}
                aria-describedby={failedRow ? failed?.alertId : undefined}
                className={`${rowClasses} ${failedRow ? failedBorder : idleBorder}`}
                onClick={() => {
                  if (!busy) {
                    onOpen(workspace.location);
                  }
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body text-fg">{workspace.name}</span>
                  <MiddleCut text={workspace.location} />
                </span>
                {workspace.sample === true ? (
                  <span aria-hidden="true" className={tagClasses}>
                    {sampleTag}
                  </span>
                ) : null}
                {busy ? (
                  <span aria-hidden="true" className="size-icon-sm shrink-0 *:size-full">
                    <Spinner />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <span role="status" aria-live="polite" className="sr-only">
        {opening !== undefined && shown.some((workspace) => workspace.location === opening)
          ? openingStatus
          : ""}
      </span>
    </section>
  );
}

// One border colour per state: both on a row would fight, and the transparent one could win.
const idleBorder = "border-transparent";
const failedBorder = "border-danger";

// The sidebar switcher's padding and radius, so a workspace row looks the same in both places.
const rowClasses = [
  "flex w-full min-w-0 items-center gap-2.5 rounded-sm border px-2 py-1.5 scroll-my-4 text-start outline-none focus-ring",
  "hover:bg-surface-muted active:bg-surface-muted",
].join(" ");
