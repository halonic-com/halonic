import { Button, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { compareWords } from "../plain/proposal-text.ts";
import type { ProposalCompare } from "../proposal-decisions.ts";
import type {
  CompareChoice,
  CompareFailure,
  Comparing,
  ProposalDecisionState,
} from "./use-proposal-decisions.ts";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly texts: ProposalCompare }
  | { readonly kind: "error"; readonly reason: string };

/** What {@link ProposalCompareView} shows. */
export interface ProposalCompareViewProps {
  readonly runId: string;
  readonly comparing: Comparing;
  readonly state: ProposalDecisionState;
}

/**
 * Compare (HAL-11945 Q9), under a file the person changed after the run started: their text and
 * the run's side by side, with **Keep mine**, **Use the run's** and, when the two don't change the
 * same lines, **Combine both**. Keep mine counts as Rejected, the others as Accepted, each one undo
 * step with its toast. Nothing is written over a text Compare didn't show: if the file was saved
 * again meanwhile, Compare says so and shows it as it is now. It takes focus when it opens and whenever it
 * shows the texts again.
 */
export function ProposalCompareView({ runId, comparing, state }: ProposalCompareViewProps) {
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLElement>(null);
  const { path, failure, round } = comparing;
  // A new round replaces the texts and the button just pressed, so focus goes back to the top.
  useEffect(() => root.current?.focus(), [round]);
  return (
    <section
      ref={root}
      tabIndex={-1}
      aria-label={compareWords.name(path)}
      className="focus-ring flex flex-col gap-3 rounded-sm border border-border p-3"
    >
      {/* A file that changed again is about the texts, so it says so above them. */}
      {failure?.retry === null ? <ChoiceFailed failure={failure} state={state} /> : null}
      {/* A new key reads the texts again: after Try again, or once the file changed again. */}
      <CompareBody
        key={`${round}.${attempt}`}
        runId={runId}
        path={path}
        state={state}
        choiceFailure={failure?.retry === null ? null : failure}
        onTryAgain={() => setAttempt((count) => count + 1)}
      />
    </section>
  );
}

/** Reads the texts of `path` once, then shows them with the choices. */
function useCompareTexts(path: string, compareTexts: ProposalDecisionState["compareTexts"]) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  useEffect(() => {
    let stopped = false;
    compareTexts(path).then(
      (texts) => {
        if (!stopped) setLoaded({ kind: "ready", texts });
      },
      (error: unknown) => {
        if (stopped) return;
        setLoaded({
          kind: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      stopped = true;
    };
  }, [path, compareTexts]);
  return loaded;
}

function CompareBody({
  runId,
  path,
  state,
  choiceFailure,
  onTryAgain,
}: {
  readonly runId: string;
  readonly path: string;
  readonly state: ProposalDecisionState;
  /** A choice that failed and can be sent again: it shows right above the buttons. */
  readonly choiceFailure: CompareFailure | null;
  readonly onTryAgain: () => void;
}) {
  const loaded = useCompareTexts(path, state.compareTexts);
  if (loaded.kind === "loading") {
    return (
      <div role="status" aria-label={compareWords.loading} className="grid gap-3 wide:grid-cols-2">
        <SideSkeleton />
        <SideSkeleton />
      </div>
    );
  }
  if (loaded.kind === "error") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="alert" className="min-w-0 flex-1 text-small text-danger">
          {compareWords.loadFailed} {loaded.reason}
        </p>
        <Button size="sm" variant="ghost" onClick={onTryAgain}>
          {compareWords.tryAgain}
        </Button>
        <Button size="sm" variant="ghost" onClick={state.closeCompare}>
          {compareWords.close}
        </Button>
      </div>
    );
  }
  const { texts } = loaded;
  return (
    <>
      <div className="grid gap-3 wide:grid-cols-2">
        <Side heading={compareWords.yours} text={texts.saved} />
        <Side heading={compareWords.runs(runId)} text={texts.run} />
      </div>
      {choiceFailure === null ? null : <ChoiceFailed failure={choiceFailure} state={state} />}
      <Choices state={state} texts={texts} />
    </>
  );
}

/** One side while the texts load, in the shape of {@link Side}: its heading over a block of text. */
function SideSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SkeletonBar kind="title" width="1/3" />
      <div className="h-32 rounded-sm border border-border" />
    </div>
  );
}

/** **Keep mine**, **Use the run's**, **Combine both** when it can, and **Cancel**. */
function Choices({
  state,
  texts,
}: {
  readonly state: ProposalDecisionState;
  readonly texts: ProposalCompare;
}) {
  const [pressed, setPressed] = useState<CompareChoice | null>(null);
  const sending = state.pending !== null;
  const choice = (value: CompareChoice, label: string) => (
    <Button
      size="sm"
      variant="secondary"
      busy={sending && pressed === value}
      onClick={() => {
        setPressed(value);
        state.choose(value, texts.seen);
      }}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {choice("keep-mine", compareWords.keepMine)}
      {choice("use-run", compareWords.useRuns)}
      {texts.canCombine ? choice("combine-both", compareWords.combineBoth) : null}
      <Button size="sm" variant="ghost" onClick={state.closeCompare}>
        {compareWords.cancel}
      </Button>
    </div>
  );
}

/** Why a choice wrote nothing, with **Try again** when sending it again can help (Q11). */
function ChoiceFailed({
  failure,
  state,
}: {
  readonly failure: CompareFailure;
  readonly state: ProposalDecisionState;
}) {
  const { retry } = failure;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 text-small text-danger">
      <span>{failure.line}</span>
      {retry === null ? null : (
        <Button size="sm" variant="ghost" onClick={() => state.choose(retry.choice, retry.seen)}>
          {compareWords.tryAgain}
        </Button>
      )}
    </div>
  );
}

/** One side of Compare: its heading, then the text, or "No file" muted when there is none. */
function Side({ heading, text }: { readonly heading: string; readonly text: string | null }) {
  return (
    <section aria-label={heading} className="flex min-w-0 flex-col gap-1">
      <h3 className="text-body-strong">{heading}</h3>
      {text === null ? (
        <p className="text-small text-fg-muted">{compareWords.none}</p>
      ) : (
        <pre className="max-h-80 overflow-auto rounded-sm border border-border bg-surface-subtle px-3 py-2 font-mono text-small">
          {text}
        </pre>
      )}
    </section>
  );
}
