import { Button, Field, Kbd, TextArea } from "@halonicjs/studio-kit";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { sizeLabel } from "../crop.ts";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import type { StillImage } from "../overlay/still.ts";
import { useStill } from "../overlay/use-still.ts";
import { buildFeedbackTask, type FeedbackTask, feedbackTitle } from "../payload.ts";
import { useEscapeEnds } from "../use-escape-ends.ts";
import { canvasPng, type PngEncoder, screenshotPng } from "./screenshot-png.ts";

/** One feedback the window hands on to be sent: its task and its screenshot as a PNG. */
export interface OutgoingFeedback {
  readonly task: FeedbackTask;
  readonly png: Uint8Array | null;
}

/** Hands a feedback on to be sent; it settles once the feedback is taken, sent or kept. */
export type SendOutgoing = (feedback: OutgoingFeedback) => Promise<void>;

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

/** Props for {@link SendFeedback}. */
export interface SendFeedbackProps {
  /** The shell, for the crop and to end the feedback. */
  readonly ipc: FeedbackIpc;
  readonly send: SendOutgoing;
  readonly details: FeedbackDetails;
  /** Saves the crop as a PNG; the page's canvas unless a test gives another. */
  readonly encodePng?: PngEncoder;
}

/** The crop's box in the window: the dialog's 560px less its padding, and 220px high. */
const cropBox = { width: 512, height: 220 };

/**
 * The Send feedback window (`feedback.send-window`, sketch on HAL-18562 §2): the crop, its size,
 * the text field and its footnote, with Cancel and Send. Send, or Ctrl Enter (⌘ ↩), hands the
 * feedback on and ends; with nothing written it says "Write a line about what you saw." and
 * sends nothing. Cancel and Esc end the feedback and keep nothing.
 */
export function SendFeedback({ ipc, send, details, encodePng = canvasPng }: SendFeedbackProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const crop = useStill(ipc, canvas, feedbackCommands.crop);
  const [openedAt] = useState(details.now);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const footnoteId = useId();
  useEscapeEnds(ipc);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (crop === undefined || sending) return;
    if (feedbackTitle(text) === "") {
      setError(feedbackWords.emptyText);
      textField.current?.focus();
      return;
    }
    setSending(true);
    outgoing({ text, crop, openedAt, details, encodePng })
      .then(send)
      .then(() => endFeedback(ipc))
      .catch((failure: unknown) => {
        console.error("The feedback wasn't sent:", failure);
        setSending(false);
      });
  };

  return (
    <form
      // The window is opaque and has no frame, so a 1px edge keeps it apart from a window of the
      // same colour behind it (design check on HAL-19208).
      className="fixed inset-0 flex flex-col gap-4 border border-border-strong bg-app-panel p-6 text-fg"
      data-feedback-send=""
      onSubmit={onSubmit}
    >
      <CropView canvas={canvas} crop={crop} />
      <Field label={feedbackWords.textLabel} hideLabel error={error ?? null}>
        <TextArea
          ref={textField}
          value={text}
          placeholder={feedbackWords.placeholder}
          minRows={3}
          maxRows={8}
          submitOnCtrlEnter
          // A screen reader also hears what goes with the text.
          describedBy={footnoteId}
          // The window opens to be typed in (sketch §2).
          autoFocus
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
          }}
        />
      </Field>
      <Footnote id={footnoteId} details={details} />
      {/* Last in the page, so Tab goes from the text to Cancel and Send; shown first, as a title bar. */}
      {/* Send stays still while the crop loads: a press then does nothing, and nothing is sending. */}
      <TitleBar busy={sending} onCancel={() => endFeedback(ipc)} />
    </form>
  );
}

/** The crop, fitted in its box, and its size under it. */
function CropView({
  canvas,
  crop,
}: {
  readonly canvas: RefObject<HTMLCanvasElement | null>;
  readonly crop: StillImage | undefined;
}) {
  return (
    // Close together, so the size reads as the crop's caption.
    <div className="flex flex-col gap-2">
      <div
        className="flex shrink-0 items-center justify-center rounded-md bg-surface-subtle"
        style={{ height: cropBox.height }}
      >
        <canvas ref={canvas} style={crop === undefined ? undefined : fittedSize(crop)} />
      </div>
      <p className="font-mono text-caption text-fg-muted" data-feedback-size="">
        {crop === undefined ? "" : sizeLabel({ x: 0, y: 0, ...crop })}
      </p>
    </div>
  );
}

/** Where the task goes and what it carries, with the keys that send it. */
function Footnote({ id, details }: { readonly id: string; readonly details: FeedbackDetails }) {
  return (
    <div className="flex items-center justify-between gap-4 text-caption text-fg-muted">
      <p id={id}>{feedbackWords.footnote(details.project, details.assignee)}</p>
      <span className="flex shrink-0 items-center gap-1">
        <Kbd keys={details.mac ? ["⌘", "↩"] : ["Ctrl", "Enter"]} />
        {feedbackWords.sendKeyHint}
      </span>
    </div>
  );
}

/** "Send feedback" with Cancel and Send at its right. */
function TitleBar({ busy, onCancel }: { readonly busy: boolean; readonly onCancel: () => void }) {
  return (
    <div className="order-first flex items-center justify-between gap-4">
      <h1 className="text-heading">{feedbackWords.sendTitle}</h1>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {feedbackWords.cancel}
        </Button>
        <Button type="submit" busy={busy}>
          {feedbackWords.send}
        </Button>
      </div>
    </div>
  );
}

/** The feedback to hand on: the task, with the crop as a PNG small enough to send. */
async function outgoing(parts: {
  readonly text: string;
  readonly crop: StillImage;
  readonly openedAt: Date;
  readonly details: FeedbackDetails;
  readonly encodePng: PngEncoder;
}): Promise<OutgoingFeedback> {
  const { text, crop, openedAt, details } = parts;
  const screenshot = await screenshotPng(crop, parts.encodePng);
  const build = buildFeedbackTask({
    text,
    // The shell doesn't yet say which app and window were in front at the press (HAL-19010).
    app: "",
    window: "",
    capturedAt: openedAt,
    utcOffsetMinutes: -openedAt.getTimezoneOffset(),
    studioVersion: details.studioVersion,
    screenshot: { width: screenshot.width, height: screenshot.height },
    project: details.project,
    assignee: details.assignee,
  });
  if (build.kind !== "task") throw new Error("The feedback has no title.");
  return { task: build.task, png: screenshot.png };
}

/** The crop at its own size in CSS pixels, shrunk to fit its box and never stretched. */
function fittedSize(crop: StillImage): { width: number; height: number } {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = crop.width / pixelRatio;
  const height = crop.height / pixelRatio;
  const scale = Math.min(1, cropBox.width / width, cropBox.height / height);
  return { width: width * scale, height: height * scale };
}
