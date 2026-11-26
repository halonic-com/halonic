import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { activityWords } from "../activity-words.ts";
import { activityPanelId } from "./activity-panel.tsx";

/** Where the person's choice to show the panel or not is kept, on this computer. */
const rememberedKey = "halonic.messenger.activity-open";

/** The minimum width of a wide window, where the panel sits beside the chat (HAL-18558 section 3). */
const wideQuery = "(min-width: 1200px)";

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
 * Whether the panel is open: open by default on a wide window, then as the person last left it,
 * remembered on this computer. It never opens or closes by itself. **Ctrl+I** opens and closes it.
 */
export function useActivityOpen(): readonly [boolean, () => void] {
  const [open, setOpen] = useState(() => remembered() ?? true);
  const toggle = useCallback(() => {
    setOpen((before) => {
      remember(!before);
      return !before;
    });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "i")
        return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return [open, toggle];
}

/**
 * Whether the window is wide enough for the panel beside the chat (1200 px and up). A test's jsdom
 * has no `matchMedia`, so it counts as wide there.
 */
export function useWide(): boolean {
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

/** The chat header's button: pressed while the panel is open, with a still blue dot while closed and working. */
export function ActivityButton() {
  const toggle = useContext(ActivityToggleContext);
  if (toggle === undefined) return null;
  const working = toggle.working && !toggle.open;
  return (
    <button
      type="button"
      title={activityWords.button}
      aria-label={
        toggle.working ? activityWords.buttonWorking(toggle.name) : activityWords.title(toggle.name)
      }
      aria-pressed={toggle.open}
      aria-controls={activityPanelId}
      onClick={toggle.toggle}
      className="relative rounded-sm p-1 text-fg-muted hover:text-fg aria-pressed:text-fg"
    >
      <PanelIcon />
      {working ? (
        <span
          data-activity-dot
          aria-hidden="true"
          className="absolute end-0.5 top-0.5 size-2 rounded-full bg-accent"
        />
      ) : null}
    </button>
  );
}

/** "Show activity" on the chat's working line while the panel is closed. */
export function ShowActivity() {
  const toggle = useContext(ActivityToggleContext);
  if (toggle === undefined || toggle.open) return null;
  return (
    <button type="button" onClick={toggle.toggle} className="text-accent-text hover:underline">
      {activityWords.show}
    </button>
  );
}

/** A window with a pane on its right side. */
function PanelIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M10 2.5v11" />
    </svg>
  );
}

function remembered(): boolean | undefined {
  const kept = globalThis.localStorage?.getItem(rememberedKey);
  return kept === null || kept === undefined ? undefined : kept === "open";
}

function remember(open: boolean): void {
  globalThis.localStorage?.setItem(rememberedKey, open ? "open" : "closed");
}
