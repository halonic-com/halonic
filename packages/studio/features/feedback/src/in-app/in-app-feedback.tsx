import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import type { StillSize } from "../overlay/drag.ts";
import { FeedbackOverlay } from "../overlay/feedback-overlay.tsx";
import type { FeedbackDetails, SendOutgoing } from "../send/hand-on.ts";
import { SendFeedback } from "../send/send-feedback.tsx";
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
  /** The window whose keys start the feedback and whose page shows the overlay and the dialog. */
  readonly window: Window;
  /** Hands a feedback from the Send feedback dialog on to be sent. */
  readonly send: SendOutgoing;
  /** What the Send feedback dialog says and sends; read each time it opens. */
  readonly details: () => FeedbackDetails;
}

/**
 * Starts the feedback shortcut in Studio's own window (`feedback.in-app`). Only this window hears
 * it, and only while it is focused: nothing is registered system-wide. A press asks the shell to
 * take a still of this window (`plugin:feedback|start`) and then shows the see-through selection
 * overlay over the live app; a press while the overlay shows ends the feedback. Once the shell
 * kept the crop of the selected box, the Send feedback dialog shows in this same window; no other
 * window opens (HAL-19528). A press while the dialog shows leaves it as it is, with its text. The
 * shell answers `unavailable` when it showed the window that says capture isn't available: then no
 * overlay shows. The overlay closes itself when the shell drops the still, after
 * {@link stillLifetime}. Gives the stop.
 */
export function startInAppFeedback(parts: InAppFeedbackParts): () => void {
  const { ipc, platform, shortcut, window } = parts;
  const layer = feedbackLayer(window);
  let starting = false;

  const showDialog = () => {
    layer.show(
      <SendFeedback ipc={ipc} send={parts.send} details={parts.details()} onClose={layer.close} />,
      "dialog",
    );
  };

  const show = (still: StillSize) => {
    layer.show(
      <FeedbackOverlay ipc={ipc} still={still} onClose={layer.close} onSelected={showDialog} />,
      "overlay",
    );
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || !matchesShortcut(heardShortcut(shortcut()), event, platform)) return;
    event.preventDefault();
    event.stopPropagation();
    if (layer.showing() === "dialog") return;
    if (layer.showing() === "overlay") {
      layer.close();
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
        if (refusal === "unavailable" || refusal === "busy") return;
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
    layer.close();
  };
}

/** What the feedback shows in the window: the selection overlay, then the Send feedback dialog. */
type Showing = "overlay" | "dialog";

/**
 * The window's one feedback layer, at the end of its page. Showing a page takes away the one
 * before; the overlay takes itself away after {@link stillLifetime}, when the shell drops the still.
 */
function feedbackLayer(window: Window) {
  let shown:
    | {
        readonly root: Root;
        readonly element: HTMLElement;
        readonly showing: Showing;
        readonly expiry?: ReturnType<typeof setTimeout>;
      }
    | undefined;

  const close = () => {
    const closing = shown;
    shown = undefined;
    if (closing === undefined) return;
    clearTimeout(closing.expiry);
    closing.root.unmount();
    closing.element.remove();
  };

  const show = (page: ReactNode, showing: Showing) => {
    close();
    const element = window.document.createElement("div");
    element.dataset["feedbackLayer"] = "";
    window.document.body.append(element);
    const root = createRoot(element);
    const expiry = showing === "overlay" ? setTimeout(close, stillLifetime) : undefined;
    shown = { root, element, showing, ...(expiry === undefined ? {} : { expiry }) };
    root.render(<StrictMode>{page}</StrictMode>);
  };

  return { show, close, showing: (): Showing | undefined => shown?.showing };
}

/** The `{ width, height }` the shell answers `start` with, or `undefined` for anything else. */
function stillSizeOf(answer: unknown): StillSize | undefined {
  if (typeof answer !== "object" || answer === null) return undefined;
  const { width, height } = answer as Record<string, unknown>;
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  if (!(width > 0 && height > 0)) return undefined;
  return { width, height };
}
