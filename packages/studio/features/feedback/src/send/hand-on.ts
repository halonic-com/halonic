import { useState } from "react";
import type { StillImage } from "../overlay/still.ts";
import { buildFeedbackTask, type FeedbackTask } from "../payload.ts";
import type { PressedWindow } from "./pressed-window.ts";
import { type PngEncoder, type ScreenshotPng, screenshotPng } from "./screenshot-png.ts";
import type { Screenshot, SendProblem } from "./send-notice.tsx";

/** One feedback the window hands on to be sent: its task and its screenshot as a PNG. */
export interface OutgoingFeedback {
  readonly task: FeedbackTask;
  readonly png: Uint8Array | null;
}

/**
 * What became of a feedback handed on: `taken` once it is sent or kept to send later, `refused`
 * when Paperclip said no, with its reason (empty when it gave none).
 */
export type SendAnswer =
  | { readonly kind: "taken" }
  | { readonly kind: "refused"; readonly reason: string };

/** Hands a feedback on to be sent; it settles once the feedback is taken or refused. */
export type SendOutgoing = (feedback: OutgoingFeedback) => Promise<SendAnswer>;

/** What the window says and sends besides what the person types. */
export interface FeedbackDetails {
  /** Where the task goes and who gets it (Settings → Feedback). */
  readonly project: string;
  readonly assignee: string;
  /** The Studio version, such as "0.2.0". */
  readonly studioVersion: string;
  /** Shows ⌘ ↩ instead of Ctrl Enter. */
  readonly mac: boolean;
  /** The clock: the window's opening stands for the press, a moment before. */
  readonly now: () => Date;
}

/** What one Send needs besides the sender. */
export interface SendParts {
  readonly text: string;
  readonly crop: StillImage | null;
  readonly openedAt: Date;
  readonly details: FeedbackDetails;
  /** The app and window the shortcut was pressed in, for the task. */
  readonly pressed: PressedWindow;
  readonly encodePng: PngEncoder;
}

/**
 * Makes the feedback and hands it on: `no-png` when the crop couldn't become a PNG, so nothing
 * was handed on, otherwise the sender's answer. A sender that fails rejects.
 */
async function handOn(
  parts: SendParts,
  send: SendOutgoing,
): Promise<SendAnswer | { readonly kind: "no-png" }> {
  let screenshot: ScreenshotPng | null = null;
  if (parts.crop !== null) {
    try {
      screenshot = await screenshotPng(parts.crop, parts.encodePng);
    } catch (failure) {
      console.error("The screenshot couldn't be prepared:", failure);
      return { kind: "no-png" };
    }
  }
  return send(outgoing(parts, screenshot));
}

/** The feedback to hand on: the task, with the crop as a PNG small enough to send, if any. */
function outgoing(parts: SendParts, screenshot: ScreenshotPng | null): OutgoingFeedback {
  const { text, openedAt, details, pressed } = parts;
  const build = buildFeedbackTask({
    text,
    app: pressed.app,
    window: pressed.window,
    capturedAt: openedAt,
    utcOffsetMinutes: -openedAt.getTimezoneOffset(),
    studioVersion: details.studioVersion,
    screenshot: screenshot === null ? null : { width: screenshot.width, height: screenshot.height },
    project: details.project,
    assignee: details.assignee,
  });
  if (build.kind !== "task") throw new Error("The feedback has no title.");
  return { task: build.task, png: screenshot?.png ?? null };
}

/** One Send at a time, and why the last one didn't go. */
export interface HandingOn {
  readonly sending: boolean;
  readonly problem: SendProblem | undefined;
  /** Hands `parts` on; `screenshot` is what Try again sends after a refusal. */
  readonly start: (parts: SendParts, screenshot: Screenshot) => void;
}

/**
 * Hands feedback on and calls `end` once it is taken. A refusal, a crop that can't become a PNG or
 * a sender that fails keeps the dialog open with the problem; the failure is logged.
 */
export function useHandOn(end: () => void, send: SendOutgoing): HandingOn {
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<SendProblem>();
  const start = (parts: SendParts, screenshot: Screenshot) => {
    setSending(true);
    setProblem(undefined);
    handOn(parts, send)
      .then((answer) => {
        if (answer.kind === "taken") {
          end();
          return;
        }
        setSending(false);
        setProblem(
          answer.kind === "no-png"
            ? { kind: "no-png" }
            : { kind: "refused", reason: answer.reason, retry: screenshot },
        );
      })
      .catch((failure: unknown) => {
        console.error("The feedback wasn't sent:", failure);
        setSending(false);
        setProblem({ kind: "refused", reason: "", retry: screenshot });
      });
  };
  return { sending, problem, start };
}
