import type { WorkflowGuideScreenProps } from "@halonicjs/studio-feature-workflows/api";
import { engineWordsOf, StartFailedCallout } from "@halonicjs/studio-shell";
import { type ComponentType, useEffect, useRef, useState } from "react";
import type { ModelChoiceService } from "../api.ts";
import type { FirstRun } from "../first-run.ts";
import type { FirstRunStart } from "../first-run-start.ts";
import { PickModel } from "../pick-model/pick-model.ts";
import type { PickModelDone } from "../pick-model/pick-model-state.ts";
import { PickModelScreen } from "./pick-model-screen.tsx";

/** What the Pick a model page needs from the First Run feature. */
export interface PickModelPageParts {
  readonly firstRun: FirstRun;
  readonly start: FirstRunStart;
  /** The model choice of the open folder; `undefined` where there is none, such as the browser demo. */
  readonly service: ModelChoiceService | undefined;
}

/**
 * The Pick a model screen as Support reply's page shows it while the first run picks a model
 * (`first-run.run`, first-run-flow 3.3 and 3.4): **Back** closes it, and Continue starts the run
 * and shows it on the page. A run that doesn't start leaves the screen with why, and **Try again**.
 * The component closes over `parts`, so the page's guide screen loads it with what it needs.
 *
 * @example
 * load: async () => ({ PickModelPage: pickModelPageOf({ firstRun, start, service }) })
 */
export function pickModelPageOf(
  parts: PickModelPageParts,
): ComponentType<WorkflowGuideScreenProps> {
  return function PickModelPage({ showRun }: WorkflowGuideScreenProps) {
    const [failure, setFailure] = useState<{ readonly error: unknown } | undefined>();
    // The page hands a new `showRun` on every draw; the run shows with the latest one.
    const show = useRef(showRun);
    show.current = showRun;
    // The last choice whose run didn't start, for **Try again**: the choice is saved already.
    const lastDone = useRef<PickModelDone | undefined>(undefined);
    const begin = useRef<(done: PickModelDone) => Promise<void>>(async () => {});
    begin.current = async (done) => {
      setFailure(undefined);
      try {
        await parts.start.continueWith(done, (runId) => show.current(runId));
      } catch (error) {
        setFailure({ error });
        lastDone.current = done;
      }
    };
    const [pick] = useState(
      () =>
        new PickModel({
          service: parts.service,
          setTimer: (callback, delayMs) => {
            const timer = setTimeout(callback, delayMs);
            return () => clearTimeout(timer);
          },
          done: (result) => void begin.current(result),
          report: (error) => console.error("The Pick a model screen", error),
        }),
    );
    useEffect(() => () => pick.dispose(), [pick]);
    const retry = async () => {
      const done = lastDone.current;
      if (done !== undefined) await begin.current(done);
    };
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {failure === undefined ? null : (
          <div className="mx-auto w-full max-w-column px-4 pt-6">
            <StartFailedCallout
              error={failure.error}
              notAnswering={engineWordsOf({}).notAnswering}
              tryAgain={retry}
              takeFocus
            />
          </div>
        )}
        <PickModelScreen pick={pick} onBack={() => parts.firstRun.closePicker("back")} />
      </div>
    );
  };
}
