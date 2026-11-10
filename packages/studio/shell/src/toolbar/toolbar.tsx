import { BackIcon, Button, ForwardIcon } from "@halonicjs/studio-kit";
import { type MouseEvent, type ReactNode, useCallback, useId, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { useHistoryMoves } from "../tabs/history-moves.ts";
import { currentLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";

/** Props for {@link Toolbar}. */
export interface ToolbarProps {
  /** The open workspace's tabs: Back, Forward and the path follow the active one. */
  readonly tabs: TabSet;
  /** The window's announcer, for "Opened … in a new tab." after a Ctrl-click in the path. */
  readonly announcer: Announcer;
  /**
   * The places above a tab's place in the path, outermost first: `[Workflows]` for the workflow
   * "Support reply". Without it the path is the place alone.
   */
  readonly parentsOf?: ((location: TabLocation) => readonly TabLocation[]) | undefined;
  /** The workspace's header badges ("Not trusted yet"). When there are none, the slot takes no room. */
  readonly badges?: ReactNode;
  /** The workspace's save state ("✓ Saved"), the same in every tab. */
  readonly saveState?: ReactNode;
}

/**
 * The toolbar, the panel's first row (design direction 2, UX checklist 1.1): Back and Forward of
 * the active tab, the path as a `nav` named "Location", then on the right the header badge slot
 * and the save state. Back and Forward stay in the Tab order when there's nowhere to go, and say
 * so. A part of the path before the last is a link: a click opens it in the active tab, a
 * Ctrl-click or a middle-click in a new tab next to it, or says it is already open in one.
 *
 * The Assistant button joins it with the Assistant (T14); until then there's none.
 *
 * @example
 * <ShellFrame toolbar={<Toolbar tabs={workspace.tabs} announcer={shell.announcer} />} …>
 */
export function Toolbar({ tabs, announcer, parentsOf, badges, saveState }: ToolbarProps) {
  // One `subscribe` per tab set, so React doesn't subscribe again on every render.
  const subscribe = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs]);
  const state = useSyncExternalStore(subscribe, () => tabs.state);
  const moves = useHistoryMoves(tabs);
  const location = currentLocation(tabs.active);
  const parents = parentsOf?.(location) ?? [];

  const openPart = (part: TabLocation, inNewTab: boolean) => {
    if (!inNewTab) {
      tabs.openHere(part);
      return;
    }
    // A place another tab shows stays where it is; only the announcer says so (UX D3, HAL-3159).
    const opened = tabs.openInNewTab(part);
    announcer.announce(
      opened.added
        ? `Opened ${part.title} in a new tab.`
        : `${part.title} is already open in a tab.`,
    );
  };

  return (
    <>
      <HistoryButton direction="back" available={state.canGoBack} onClick={moves.back} />
      <HistoryButton direction="forward" available={state.canGoForward} onClick={moves.forward} />
      <nav aria-label="Location" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-small">
          {parents.map((part) => (
            <li key={part.key} className={pathLayout.parent}>
              <PathLink part={part} onOpen={openPart} />
              <span aria-hidden="true" className="shrink-0 text-fg-muted">
                /
              </span>
            </li>
          ))}
          <li className={pathLayout.current}>
            <span aria-current="page" className="block truncate text-fg">
              {location.title}
            </span>
          </li>
        </ol>
      </nav>
      {hasContent(badges) ? <div className="flex shrink-0 items-center gap-2">{badges}</div> : null}
      {hasContent(saveState) ? <div className="shrink-0">{saveState}</div> : null}
    </>
  );
}

/**
 * How the path shares a narrow toolbar (a narrow window, or text at 200%): every part shortens
 * with "…" rather than push another out. A parent is at most 192px and gives up its room four
 * times as fast as the place itself, so the place the user is on keeps the most room.
 */
const pathLayout = {
  parent: "flex min-w-0 max-w-48 shrink-4 items-center gap-1.5",
  current: "min-w-0 flex-auto",
} as const;

/** What Back and Forward are called, and why they can't be used. */
const historyWords = {
  back: { label: "Back", icon: <BackIcon />, nowhere: "Nothing to go back to" },
  forward: { label: "Forward", icon: <ForwardIcon />, nowhere: "Nothing to go forward to" },
} as const;

interface HistoryButtonProps {
  readonly direction: "back" | "forward";
  readonly available: boolean;
  readonly onClick: () => void;
}

/**
 * Back or Forward, a 32px ghost icon button (VK T2-F48). With nowhere to go it is unavailable,
 * not disabled: it keeps its Tab stop, and its description says why. These two are the one
 * exception to a visible reason line (Sofia, HAL-3159): the reason is read only by screen readers
 * here, and also becomes the tooltip once tooltips come to the toolbar. It stays in the DOM, so
 * it never appears only on hover.
 */
function HistoryButton({ direction, available, onClick }: HistoryButtonProps) {
  const reasonId = useId();
  const words = historyWords[direction];
  return (
    <>
      <Button
        variant="ghost"
        icon={words.icon}
        label={words.label}
        unavailable={available ? undefined : { reason: reasonId }}
        onClick={onClick}
      />
      <span id={reasonId} className="sr-only">
        {words.nowhere}
      </span>
    </>
  );
}

interface PathLinkProps {
  readonly part: TabLocation;
  readonly onOpen: (part: TabLocation, inNewTab: boolean) => void;
}

/**
 * A part of the path the user can go to. It is a real link, so a screen reader lists it with the
 * page's links; the shell opens it itself, so the browser never follows the address.
 */
function PathLink({ part, onOpen }: PathLinkProps) {
  const open = (event: MouseEvent<HTMLAnchorElement>, inNewTab: boolean) => {
    event.preventDefault();
    onOpen(part, inNewTab);
  };
  return (
    <a
      href={`#${part.key}`}
      className="min-w-0 truncate rounded-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-ring"
      onClick={(event) => open(event, event.ctrlKey || event.metaKey)}
      onAuxClick={(event) => {
        if (event.button === middleButton) {
          open(event, true);
        }
      }}
    >
      {part.title}
    </a>
  );
}

const middleButton = 1;

/** Whether a slot was given something to show; `null`, `false` and nothing take no room. */
function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}
