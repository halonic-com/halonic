import { type FocusEvent, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useModalOpen } from "../dialog/open-modals.ts";
import { usePresentation } from "../presentation/presentation.tsx";
import { ToastCard } from "./toast-card.tsx";
import { useToastClearOfFocus } from "./toast-clear-of-focus.ts";
import type { Toast, ToastStore } from "./toast-store.ts";

/** At most three toasts at once on desktop; a fourth closes the oldest. */
export const TOASTS_SHOWN = 3;

/**
 * Bottom right of the shell's content area, 16px in, 360px wide. On a phone, the width less 16px
 * each side and 8px above whatever bar sits under the scroll area's wrapper. On a short phone
 * window the bars scroll with the page, so the toast sits 8px above the window's bottom instead.
 * On a phone, a toast that would cover the focused element sits at the top instead
 * (`useToastClearOfFocus`). Pointer events pass through the gaps to the page below.
 */
const region = [
  "pointer-events-none absolute right-4 bottom-4 z-(--layer-toast) flex w-toast flex-col gap-2",
  "phone:bottom-2 phone:left-4 phone:w-auto phone:short:fixed",
].join(" ");

const focusable = "button";

/** The props of `ToastRegion`. */
export interface ToastRegionProps {
  readonly store: ToastStore;
}

/**
 * Shows a toast store's toasts, newest at the bottom. The shell places it once, in a
 * `position: relative` wrapper round its content area (on a phone, round the scroll area), so
 * toasts never cover the status bar or the bar at the bottom.
 *
 * While a kit Dialog is open, toasts wait and show when it closes; screen readers still hear them
 * when they arrive. On a phone they show one at a time, in order.
 *
 * @example
 * <div className="relative min-h-0 flex-1">
 *   <main>…</main>
 *   <ToastRegion store={toasts} />
 * </div>
 */
export function ToastRegion({ store }: ToastRegionProps) {
  const toasts = useSyncExternalStore(store.subscribe, store.list, store.list);
  const phone = usePresentation() === "phone";
  const dialogOpen = useModalOpen();
  const box = useRef<HTMLElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!phone) {
      for (const toast of toasts.slice(0, -TOASTS_SHOWN)) {
        store.close(toast.id);
      }
    }
  }, [toasts, phone, store]);

  useEffect(
    () =>
      store.bindFocus(() => {
        const target = lastShown(box.current);
        const before = document.activeElement;
        // Focusing the toast first, so `entered` doesn't forget where F6 came from.
        target?.focus();
        if (target !== null && before instanceof HTMLElement && !box.current?.contains(before)) {
          cameFrom.current = before;
        }
      }),
    [store],
  );

  // Focus that came in some other way than F6 (Tab, a click) has nowhere to go back to.
  const entered = useCallback((event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      cameFrom.current = null;
    }
  }, []);

  // When the toast that had focus goes, focus moves to the newest one left, else back to where
  // it was before `focus()` (F6) brought it here (component specs 23 A2), else to the page's h1,
  // never the body (HAL-13402). The page keeps its scroll.
  const closed = useCallback(
    (id: string, hadFocus: boolean) => {
      store.close(id);
      if (hadFocus) {
        const target = lastShown(box.current, id) ?? stillThere(cameFrom.current) ?? pageHeading();
        target?.focus({ preventScroll: true });
      }
    },
    [store],
  );

  const shown = shownToasts(toasts, phone, dialogOpen);
  const top = useToastClearOfFocus(box, phone ? [...shown].at(-1) : undefined);
  // Always mounted and named, so the live cards inside it are known before they arrive.
  return (
    <section
      ref={box}
      aria-label="Notifications"
      className={region}
      style={top === null ? undefined : { top, bottom: "auto" }}
      onFocus={entered}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} waiting={!shown.has(toast.id)} onClosed={closed} />
      ))}
    </section>
  );
}

function shownToasts(toasts: readonly Toast[], phone: boolean, dialogOpen: boolean): Set<string> {
  if (dialogOpen) {
    return new Set();
  }
  const shown = phone ? toasts.slice(0, 1) : toasts.slice(-TOASTS_SHOWN);
  return new Set(shown.map((toast) => toast.id));
}

/** The newest drawn toast's first button (its action, or its close button), but not `except`'s. */
function lastShown(box: HTMLElement | null, except?: string): HTMLElement | null {
  const cards = [...(box?.querySelectorAll<HTMLElement>("[data-toast]:not(.sr-only)") ?? [])];
  const others = cards.filter((card) => card.getAttribute("data-toast") !== except);
  return others[others.length - 1]?.querySelector<HTMLElement>(focusable) ?? null;
}

/** Where F6 came from, if it can still take focus; the body (nothing focused) is no place. */
function stillThere(element: HTMLElement | null): HTMLElement | null {
  if (element === null || element === document.body || !element.isConnected) {
    return null;
  }
  return element.closest("[inert], [hidden]") === null ? element : null;
}

/** The shown page's h1, focusable from code but never a Tab stop. */
function pageHeading(): HTMLElement | null {
  const shown = (selector: string) =>
    [...document.querySelectorAll<HTMLElement>(selector)].find(
      (heading) => heading.closest("[inert], [hidden]") === null,
    );
  const heading = shown("main h1") ?? shown("h1");
  if (heading === undefined) {
    return null;
  }
  if (!heading.hasAttribute("tabindex")) {
    heading.tabIndex = -1;
  }
  return heading;
}
