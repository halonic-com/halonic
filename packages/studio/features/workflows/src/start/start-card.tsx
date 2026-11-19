import {
  Button,
  Callout,
  type CalloutHandle,
  CloseIcon,
  Field,
  TextArea,
} from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { EngineNotAnswering } from "../api.ts";
import { startWords as words } from "./start-words.ts";

/** Props for {@link StartRunCard}. */
export interface StartRunCardProps {
  /** The workflow's name, which the card's title carries. */
  readonly workflowName: string;
  /** The input of the workflow's first test as JSON text, or `undefined` when there is none. */
  readonly firstTestInput: () => Promise<string | undefined>;
  /** Starts the run with the parsed input; resolves with the new run's id. */
  readonly start: (input: Record<string, unknown>) => Promise<{ readonly runId: string }>;
  /** The reason of an engine that can't be reached, in the words for where Studio runs. */
  readonly notAnswering: string;
  readonly onStarted: (runId: string) => void;
  readonly onClose: () => void;
}

/** "The engine isn't answering." reads after a colon as "the engine …"; a name such as Halonic keeps its capital. */
function afterColon(reason: string): string {
  return reason.startsWith("The ") ? `the ${reason.slice(4)}` : reason;
}

function reasonOf(error: unknown, notAnswering: string): string {
  if (error instanceof EngineNotAnswering) return afterColon(notAnswering);
  return errorReasonFor(error);
}

/**
 * The next step a refusal carries (`fix` of a kinded error). A refusal with one can't be cured by
 * starting again, so the card shows the step in place of **Try again**.
 */
function fixOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("fix" in error)) return undefined;
  return typeof error.fix === "string" && error.fix.trim() !== "" ? error.fix : undefined;
}

function withFullStop(reason: string): string {
  return /[.!?]$/.test(reason) ? reason : `${reason}.`;
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
}

/**
 * The card **▶ Run** opens (`workflows.start.start-run`), docked at the right: the run's input and
 * **Start run**. A failed start stays in the card with the input kept, in a danger Callout that
 * takes focus, with **Try again** (D7), unless the refusal names a next step: then the step is the second line and there is no **Try again**.
 */
export function StartRunCard({
  workflowName,
  firstTestInput,
  start,
  notAnswering,
  onStarted,
  onClose,
}: StartRunCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const callout = useRef<CalloutHandle>(null);
  const field = useRef<HTMLTextAreaElement>(null);
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
      const reason = reasonOf(error, notAnswering);
      setFailure({ line: words.couldntStart(withFullStop(reason)), fix: fixOf(error) });
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-fg-muted">{words.cardKind}</p>
          <h2 ref={heading} tabIndex={-1} className="text-title">
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
          {...(failure.fix === undefined
            ? { action: { label: words.tryAgain, onClick: submit } }
            : {})}
        >
          <p>{failure.line}</p>
          {failure.fix !== undefined && <p>{withFullStop(failure.fix)}</p>}
        </Callout>
      )}
      <div className="flex gap-2">
        {failure === undefined && (
          <Button
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
