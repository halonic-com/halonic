import { enter, flip, leave, swap } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * The kit's motions the Inbox plays (design review HAL-18481, motions 2 and 6). A test passes its
 * own to see which played, so nothing stubs `element.animate` for the whole run.
 */
export interface InboxMotion {
  readonly flip: typeof flip;
  readonly enter: typeof enter;
  readonly swap: typeof swap;
  /** Fades a row that ended out before it leaves the list (`inbox.final-state`). */
  readonly leave: typeof leave;
}

/** The kit's own motions, which play nothing where `element.animate` is missing. */
export const kitMotion: InboxMotion = { flip, enter, swap, leave };

/**
 * What ends a press. A press let go outside the window sends no `pointerup` here, so the click
 * that follows a press, and the window losing focus, end it too: a change is never held for good.
 */
const pressEnds = ["pointerup", "pointercancel", "click", "blur"] as const;

/**
 * The store's state, each change applied inside `motion.flip`, so the rows that stay glide to
 * their new place and new rows drop in (motion 6, `inbox.list-motion`). A change that comes while
 * a pointer is pressed on the list waits until it is let go, so no row moves under it and you
 * never open the wrong one.
 */
export function useGlidingState<State>(
  subscribe: (listener: () => void) => () => void,
  read: () => State,
  list: RefObject<HTMLElement | null>,
  motion: InboxMotion,
): State {
  const [state, setState] = useState(read);
  useEffect(() => {
    let pressed = false;
    let held = false;
    const update = () => {
      held = pressed;
      if (!pressed) glide(list.current, () => flushSync(() => setState(read())), motion);
    };
    const down = (event: PointerEvent) => {
      pressed = event.target instanceof Node && list.current?.contains(event.target) === true;
    };
    const up = () => {
      pressed = false;
      if (held) update();
    };
    window.addEventListener("pointerdown", down);
    for (const name of pressEnds) window.addEventListener(name, up);
    // What changed between the first render and this listener.
    setState(read());
    const stop = subscribe(update);
    return () => {
      stop();
      window.removeEventListener("pointerdown", down);
      for (const name of pressEnds) window.removeEventListener(name, up);
    };
  }, [subscribe, read, list, motion]);
  return state;
}

/** Applies the change with the rows gliding, then drops in each row that wasn't there before. */
function glide(list: HTMLElement | null, apply: () => void, motion: InboxMotion): void {
  const body = list?.querySelector<HTMLElement>('[role="grid"] tbody');
  if (body === null || body === undefined) {
    apply();
    return;
  }
  const before = new Set(rowIds(body));
  void motion.flip(body, apply);
  for (const row of body.querySelectorAll<HTMLElement>("tr[data-row-id]")) {
    if (!before.has(row.getAttribute("data-row-id") ?? ""))
      void motion.enter(row, { move: "drop" });
  }
}

function rowIds(body: HTMLElement): string[] {
  return [...body.querySelectorAll<HTMLElement>("tr[data-row-id]")].map(
    (row) => row.getAttribute("data-row-id") ?? "",
  );
}
