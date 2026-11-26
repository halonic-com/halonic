import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import type { StillSize } from "../overlay/drag.ts";
import { FeedbackOverlay } from "../overlay/feedback-overlay.tsx";
import { heardShortcut, matchesShortcut } from "../settings/shortcut-keys.ts";

/**
 * How long the shell holds the still for a selection (`STILL_LIFETIME` in `feedback_held.rs`). The
 * overlay closes itself after as long, since a box drawn later would find nothing to crop.
 */
export const stillLifetime = 120_000;

/** What {@link startInAppFeedback} needs of the window it runs in. */
export interface InAppFeedbackParts {
  /**
   * The shell; `plugin:feedback|start`, `select` and `end` are granted to Studio's own windows only
   * (Studio, Halonic Inbox and Halonic Messenger).
   */
  readonly ipc: FeedbackIpc;
  /** The platform the shortcut is read for: `CommandOrControl` is ⌘ on macOS. */
  readonly platform: KeyboardPlatform;
  /**
   * The feedback shortcut now, as the shell saves it; read on every key press. One that holds none
   * of Ctrl, Alt and ⌘ counts as the default.
   */
  readonly shortcut: () => string;
  /** The window whose keys start the feedback and whose page shows the overlay. */
  readonly window: Window;
}

/**
 * Starts the feedback shortcut in Studio's own window (`feedback.in-app`). Only this window hears
 * it, and only while it is focused: nothing is registered system-wide. A press asks the shell to
 * take a still of this window (`plugin:feedback|start`) and then shows the see-through selection
 * overlay over the live app; a press while the overlay shows ends the feedback. The shell answers
 * `send_open` when it brought the Send feedback window forward instead, and `unavailable` when it
 * showed the window that says capture isn't available: then no overlay shows. The overlay closes
 * itself when the shell drops the still, after {@link stillLifetime}. Gives the stop.
 */
export function startInAppFeedback(parts: InAppFeedbackParts): () => void {
  const { ipc, platform, shortcut, window } = parts;
  let shown:
    | {
        readonly root: Root;
        readonly element: HTMLElement;
        readonly expiry: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let starting = false;

  const close = () => {
    const closing = shown;
    shown = undefined;
    if (closing === undefined) return;
    clearTimeout(closing.expiry);
    closing.root.unmount();
    closing.element.remove();
  };

  const show = (still: StillSize) => {
    const document = window.document;
    const element = document.createElement("div");
    element.dataset["feedbackLayer"] = "";
    document.body.append(element);
    const root = createRoot(element);
    shown = { root, element, expiry: setTimeout(close, stillLifetime) };
    root.render(
      <StrictMode>
        <FeedbackOverlay ipc={ipc} still={still} onClose={close} />
      </StrictMode>,
    );
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || !matchesShortcut(heardShortcut(shortcut()), event, platform)) return;
    event.preventDefault();
    event.stopPropagation();
    if (shown !== undefined) {
      close();
      ipc.invoke(feedbackCommands.end).catch((error: unknown) => {
        console.error("The feedback didn't end:", error);
      });
      return;
    }
    if (starting) return;
    starting = true;
    ipc
      .invoke(feedbackCommands.start)
      .then((answer) => {
        const still = stillSizeOf(answer);
        if (still !== undefined) show(still);
      })
      .catch((refusal: unknown) => {
        if (refusal === "send_open" || refusal === "unavailable" || refusal === "busy") return;
        console.error("The feedback didn't start:", refusal);
      })
      .finally(() => {
        starting = false;
      });
  };

  // Heard first, so the composer or a find bar never takes the keys.
  window.addEventListener("keydown", onKey, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    close();
  };
}

/** The `{ width, height }` the shell answers `start` with, or `undefined` for anything else. */
function stillSizeOf(answer: unknown): StillSize | undefined {
  if (typeof answer !== "object" || answer === null) return undefined;
  const { width, height } = answer as Record<string, unknown>;
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  if (!(width > 0 && height > 0)) return undefined;
  return { width, height };
}
