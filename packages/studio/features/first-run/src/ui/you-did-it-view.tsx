import type { RunSummary } from "@halonicjs/events";
import type { AskKeysText } from "@halonicjs/studio-feature-feedback/api";
import type { AnsweredViewProps } from "@halonicjs/studio-feature-inbox/api";
import { type RunModelPath, type RunsList, runModelPath } from "@halonicjs/studio-feature-runs/api";
import { RUN_FORM_STEP } from "@halonicjs/studio-feature-workflows/api";
import { Button, SkeletonBar } from "@halonicjs/studio-kit";
import type { ItemRef, OpenItemOptions } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SUPPORT_HUB, SUPPORT_WORKFLOW } from "../first-run.ts";
import { youDidItWords } from "../first-run-words.ts";
import { DEFAULT_ALIAS } from "../own-progress.ts";
import { youDidItFacts } from "../you-did-it.ts";

const supportReply: ItemRef = { kind: "workflow", hub: SUPPORT_HUB, id: SUPPORT_WORKFLOW };
/** The demo's model alias, whose tab Pick a model opens once the first run is done. */
const defaultModel: ItemRef = { kind: "model-alias", hub: "local", id: DEFAULT_ALIAS };

/**
 * Props for {@link YouDidItView}: the Inbox's, the runs it reads the run's record from, and quick
 * ask's keys where the app gives them.
 */
export interface YouDidItViewProps extends AnsweredViewProps {
  readonly runs: Pick<RunsList, "state" | "subscribe" | "source">;
  readonly askKeys?: AskKeysText | undefined;
}

/**
 * "You did it" (`first-run.you-did-it`, first-run-flow 3.5): the title, which takes focus as it
 * opens, the run's real numbers once the runs list has it finished, the two next steps, the quiet
 * Google line and **Close**. On Sample answers the cost part gives way to the sample line, and
 * **Pick a model** replaces Run it again. While quick ask's keys work, a last line names them
 * (`first-run.you-did-it-quick-ask`).
 */
export function YouDidItView({ item, runs, askKeys, close, openItem }: YouDidItViewProps) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const summary = useFinishedRun(runs, item.runId);
  const keys = useAskKeys(askKeys);
  const path = usePathOnce(runs.source, summary?.id);
  const facts =
    summary === undefined || path === undefined
      ? undefined
      : youDidItFacts(summary, path.path, runs.source.currency());
  const open = (target: ItemRef, options?: OpenItemOptions) => () => openItem?.(target, options);
  return (
    <section className="flex flex-col gap-4 p-6">
      <h2 ref={title} tabIndex={-1} className="flex items-baseline gap-2 text-title">
        <span aria-hidden="true" className="text-success">
          ✓
        </span>
        {youDidItWords.title}
      </h2>
      {facts === undefined ? (
        <div role="status">
          <span className="sr-only">{youDidItWords.loading}</span>
          <SkeletonBar kind="value" />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-small text-fg-muted">{facts.line}</p>
          {facts.sample && <p className="text-small">{youDidItWords.sample}</p>}
        </div>
      )}
      {facts !== undefined && openItem !== undefined && (
        <div className="flex flex-col gap-2">
          <h3 className="text-body font-medium">{youDidItWords.next}</h3>
          <ul className="flex flex-col items-start gap-1">
            <li>
              {facts.sample ? (
                <Button variant="ghost" onClick={open(defaultModel)}>
                  {youDidItWords.pickModel}
                </Button>
              ) : (
                <Button variant="ghost" onClick={open(supportReply, { step: RUN_FORM_STEP })}>
                  {youDidItWords.runAgain}
                </Button>
              )}
            </li>
            <li className="flex flex-wrap items-baseline gap-x-1">
              <Button variant="ghost" onClick={open(supportReply)}>
                {youDidItWords.change}
              </Button>
              <span className="text-small text-fg-muted">{youDidItWords.changeHint}</span>
            </li>
            {keys !== undefined && (
              <li className="px-3 text-small text-fg-muted">{youDidItWords.askAnywhere(keys)}</li>
            )}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-prose text-small text-fg-muted">{youDidItWords.google}</p>
        <Button variant="ghost" onClick={close}>
          {youDidItWords.close}
        </Button>
      </div>
    </section>
  );
}

/** Quick ask's keys while they work; none without `askKeys`. */
function useAskKeys(askKeys: AskKeysText | undefined): string | undefined {
  return useSyncExternalStore(
    (listener) => askKeys?.subscribe(listener) ?? (() => undefined),
    () => askKeys?.current(),
  );
}

/** The run's summary once the runs list has it finished; `undefined` until then. */
function useFinishedRun(
  runs: Pick<RunsList, "state" | "subscribe">,
  runId: string,
): RunSummary | undefined {
  const run = useSyncExternalStore(
    (listener) => runs.subscribe(listener),
    () => runs.state.runs.find((each) => each.summary.id === runId),
  );
  return run?.summary.status === "completed" ? run.summary : undefined;
}

/**
 * The finished run's model path, read once it has finished: `undefined` until read, so the cost
 * part and the first next step never change under the person. A log that can't be read is logged
 * and counts as no path, which shows the numbers without a cost part.
 */
function usePathOnce(
  source: RunsList["source"],
  runId: string | undefined,
): { readonly path: RunModelPath | undefined } | undefined {
  const [read, setRead] = useState<{ readonly runId: string; readonly path?: RunModelPath }>();
  useEffect(() => {
    if (runId === undefined) return;
    let current = true;
    const done = (path: RunModelPath | undefined) => {
      if (current) setRead(path === undefined ? { runId } : { runId, path });
    };
    runModelPath(source, runId).then(done, (error: unknown) => {
      console.error("Couldn't read the run's models.", error);
      done(undefined);
    });
    return () => {
      current = false;
    };
  }, [source, runId]);
  return read !== undefined && read.runId === runId ? { path: read.path } : undefined;
}
