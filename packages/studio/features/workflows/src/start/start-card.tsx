import { errorKindOf } from "@halonicjs/std";
import {
  Button,
  Callout,
  type CalloutAction,
  type CalloutHandle,
  CloseIcon,
  CommandBox,
  Field,
  TextArea,
} from "@halonicjs/studio-kit";
import { errorReasonFor, lowerAfterColon } from "@halonicjs/studio-shell";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { EngineNotAnswering, startRefusalOf } from "../api.ts";
import { startWords as words } from "./start-words.ts";

/** Props for {@link StartRunCard}. */
export interface StartRunCardProps {
  /** The workflow's name, which the card's title carries. */
  readonly workflowName: string;
  /** The input of the workflow's first test as JSON text, or `undefined` when there is none. */
  readonly firstTestInput: () => Promise<string | undefined>;
  /** Starts the run with the parsed input; resolves with the new run's id. */
  readonly start: (input: Record<string, unknown>) => Promise<{ readonly runId: string }>;
  /**
   * Opens the workspace's trust check; absent where there is none. A start refused because the
   * workspace isn't trusted then offers **Review** in place of **Try again**.
   */
  readonly askTrust?: () => Promise<"trusted" | "declined">;
  /** The reason of an engine that can't be reached, in the words for where Studio runs. */
  readonly notAnswering: string;
  readonly onStarted: (runId: string) => void;
  readonly onClose: () => void;
}

function reasonOf(error: unknown, notAnswering: string): string {
  return lowerAfterColon(
    error instanceof EngineNotAnswering ? notAnswering : errorReasonFor(error),
  );
}

/**
 * The next step a refusal carries (`fix` of a kinded error). A refusal with one can't be cured by
 * starting again, so the card shows the step in place of **Try again**.
 */
function fixOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("fix" in error)) return undefined;
  return typeof error.fix === "string" && error.fix.trim() !== "" ? error.fix : undefined;
}

/** The sentence as it ends, or with a full stop; a line that leads to a command keeps its colon. */
function withFullStop(reason: string): string {
  return /[.!?:]$/.test(reason) ? reason : `${reason}.`;
}

/** The input text as an object, or `undefined` when it isn't JSON for one. */
function parseInput(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** What a failed start shows: the line, and the next step when retrying can't help. */
interface StartFailure {
  readonly line: string;
  readonly fix: string | undefined;
  /** The command the next step leads to, which the card shows in a CommandBox (rule N2, HAL-12363). */
  readonly command: string | undefined;
  /** Refused because the workspace isn't trusted yet: **Review** opens the trust check. */
  readonly untrusted: boolean;
}

function failureOf(error: unknown, notAnswering: string, canAskTrust: boolean): StartFailure {
  const line = words.couldntStart(withFullStop(reasonOf(error, notAnswering)));
  const untrusted = canAskTrust && errorKindOf(error) === "denied";
  const refusal = startRefusalOf(error);
  return refusal === undefined
    ? { line, fix: fixOf(error), command: undefined, untrusted }
    : { line, fix: refusal.fix, command: refusal.command, untrusted };
}

/**
 * The card **▶ Run** opens (`workflows.start.start-run`), docked at the right: the run's input and
 * **Start run**. A failed start stays in the card with the input kept, in a danger Callout that
 * takes focus, with **Try again** (D7), unless the refusal names a next step: then the step is the second line and there is no **Try again**. A step that leads to a command has the command in a CommandBox under it.
 * A refusal because the workspace isn't trusted yet has **Review** instead, which opens the trust
 * check; once the person trusts it, the failure goes and **Start run** takes focus (C144 RT1).
 */
export function StartRunCard({
  workflowName,
  firstTestInput,
  start,
  askTrust,
  notAnswering,
  onStarted,
  onClose,
}: StartRunCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const callout = useRef<CalloutHandle>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("{}");
  // Set while the input still holds what the first test gave, so the note says where it came from.
  const [filled, setFilled] = useState(false);
  const typed = useRef(false);
  // Read once, when the card opens: a later render hands over a new function, not a new question.
  const readFirstInput = useRef(firstTestInput);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [failure, setFailure] = useState<StartFailure | undefined>();
  useEffect(() => heading.current?.focus(), []);
  // The input starts from the first test's; typing before it has been read wins over it.
  useEffect(() => {
    let stopped = false;
    void readFirstInput.current().then((input) => {
      if (stopped || typed.current || input === undefined) return;
      setText(input);
      setFilled(true);
    });
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    if (failure !== undefined) callout.current?.focus();
  }, [failure]);
  // Each rejected input sends focus to the field once its error is its description, so the error
  // is read, as the Inbox request form's Send does (A7). A count, as the same error can come twice.
  const [rejected, setRejected] = useState(0);
  useEffect(() => {
    if (rejected > 0) field.current?.focus();
  }, [rejected]);
  // Counts the trusts from **Review**: Start run is back, and takes focus from Review, which is gone.
  const [trusted, setTrusted] = useState(0);
  useEffect(() => {
    if (trusted > 0) startButton.current?.focus();
  }, [trusted]);

  const review = async () => {
    if ((await askTrust?.()) !== "trusted") return;
    setFailure(undefined);
    setTrusted((count) => count + 1);
  };

  const submit = async () => {
    const input = parseInput(text);
    if (input === undefined) {
      setProblem(words.inputNotObject);
      setRejected((count) => count + 1);
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      const { runId } = await start(input);
      onStarted(runId);
    } catch (error) {
      setFailure(failureOf(error, notAnswering, askTrust !== undefined));
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
  return (
    <aside
      aria-label={words.startRun}
      onKeyDown={onKeyDown}
      className="flex w-120 max-w-full shrink-0 flex-col gap-4 overflow-auto border-s border-border bg-surface-raised p-6 shadow-2"
    >
      {/* A long name wraps, so Close stays inside a narrow window. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-fg-muted">{words.cardKind}</p>
          <h2 ref={heading} tabIndex={-1} className="text-title wrap-anywhere">
            {words.runNamed(workflowName)}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={words.closeCard}
          onClick={onClose}
        />
      </div>
      <Field
        label={words.inputField}
        error={problem ?? null}
        {...(filled ? { hint: words.filledFromFirstTest } : {})}
      >
        <TextArea
          ref={field}
          value={text}
          readOnly={busy}
          submitOnCtrlEnter
          onChange={(event) => {
            typed.current = true;
            setFilled(false);
            setProblem(undefined);
            setText(event.target.value);
          }}
        />
      </Field>
      {failure !== undefined && (
        <Callout
          tone="danger"
          announce="focus"
          ref={callout}
          {...failureAction(failure, submit, () => void review())}
        >
          <p>{failure.line}</p>
          {failure.fix !== undefined && <p>{withFullStop(failure.fix)}</p>}
          {failure.command !== undefined && <CommandBox command={failure.command} />}
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        {failure === undefined && (
          <Button
            ref={startButton}
            variant="primary"
            size="sm"
            busy={busy}
            busyLabel={words.starting}
            onClick={() => void submit()}
          >
            {words.startRun}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          {words.cancel}
        </Button>
      </div>
    </aside>
  );
}

/** **Review** on an untrusted refusal, **Try again** on another without a next step, else none. */
function failureAction(
  failure: StartFailure,
  submit: () => Promise<void>,
  review: () => void,
): { readonly action?: CalloutAction } {
  if (failure.untrusted) return { action: { label: words.review, onClick: review } };
  return failure.fix === undefined ? { action: { label: words.tryAgain, onClick: submit } } : {};
}
