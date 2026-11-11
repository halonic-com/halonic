import { Spinner } from "@halonicjs/studio-kit";
import { type Ref, useId } from "react";

/** A workspace remembered on this device, as a Recent row on the Welcome screen shows it. */
export interface WelcomeRecentWorkspace {
  /** Its folder's location, which opens it. */
  readonly location: string;
  /** Its name, such as "Acme Support". */
  readonly name: string;
}

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
}

/**
 * The Welcome screen's Recent list (states-flow-map W2): the heading **Recent** and up to five
 * rows, each a button with the workspace's name over its folder, read "*Acme Support*,
 * *~/Documents/Acme Support*" (microcopy 19.6). One press opens it. The row whose folder is
 * opening is busy: a spinner at its end, `aria-busy`, and presses ignored. Hidden while nothing is
 * remembered, with no "No recent workspaces" sentence.
 *
 * @example
 * <WelcomeRecent workspaces={recent} opening={undefined} onOpen={open} rowRef={rowRef} />
 */
export function WelcomeRecent({ workspaces, opening, onOpen, rowRef }: WelcomeRecentProps) {
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
          return (
            <li key={workspace.location}>
              <button
                ref={rowRef(workspace.location)}
                type="button"
                aria-label={`${workspace.name}, ${workspace.location}`}
                aria-busy={busy || undefined}
                className={rowClasses}
                onClick={() => {
                  if (!busy) {
                    onOpen(workspace.location);
                  }
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body text-fg">{workspace.name}</span>
                  <span className="truncate text-caption text-fg-subtle">{workspace.location}</span>
                </span>
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
    </section>
  );
}

// The sidebar switcher's padding and radius, so a workspace row looks the same in both places.
const rowClasses = [
  "flex w-full min-w-0 items-center gap-2.5 rounded-sm px-2 py-1.5 text-start outline-none focus-ring",
  "hover:bg-surface-muted active:bg-surface-muted",
].join(" ");
