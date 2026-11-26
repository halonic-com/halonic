import { Button, Field, Kbd, TextArea } from "@halonicjs/studio-kit";
import { type FormEvent, type Ref, type RefObject, useId, useRef, useState } from "react";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import { type StillState, useStill } from "../overlay/use-still.ts";
import { feedbackTitle } from "../payload.ts";
import { useEscapeEnds } from "../use-escape-ends.ts";
import { CropView } from "./crop-view.tsx";
import { type FeedbackDetails, type SendOutgoing, useHandOn } from "./hand-on.ts";
import { canvasPng, type PngEncoder } from "./screenshot-png.ts";
import { type FeedbackConnection, type Screenshot, SendNotice } from "./send-notice.tsx";
import { useShownAfterWait } from "./show-after.ts";

/** Props for {@link SendFeedback}. */
export interface SendFeedbackProps {
  /** The shell, for the crop and to end the feedback. */
  readonly ipc: FeedbackIpc;
  readonly send: SendOutgoing;
  readonly details: FeedbackDetails;
  /** Whether Send sends now or saves the feedback until Studio is online; `online` by default. */
  readonly connection?: FeedbackConnection;
  /**
   * Closes the window, keeping the text, and starts a new selection, offered where the crop
   * couldn't be loaded. Without it that box offers only Send without a screenshot.
   */
  readonly selectAgain?: () => void;
  /** Saves the crop as a PNG; the page's canvas unless a test gives another. */
  readonly encodePng?: PngEncoder;
}

/**
 * The Send feedback window (`feedback.send-window`, sketch on HAL-18562 §2, states on HAL-19384):
 * the crop, its size, the text field and its footnote, with Cancel and Send. Send, or Ctrl Enter
 * (⌘ ↩), hands the feedback on and ends; with nothing written it says "Write a line about what
 * you saw." and sends nothing. A refused Send keeps the window open and says why
 * (`feedback.send-states`). Cancel and Esc end the feedback and keep nothing.
 */
export function SendFeedback(props: SendFeedbackProps) {
  const { ipc, details } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const still = useStill(ipc, canvas, feedbackCommands.crop);
  const { text, error, type, submit, handing } = useSend(props, still, textField);
  const spinner = useShownAfterWait(handing.sending);
  const footnoteId = useId();
  useEscapeEnds(ipc);

  return (
    <form
      // The window is opaque and has no frame, so a 1px edge keeps it apart from a window of the
      // same colour behind it (design check on HAL-19208).
      className="fixed inset-0 flex flex-col gap-4 border border-border-strong bg-app-panel p-6 text-fg"
      data-feedback-send=""
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submit("crop");
      }}
    >
      <CropView
        canvas={canvas}
        still={still}
        sending={handing.sending}
        onSelectAgain={props.selectAgain}
        onSendWithoutScreenshot={() => submit("none")}
      />
      <TextBox
        ref={textField}
        text={text}
        error={error}
        sending={handing.sending}
        footnoteId={footnoteId}
        onChange={type}
      />
      <SendNotice
        problem={handing.problem}
        connection={props.connection ?? "online"}
        onSend={submit}
      />
      <Footnote id={footnoteId} details={details} />
      {/* Last in the page, so Tab goes from the text to Cancel and Send; shown first, as a title bar. */}
      {/* The spinner shows only after 300 ms, so a quick send just closes the window. */}
      <TitleBar busy={spinner} onCancel={() => endFeedback(ipc)} />
    </form>
  );
}

/**
 * The text and its error, and the Send that checks them: with nothing written it says why and
 * focuses the field, and Send does nothing until the crop is there; Send without a screenshot
 * needs none.
 */
function useSend(
  props: SendFeedbackProps,
  still: StillState,
  textField: RefObject<HTMLTextAreaElement | null>,
) {
  const [openedAt] = useState(props.details.now);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const handing = useHandOn(props.ipc, props.send);
  const type = (next: string) => {
    setText(next);
    setError(undefined);
  };
  const submit = (screenshot: Screenshot) => {
    if (handing.sending) return;
    if (feedbackTitle(text) === "") {
      setError(feedbackWords.emptyText);
      textField.current?.focus();
      return;
    }
    const crop = screenshot === "crop" && still.kind === "ready" ? still.still : null;
    if (screenshot === "crop" && crop === null) return;
    const encodePng = props.encodePng ?? canvasPng;
    handing.start({ text, crop, openedAt, details: props.details, encodePng }, screenshot);
  };
  return { text, error, type, submit, handing };
}

/** The text field, read-only in its subtle fill while sending, so nothing typed then gets lost. */
function TextBox(props: {
  readonly ref: Ref<HTMLTextAreaElement>;
  readonly text: string;
  readonly error: string | undefined;
  readonly sending: boolean;
  readonly footnoteId: string;
  readonly onChange: (text: string) => void;
}) {
  return (
    <Field label={feedbackWords.textLabel} hideLabel error={props.error ?? null}>
      <TextArea
        ref={props.ref}
        value={props.text}
        placeholder={feedbackWords.placeholder}
        minRows={3}
        maxRows={8}
        submitOnCtrlEnter
        readOnly={props.sending}
        // A screen reader also hears what goes with the text.
        describedBy={props.footnoteId}
        // The window opens to be typed in (sketch §2).
        autoFocus
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
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
