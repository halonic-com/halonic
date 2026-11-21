import {
  Button,
  type ButtonUnavailable,
  Callout,
  CloseIcon,
  Field,
  TextArea,
} from "@halonicjs/studio-kit";
import { StartFailedCallout } from "@halonicjs/studio-shell";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
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
  /** The errors that stop the workflow from running, and the way to Configuration › Problems. */
  readonly problems: StartProblems;
  /**
   * **Start run**'s `unavailable` while the page's Run is, such as while the sandbox can't start:
   * a card opened before the check refused keeps its input, but can't start the run.
   */
  readonly unavailable?: ButtonUnavailable | undefined;
  readonly onStarted: (runId: string) => void;
  readonly onClose: () => void;
}

/** What {@link StartRunCard} needs to say the workflow can't run yet. */
export interface StartProblems {
  /** The errors in the workflow and in the agents it names; warnings don't count, as they don't stop a run. */
  readonly errors: number;
  readonly onOpen: () => void;
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

/**
 * The card **▶ Run** opens (`workflows.start.start-run`), docked at the right: the run's input and
 * **Start run**. A failed start stays in the card with the input kept, in a danger Callout that
 * takes focus: the shell's `StartFailedCallout`, as on the run page's **Run again** (UX check S1,
 * S2 and S4, HAL-12390), with **Try again** (D7) unless the refusal names a next step that starting
 * again can't help, the step as the second line, a step's command in a CommandBox under it, and
 * **Copy details** for a failure Halonic can't explain or one that replaces the shell's own words.
 * A refusal because the workspace isn't trusted yet has **Review** instead, which opens the trust
 * check; once the person trusts it, the failure goes and **Start run** takes focus (C144 RT1).
 * While the workflow has errors, a danger Callout says how many, with **Open Problems**, in place
 * of **Start run** (X2).
 */
export function StartRunCard({
  workflowName,
  firstTestInput,
  start,
  askTrust,
  notAnswering,
  problems,
  unavailable,
  onStarted,
  onClose,
}: StartRunCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
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
  const [failure, setFailure] = useState<{ readonly error: unknown } | undefined>();
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
      setFailure({ error });
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
        <StartFailedCallout
          error={failure.error}
          notAnswering={notAnswering}
          tryAgain={submit}
          review={askTrust === undefined ? undefined : () => void review()}
          takeFocus
        />
      )}
      {problems.errors > 0 && (
        <Callout tone="danger" action={{ label: words.openProblems, onClick: problems.onOpen }}>
          <p>{words.hasProblems(workflowName, problems.errors)}</p>
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        {failure === undefined && problems.errors === 0 && (
          <Button
            ref={startButton}
            variant="primary"
            size="sm"
            busy={busy}
            busyLabel={words.starting}
            unavailable={unavailable}
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
