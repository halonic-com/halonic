import { useEffect, useState } from "react";

/** Whether a pointer button is held down on the page, and a way to wait for its release. */
export interface PointerPress {
  /** Whether a button is held down now. */
  held(): boolean;
  /**
   * Runs `run` a task after the held button is released, or at once when none is held. Returns a
   * function that cancels it.
   */
  afterRelease(run: () => void): () => void;
}

/**
 * Follows the pointer's presses on the whole page, so a popover can open after the press that
 * asked for it. A popover's light dismiss runs when a press is released, and on macOS and Linux a
 * right-click fires `contextmenu` on the press: a menu shown from it would be closed again by the
 * release of that same click. Waiting a task after the release lets the light dismiss go first.
 *
 * A cancelled press counts as released, and so does the window losing the focus, as the
 * browser's own menu may take the release.
 */
export function usePointerPress(): PointerPress {
  const [press] = useState(createPointerPress);
  useEffect(() => press.listen(), [press]);
  return press;
}

function createPointerPress(): PointerPress & { listen(): () => void } {
  let held = false;
  let waiting: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onPress = () => {
    held = true;
  };
  const onRelease = () => {
    held = false;
    const run = waiting;
    waiting = undefined;
    if (run !== undefined) {
      timer = setTimeout(run, 0);
    }
  };

  function cancel(): void {
    waiting = undefined;
    clearTimeout(timer);
    timer = undefined;
  }

  return {
    held: () => held,
    afterRelease(run) {
      cancel();
      if (held) {
        waiting = run;
      } else {
        run();
      }
      return cancel;
    },
    listen() {
      document.addEventListener("pointerdown", onPress, { capture: true });
      document.addEventListener("pointerup", onRelease, { capture: true });
      document.addEventListener("pointercancel", onRelease, { capture: true });
      addEventListener("blur", onRelease);
      return () => {
        cancel();
        held = false;
        document.removeEventListener("pointerdown", onPress, { capture: true });
        document.removeEventListener("pointerup", onRelease, { capture: true });
        document.removeEventListener("pointercancel", onRelease, { capture: true });
        removeEventListener("blur", onRelease);
      };
    },
  };
}
