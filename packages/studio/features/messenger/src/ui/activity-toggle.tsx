import { Button, useNarrow } from "@halonicjs/studio-kit";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { activityWords } from "../activity-words.ts";
import { activityPanelId } from "./activity-panel.tsx";

/** Where the person's choice to show the panel or not is kept, on this computer. */
const rememberedKey = "halonic.messenger.activity-open";

/** The minimum width of a wide window, where the panel sits beside the chat (HAL-18558 section 3). */
const wideQuery = "(min-width: 1200px)";

/**
 * Where the panel goes in this window (HAL-18558 section 3): beside the chat on a wide window
 * (1200 px and up), a sheet over the chat's right side on a medium one (900–1199 px), and a place
 * of its own, instead of the chat, on a narrow one (under 900 px).
 */
export type ActivityWidth = "wide" | "medium" | "narrow";

/** The open chat's activity panel, for the header button and the working line. */
export interface ActivityToggle {
  readonly open: boolean;
  /** The agent has a run going: the closed panel's button shows a still blue dot. */
  readonly working: boolean;
  readonly name: string;
  readonly toggle: () => void;
}

/** The panel's toggle where the open chat has one; none where no panel is offered. */
export const ActivityToggleContext = createContext<ActivityToggle | undefined>(undefined);

/**
 * Whether the panel is open. On a wide window it's open by default, then as the person last left
 * it, remembered on this computer; on a medium or narrow one it starts closed, and the choice made
 * there isn't remembered. When the window crosses a width, it starts again as that width starts.
 * It never opens or closes by itself; **Ctrl+I** is the host's (`useActivityKey`).
 */
export function useActivityOpen(width: ActivityWidth): readonly [boolean, () => void] {
  const [open, setOpen] = useState(() => startsOpen(width));
  const [openedAt, setOpenedAt] = useState(width);
  if (openedAt !== width) {
    setOpenedAt(width);
    setOpen(startsOpen(width));
  }
  const toggle = useCallback(() => {
    setOpen((before) => {
      if (width === "wide") remember(!before);
      return !before;
    });
  }, [width]);
  return [open, toggle];
}

/**
 * **Ctrl+I** opens and closes the panel through `press`, the same open and close as the header
 * button's, except while focus is in a text field, such as the message box or the search.
 */
export function useActivityKey(press: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "i")
        return;
      // While the person types, Ctrl+I belongs to the text field (HAL-18567 review).
      if (isTextField(event.target)) return;
      event.preventDefault();
      press();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);
}

/**
 * Where the panel goes in this window: the kit's narrow width first, then the wide query. The
 * medium width (900–1199 px) is what lies between them, so it holds only while the kit's narrow
 * width (`WIDE_MIN_WIDTH`, which `useNarrow` follows) stays at 900 px (HAL-18567 review).
 */
export function useActivityWidth(): ActivityWidth {
  const narrow = useNarrow();
  const wide = useWide();
  if (narrow) return "narrow";
  return wide ? "wide" : "medium";
}

/**
 * Whether the window is wide enough for the panel beside the chat (1200 px and up). A test's jsdom
 * has no `matchMedia`, so it counts as wide there.
 */
function useWide(): boolean {
  const [wide, setWide] = useState(() => globalThis.matchMedia?.(wideQuery).matches ?? true);
  useEffect(() => {
    const query = globalThis.matchMedia?.(wideQuery);
    // An old engine's, or a test's, query may not tell of changes.
    if (typeof query?.addEventListener !== "function") return;
    const changed = () => setWide(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  return wide;
}

/**
 * The chat header's button: the kit's ghost icon button, on its filled tile while the panel is
 * open, with a still blue dot while closed and working.
 */
export function ActivityButton() {
  const toggle = useContext(ActivityToggleContext);
  if (toggle === undefined) return null;
  return (
    <span title={activityWords.button} className="inline-flex">
      <Button
        variant="ghost"
        size="sm"
        icon={<PanelIcon dot={toggle.working && !toggle.open} />}
        label={
          toggle.working
            ? activityWords.buttonWorking(toggle.name)
            : activityWords.title(toggle.name)
        }
        pressed={toggle.open}
        aria-controls={activityPanelId}
        aria-keyshortcuts="Control+I"
        onClick={toggle.toggle}
      />
    </span>
  );
}

/** "Show activity" on the chat's working line while the panel is closed. */
export function ShowActivity() {
  const toggle = useContext(ActivityToggleContext);
  if (toggle === undefined || toggle.open) return null;
  return (
    <button
      type="button"
      onClick={toggle.toggle}
      className="focus-ring inline-flex min-h-6 items-center rounded-xs text-accent-text hover:underline"
    >
      {activityWords.show}
    </button>
  );
}

/** A window with a pane on its right side, with the still dot in its corner while the agent works. */
function PanelIcon({ dot }: { readonly dot: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M10 2.5v11" />
      {dot ? (
        <circle data-activity-dot cx="13.5" cy="2.5" r="2.5" className="fill-accent stroke-none" />
      ) : null}
    </svg>
  );
}

function startsOpen(width: ActivityWidth): boolean {
  return width === "wide" ? (remembered() ?? true) : false;
}

function remembered(): boolean | undefined {
  const kept = globalThis.localStorage?.getItem(rememberedKey);
  return kept === null || kept === undefined ? undefined : kept === "open";
}

function remember(open: boolean): void {
  globalThis.localStorage?.setItem(rememberedKey, open ? "open" : "closed");
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select") !== null;
}
