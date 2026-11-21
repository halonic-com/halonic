import {
  Callout,
  type CalloutHandle,
  WAITING_LINE_AFTER_MS,
  WAITING_REASON_AFTER_MS,
  WaitingLine,
} from "@halonicjs/studio-kit";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useCopyDetails } from "../page/copy-details.ts";
import { LiteCheckDialog } from "./lite-check-dialog.tsx";
import { checkLines, checkReport } from "./lite-check-lines.ts";
import {
  type LiteCheckResult,
  type StartReport,
  type StartView,
  startView,
  type WelcomeStart,
} from "./start-status.ts";
import { welcomeStartWords } from "./welcome-start-words.ts";

/** What Welcome reads of the start. */
export interface WelcomeStartState {
  readonly view: StartView;
  /**
   * From 2 s of waiting and while the start has failed, the id of the line that says why Open
   * demo and Open folder are off; `undefined` while they are on.
   */
  readonly offId: string | undefined;
  /**
   * Runs `task` once the start is ready, for a press that came before it was: the pressed button
   * shows its busy state meanwhile. When the start fails instead, `task` doesn't run and the
   * answer is `undefined`.
   */
  afterStart<T>(task: () => Promise<T>): Promise<T | undefined>;
}

const alwaysReady: StartView = { kind: "ready" };

/** Whether Welcome shows the start: the waiting line from 2 s, or the failure. */
function startShows(view: StartView): boolean {
  return (
    view.kind === "failed" ||
    (view.kind === "waiting" && view.seconds * 1000 >= WAITING_LINE_AFTER_MS)
  );
}

/**
 * Follows the app's start for Welcome. Without one (a served Studio) the start is ready.
 *
 * @example
 * const { view, offId, afterStart } = useWelcomeStart(start);
 */
export function useWelcomeStart(start: WelcomeStart | undefined): WelcomeStartState {
  const subscribe = useCallback(
    (onChange: () => void) => start?.subscribe(onChange) ?? (() => undefined),
    [start],
  );
  const report = useSyncExternalStore<StartReport | undefined>(subscribe, () => start?.report);
  const view = start === undefined ? alwaysReady : startView(report);
  const waiters = useRef<((ready: boolean) => void)[]>([]);
  useEffect(() => {
    if (view.kind !== "waiting") {
      for (const waiter of waiters.current.splice(0)) waiter(view.kind === "ready");
    }
  }, [view.kind]);
  // A press held when Welcome goes away ends without running, so its promise doesn't hang.
  useEffect(
    () => () => {
      for (const waiter of waiters.current.splice(0)) waiter(false);
    },
    [],
  );
  const afterStart = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
      const ready =
        view.kind === "waiting"
          ? await new Promise<boolean>((resolve) => waiters.current.push(resolve))
          : view.kind === "ready";
      return ready ? task() : undefined;
    },
    [view.kind],
  );
  const offId = useId();
  return { view, offId: startShows(view) ? offId : undefined, afterStart };
}

/** Props for {@link WelcomeStartArea}. */
export interface WelcomeStartAreaProps {
  /** Without it, as in a served Studio, the area is empty. */
  readonly start: WelcomeStart | undefined;
  readonly view: StartView;
  /** The id for the line that says why Open demo and Open folder are off, while they are. */
  readonly offId: string | undefined;
  /** Whether Welcome has Open demo, which that line then names. */
  readonly demo: boolean;
  /**
   * Welcome's leading button: focus goes there after Try again took the failure away, and when
   * Check this computer closes after its opener went.
   */
  readonly lead: () => HTMLElement | null;
}

/**
 * Welcome's start (first-run-progress 3.2 and 5): the waiting line "Starting Halonic…" from 2 s,
 * its 10 s and 30 s sentences and **Something wrong?**, all in a space kept from the moment the
 * line shows, so nothing under it moves; then either nothing, with "Halonic is ready" said once,
 * or **Halonic's engine didn't start** with the cause's sentence, **Try again**, **Check this
 * computer** and **Copy report**, which takes focus. Under them, while Open demo and Open folder
 * are off, the line that says why.
 */
export function WelcomeStartArea(props: WelcomeStartAreaProps) {
  return props.start === undefined ? null : <StartArea {...props} start={props.start} />;
}

