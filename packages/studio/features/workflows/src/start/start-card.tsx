import {
  Button,
  Callout,
  type CalloutHandle,
  CloseIcon,
  Field,
  TextArea,
} from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { EngineNotAnswering } from "../api.ts";
import { startWords as words } from "./start-words.ts";

/** Props for {@link StartRunCard}. */
export interface StartRunCardProps {
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
  return error instanceof Error ? error.message : String(error);
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

/**
 * The card **▶ Run** opens (`workflows.start.start-run`), docked at the right: the run's input and
 * **Start run**. A failed start stays in the card with the input kept, in a danger Callout that
 * takes focus, with **Try again** (D7).
 */
export function StartRunCard({ start, notAnswering, onStarted, onClose }: StartRunCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const callout = useRef<CalloutHandle>(null);
  const [text, setText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (failure !== undefined) callout.current?.focus();
  }, [failure]);

  const submit = async () => {
    const input = parseInput(text);
    if (input === undefined) {
      setProblem(words.inputNotObject);
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      const { runId } = await start(input);
      onStarted(runId);
    } catch (error) {
      const reason = reasonOf(error, notAnswering);
      setFailure(words.couldntStart(withFullStop(reason)));
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
      className="flex w-120 shrink-0 flex-col gap-4 overflow-auto border-s border-border bg-surface-raised p-6 shadow-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-fg-muted">{words.cardKind}</p>
          <h2 ref={heading} tabIndex={-1} className="text-title">
            {words.run}
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
      <Field label={words.inputField} error={problem ?? null}>
        <TextArea
          value={text}
          readOnly={busy}
          submitOnCtrlEnter
          onChange={(event) => {
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
          action={{ label: words.tryAgain, onClick: submit }}
        >
          {failure}
        </Callout>
      )}
      {failure === undefined && (
        <div>
          <Button
            variant="primary"
            size="sm"
            busy={busy}
            busyLabel={words.starting}
            onClick={() => void submit()}
          >
            {words.startRun}
          </Button>
        </div>
      )}
    </aside>
  );
}
