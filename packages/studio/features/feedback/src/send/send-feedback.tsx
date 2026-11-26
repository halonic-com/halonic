import { Dialog, Field, Kbd, TextArea } from "@halonicjs/studio-kit";
import { type Ref, type RefObject, useId, useRef, useState } from "react";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import type { StillImage } from "../overlay/still.ts";
import { type StillState, useStill } from "../overlay/use-still.ts";
import { feedbackTitle } from "../payload.ts";
import { CropView, PressLine } from "./crop-view.tsx";
import { type FeedbackDetails, type SendOutgoing, useHandOn } from "./hand-on.ts";
import { noPressedWindow, type PressedWindow } from "./pressed-window.ts";
import { canvasPng, type PngEncoder } from "./screenshot-png.ts";
import { type FeedbackConnection, type Screenshot, SendNotice } from "./send-notice.tsx";
import { useShownAfterWait } from "./show-after.ts";

/** What a discarded feedback had, for Undo to bring back: its text, and its crop once loaded. */
export interface FeedbackDraft {
  readonly text: string;
  readonly crop: StillImage | null;
}

/** Props for {@link SendFeedback}. */
export interface SendFeedbackProps {
  /** The shell, for the crop and to end the feedback. */
  readonly ipc: FeedbackIpc;
  readonly send: SendOutgoing;
  readonly details: FeedbackDetails;
  /** The app and window the shortcut was pressed in, for the line under the crop and the task. */
  readonly pressed?: PressedWindow;
  /** The text the field opens with: what Select again or Undo kept. Empty by default. */
  readonly initialText?: string;
  /** The crop the dialog opens with, as after Undo; it is drawn without asking the shell. */
  readonly initialCrop?: StillImage;
  /** Hears Cancel, the ✕ or Esc with text written, before the dialog goes, for "Feedback discarded". */
  readonly onDiscarded?: (draft: FeedbackDraft) => void;
  /** Takes the dialog away; the feedback has ended or is ending. */
  readonly onClose: () => void;
  /** Whether Send sends now or saves the feedback until Studio is online; `online` by default. */
  readonly connection?: FeedbackConnection;
  /**
   * Closes the dialog and starts a new selection, keeping the text it gets
   * (`feedback.select-again`). Without it there's no Select again.
   */
  readonly selectAgain?: (text: string) => void;
  /** Saves the crop as a PNG; the page's canvas unless a test gives another. */
  readonly encodePng?: PngEncoder;
}

/**
 * The Send feedback dialog (`feedback.send-window`, sketch on HAL-18562 §2, states on HAL-19384),
 * shown in the window where the shortcut was pressed: the crop, the app, window and size under it
 * with Select again (`feedback.select-again`), the text field and its footnote, with Cancel and
 * Send. Send, or Ctrl Enter (⌘ ↩), hands the feedback on and ends; with nothing written it says
 * "Write a line about what you saw." and sends nothing. A refused Send keeps the dialog open and
 * says why (`feedback.send-states`). Cancel, the ✕ and Esc end the feedback and keep nothing; with
 * text written, they first hand what was written to `onDiscarded` (`feedback.undo-discard`). Each
 * way out takes the dialog away and calls `plugin:feedback|end`.
 */
export function SendFeedback(props: SendFeedbackProps) {
  const { canvas, textField, cancel, still, text, error, type, submit, handing, again } =
    useSendDialog(props);
  // The spinner shows only after 300 ms, so a quick send just closes the dialog.
  const spinner = useShownAfterWait(handing.sending);
  const footnoteId = useId();

  return (
    <Dialog
      title={feedbackWords.sendTitle}
      size="md"
      form
      confirm={{ label: feedbackWords.send, busyLabel: feedbackWords.sending }}
      busy={spinner}
      cancelLabel={feedbackWords.cancel}
      // The dialog opens to be typed in (sketch §2).
      initialFocus={() => textField.current}
      describedBy={footnoteId}
      onConfirm={() => submit("crop")}
      onCancel={cancel}
    >
      {/* The order classes show the crop, its line, the text, the notice and the footnote in that
          order, while Tab goes text → Select again → Cancel → Send (design check on HAL-19208). */}
      <div className="flex flex-col gap-4 pt-3" data-feedback-send="">
        <CropView
          canvas={canvas}
          still={still}
          sending={handing.sending}
          onSelectAgain={again}
          onSendWithoutScreenshot={() => submit("none")}
        />
        <div className="order-3">
          <TextBox
            ref={textField}
            text={text}
            error={error}
            sending={handing.sending}
            footnoteId={footnoteId}
            onChange={type}
          />
        </div>
        <PressLine
          still={still}
          pressed={props.pressed ?? noPressedWindow}
          sending={handing.sending}
          onSelectAgain={again}
        />
        <div className="order-4 empty:hidden">
          <SendNotice
            problem={handing.problem}
            connection={props.connection ?? "online"}
            onSend={submit}
          />
        </div>
        <Footnote id={footnoteId} details={props.details} />
      </div>
    </Dialog>
  );
}

/**
 * The dialog's state: its crop and text, the way out that ends the feedback, and Select again,
 * which takes the text along so the next dialog opens with it.
 */
function useSendDialog(props: SendFeedbackProps) {
  const { ipc, selectAgain } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const end = () => {
    props.onClose();
    endFeedback(ipc);
  };
  const still = useStill(ipc, canvas, feedbackCommands.crop, props.initialCrop);
  const sending = useSend(props, end, still, textField);
  const again = selectAgain === undefined ? undefined : () => selectAgain(sending.text);
  const cancel = () => {
    if (props.onDiscarded !== undefined && feedbackTitle(sending.text) !== "") {
      props.onDiscarded({ text: sending.text, crop: still.kind === "ready" ? still.still : null });
    }
    end();
  };
  return { canvas, textField, cancel, still, again, ...sending };
}

/**
 * The text and its error, and the Send that checks them: with nothing written it says why and
 * focuses the field, and Send does nothing until the crop is there; Send without a screenshot
 * needs none.
 */
function useSend(
  props: SendFeedbackProps,
  end: () => void,
  still: StillState,
  textField: RefObject<HTMLTextAreaElement | null>,
) {
  const [openedAt] = useState(props.details.now);
  const [text, setText] = useState(props.initialText ?? "");
  const [error, setError] = useState<string>();
  const handing = useHandOn(end, props.send);
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
    const pressed = props.pressed ?? noPressedWindow;
    handing.start({ text, crop, openedAt, details: props.details, pressed, encodePng }, screenshot);
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
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  );
}

/** Where the task goes and what it carries, with the keys that send it. */
function Footnote({ id, details }: { readonly id: string; readonly details: FeedbackDetails }) {
  return (
    <div className="order-5 flex items-center justify-between gap-4 text-caption text-fg-muted">
      <p id={id}>{feedbackWords.footnote(details.project, details.assignee)}</p>
      <span className="flex shrink-0 items-center gap-1">
        <Kbd keys={details.mac ? ["⌘", "↩"] : ["Ctrl", "Enter"]} />
        {feedbackWords.sendKeyHint}
      </span>
    </div>
  );
}
