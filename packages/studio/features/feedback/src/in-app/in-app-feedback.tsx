import type { ToastMessage } from "@halonicjs/studio-kit";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FeedbackConnected } from "../api.ts";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import type { StillSize } from "../overlay/drag.ts";
import { FeedbackOverlay } from "../overlay/feedback-overlay.tsx";
import type { StillImage } from "../overlay/still.ts";
import { discardedToast } from "../send/feedback-toast.ts";
import type { FeedbackDetails, SendOutgoing } from "../send/hand-on.ts";
import { noPressedWindow, pressedWindowOf } from "../send/pressed-window.ts";
import { type FeedbackDraft, SendFeedback } from "../send/send-feedback.tsx";
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
  /** The window's toast region, where "Feedback discarded" shows with its Undo. */
  readonly toasts: { show(message: ToastMessage): unknown };
  /**
   * Whether Studio is connected to Paperclip; the shortcut is heard only while it is
   * (`feedback.connected-only`). Absent counts as connected.
   */
  readonly connected?: FeedbackConnected;
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
 * {@link stillLifetime}. The dialog's Select again closes it and starts a new selection, whose
 * dialog opens with the text kept (`feedback.select-again`). Cancel, the ✕ or Esc with text written
 * shows "Feedback discarded", whose Undo brings the dialog back with that text and crop
 * (`feedback.undo-discard`). While Studio isn't connected to Paperclip the shortcut is let through
 * as if unheard. Gives the stop.
 */
export function startInAppFeedback(parts: InAppFeedbackParts): () => void {
  const { ipc, platform, shortcut, window } = parts;
  const flow = feedbackFlow(parts);

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || !matchesShortcut(heardShortcut(shortcut()), event, platform)) return;
    if (parts.connected?.current() === false) return;
    event.preventDefault();
    event.stopPropagation();
    if (flow.layer.showing() === "dialog") return;
    if (flow.layer.showing() === "overlay") {
      flow.layer.close();
      endFeedback(ipc);
      return;
    }
    if (flow.starting()) return;
    flow.begin("", () => undefined);
  };

  // Heard first, so the composer or a find bar never takes the keys.
  window.addEventListener("keydown", onKey, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    flow.layer.close();
  };
}

/**
 * The window's feedback from a still to the dialog: `begin` asks the shell for a still and shows
 * the overlay, whose selection shows the dialog with `text` in its field; `refused` runs when no
 * still comes. The dialog's Select again begins anew with its text.
 */
function feedbackFlow(parts: InAppFeedbackParts) {
  const { ipc, window } = parts;
  const layer = feedbackLayer(window);
  let starting = false;
  // The window as it was at the press, before the overlay or the dialog showed.
  let pressed = noPressedWindow;

  const showDialog = (text: string, crop?: StillImage) => {
    layer.show(
      <SendFeedback
        ipc={ipc}
        send={parts.send}
        details={parts.details()}
        pressed={pressed}
        initialText={text}
        {...(crop === undefined ? {} : { initialCrop: crop })}
        selectAgain={selectAgain}
        onDiscarded={(draft) => parts.toasts.show(discardedToast(() => undo(draft)))}
        onClose={layer.close}
      />,
      "dialog",
    );
  };

  // Undo while another feedback shows, or starts, would take that one away, so it does nothing.
  const undo = (draft: FeedbackDraft) => {
    if (layer.showing() === undefined && !starting) showDialog(draft.text, draft.crop ?? undefined);
  };

  const begin = (text: string, refused: () => void) => {
    starting = true;
    askStill(ipc)
      .then((still) => {
        if (still === undefined) return refused();
        pressed = pressedWindowOf(window.document.title);
        const onSelected = () => showDialog(text);
        const overlay = <FeedbackOverlay {...{ ipc, still, onSelected }} onClose={layer.close} />;
        layer.show(overlay, "overlay");
      })
      .finally(() => {
        starting = false;
      });
  };

  // The still is the screen under the window, so it is taken only once the dialog is off it. When
  // the shell gives none, the dialog comes back with the text. A capture that failed dropped the
  // crop, so the dialog then says it couldn't load the screenshot and offers to send the text alone.
  function selectAgain(text: string) {
    layer.close();
    starting = true;
    afterRepaint(window, () => begin(text, () => showDialog(text)));
  }

  return { layer, begin, starting: () => starting };
}

/**
 * The still's size the shell answers `start` with, or `undefined` when it gives none. It refuses
 * as `unavailable` once it showed the window that says capture isn't available, and as `busy`
 * while a still is being taken; anything else is logged.
 */
async function askStill(ipc: FeedbackIpc): Promise<StillSize | undefined> {
  try {
    return stillSizeOf(await ipc.invoke(feedbackCommands.start));
  } catch (refusal) {
    if (refusal !== "unavailable" && refusal !== "busy") {
      console.error("The feedback didn't start:", refusal);
    }
    return undefined;
  }
}

/** Runs `then` once the window has drawn twice, so what was just taken away is off the screen. */
function afterRepaint(window: Window, then: () => void) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(then));
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