function StartArea({
  start,
  view,
  offId,
  demo,
  lead,
}: WelcomeStartAreaProps & { readonly start: WelcomeStart }) {
  const [checking, setChecking] = useState(false);
  /** The lite check's last answer, for Copy report after the dialog closed. */
  const [results, setResults] = useState<readonly LiteCheckResult[] | undefined>(undefined);
  const ready = useReadyLine(view);
  const wasFailed = useRef(false);
  const failed = view.kind === "failed";
  useEffect(() => {
    if (wasFailed.current && !failed) {
      // Try again took the box with the focus in it away.
      lead()?.focus();
    }
    wasFailed.current = failed;
  }, [failed, lead]);

  return (
    <>
      <p role="status" className="sr-only">
        {ready ? welcomeStartWords.ready : null}
      </p>
      {view.kind === "waiting" ? (
        <StartLine seconds={view.seconds} still={view.still} onSomethingWrong={setChecking} />
      ) : null}
      {view.kind === "failed" ? (
        <StartFailure
          start={start}
          view={view}
          results={results}
          onCheck={() => setChecking(true)}
        />
      ) : null}
      {offId === undefined ? null : (
        <p id={offId} className="text-small text-fg-muted">
          {welcomeStartWords.buttonsOff(demo)}
        </p>
      )}
      {checking ? (
        // Welcome centres its column, and the dialog would take that over from it.
        <div className="text-left">
          <LiteCheckDialog
            start={start}
            view={view}
            onChecked={setResults}
            onClose={() => setChecking(false)}
            returnFocus={lead}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * **Halonic's engine didn't start**: the cause's sentence and the three ways on. It takes focus
 * when it shows. The cause id and the exit code go only into the copied report.
 */
function StartFailure({
  start,
  view,
  results,
  onCheck,
}: {
  readonly start: WelcomeStart;
  readonly view: Extract<StartView, { kind: "failed" }>;
  /** The lite check's last answer, when it ran. */
  readonly results: readonly LiteCheckResult[] | undefined;
  readonly onCheck: () => void;
}) {
  const box = useRef<CalloutHandle>(null);
  const copyDetails = useCopyDetails();
  useEffect(() => {
    box.current?.focus();
  }, []);
  const copyReport = () =>
    copyDetails(checkReport(start.about, new Date(), checkLines(view, results)));
  return (
    <div className="w-full text-left">
      <Callout
        tone="danger"
        announce="focus"
        ref={box}
        title={welcomeStartWords.failedTitle}
        action={[
          { label: welcomeStartWords.tryAgain, onClick: () => start.tryAgain() },
          { label: welcomeStartWords.checkThisComputer, onClick: onCheck },
          { label: welcomeStartWords.copyReport, onClick: copyReport },
        ]}
      >
        {welcomeStartWords.causes[view.cause]}
      </Callout>
    </div>
  );
}

/**
 * True once the start is ready after the waiting line or the failure showed, so a screen reader
 * hears "Halonic is ready" once. A start that's ready within 2 s says nothing: nothing showed.
 */
function useReadyLine(view: StartView): boolean {
  const [said, setSaid] = useState(false);
  const shown = useRef(false);
  const visible = startShows(view);
  useEffect(() => {
    if (visible) {
      shown.current = true;
      setSaid(false);
    } else if (view.kind === "ready" && shown.current) {
      shown.current = false;
      setSaid(true);
    }
  }, [visible, view.kind]);
  return said;
}

/** What the line keeps room for from the moment it shows: both sentences and Something wrong?. */
const startRoom = {
  reasons: [welcomeStartWords.firstStart, welcomeStartWords.stillStarting],
  actions: [welcomeStartWords.somethingWrong],
} as const;

/**
 * The kit's waiting line for the start. From the moment it shows it keeps room for its 10 s and 30 s
 * sentences and **Something wrong?** at any width, so their coming moves nothing (Sofia, through
 * Owen on HAL-13412; at 390px the 30 s sentence takes three lines, C513 M11). The shell's seconds
 * count the time, so it draws again with each answer.
 */
function StartLine({
  seconds,
  still,
  onSomethingWrong,
}: {
  readonly seconds: number;
  readonly still: boolean;
  readonly onSomethingWrong: (open: true) => void;
}) {
  const waitedMs = seconds * 1000;
  return (
    <div className="w-full text-left">
      <WaitingLine
        what={welcomeStartWords.starting}
        waitedMs={waitedMs}
        reason={still ? welcomeStartWords.stillStarting : welcomeStartWords.firstStart}
        actions={
          waitedMs >= WAITING_REASON_AFTER_MS
            ? [{ label: welcomeStartWords.somethingWrong, onClick: () => onSomethingWrong(true) }]
            : []
        }
        keepRoomFor={startRoom}
      />
    </div>
  );
}
