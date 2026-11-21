import { Button, inlineLinkClasses } from "@halonicjs/studio-kit";
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { copyDetailsWords } from "../errors/copy-details-words.ts";
import { useCopyDetails } from "../page/copy-details.ts";
import { engineWaitMs, type WelcomeOpenProblem } from "./cant-open.ts";
import type { WelcomeStart } from "./start-status.ts";
import {
  WELCOME_RECENT_ROWS,
  WelcomeRecent,
  type WelcomeRecentWorkspace,
} from "./welcome-recent.tsx";
import {
  cantCreateSampleLine,
  TrySample,
  trySampleWords,
  type WelcomeSampleProblem,
} from "./welcome-sample.tsx";
import { useWelcomeStart, WelcomeStartArea } from "./welcome-start.tsx";

/** The Welcome screen's Recent list and what its rows do. */
export interface WelcomeRecentList {
  /** The workspaces remembered on this device, most recent first. */
  readonly workspaces: readonly WelcomeRecentWorkspace[];
  /** Opens the workspace in that folder; resolves with the problem when it couldn't. */
  readonly onOpen: (location: string) => Promise<WelcomeOpenProblem | undefined>;
  /** Forgets the workspace in that folder, for **Remove from Recent**. */
  readonly onRemove: (location: string) => void;
}

/** Props for {@link Welcome}. */
export interface WelcomeProps {
  /**
   * Shows the folder picker and opens the folder picked. Resolves with the problem when it
   * couldn't, else with `undefined`: opened, or the picker was cancelled.
   */
  readonly onOpenFolder: () => Promise<WelcomeOpenProblem | undefined>;
  /**
   * Opens the New workspace dialog; without it Welcome has no **New workspace…** link.
   */
  readonly onNewWorkspace?: (() => void) | undefined;
  /**
   * Copies the demo and opens it. Resolves with the problem when it couldn't, else with
   * `undefined`; without it Welcome has no **Open demo** action.
   */
  readonly onTrySample?: (() => Promise<WelcomeSampleProblem | undefined>) | undefined;
  /** The workspaces remembered on this device; without it, or while it's empty, none show. */
  readonly recent?: WelcomeRecentList | undefined;
  /**
   * How far Halonic's start has got, from the desktop app's window (`shell.welcome-start`).
   * Without it Welcome shows no start, as in a served Studio.
   */
  readonly start?: WelcomeStart | undefined;
}

/** How long Welcome waits between two tries while the engine doesn't answer. */
const engineRetryMs = 1_000;

/**
 * Tries again by itself while the engine doesn't answer, for up to {@link engineWaitMs} after the
 * press, and returns the last answer. The person only sees the button busy meanwhile.
 */
async function untilAnswered<T>(
  attempt: () => Promise<T>,
  silent: (answer: T) => boolean,
): Promise<T> {
  const until = Date.now() + engineWaitMs;
  for (;;) {
    const answer = await attempt();
    if (!silent(answer) || Date.now() + engineRetryMs > until) {
      return answer;
    }
    await new Promise((resolve) => setTimeout(resolve, engineRetryMs));
  }
}

/** What failed to open, and whether a Recent row asked for it. */
interface ShownProblem {
  readonly problem: WelcomeOpenProblem;
  readonly fromRecent: boolean;
  /** The Recent row that asked, when one did: it is marked as the one that failed. */
  readonly location?: string | undefined;
}

/** What is opening: the picked folder, or the Recent row in that folder. */
type Opening = { readonly from: "picker" } | { readonly from: "recent"; readonly location: string };

/**
 * The window while no workspace is open (`shell.welcome.open-action`, microcopy 3.2): "Halonic
 * Studio", what a workspace is, and **Open folder**, centred with no sidebar and no tabs. With the
 * app's demo and an empty Recent, **Open demo** is the primary button beside it and "New here? The
 * demo takes about 4 minutes." sits right under the buttons (`shell.welcome-sample`); else **Open
 * folder** is the primary button. With the app's New workspace dialog, **New workspace…** comes
 * last as a quiet link. The column hangs a fixed 18% of the window height from the top rather than
 * centring, so nothing above a new line (Recent, an error) moves under the pointer. While the
 * folder opens the button reads "Opening…" and is busy: it keeps focus and ignores presses. A
 * folder that fails to open says why under the text in the danger colour, and the button works
 * again (`shell.welcome.cant-open`); a reason Halonic can't explain comes with **Copy details**.
 * Cancelling the picker changes nothing. Focus starts on the primary button (accessibility pass 1.3).
 *
 * While Halonic starts, the waiting line shows under the buttons from 2 seconds, and **Open demo**
 * and **Open folder** are off with a line that says why; a start that fails shows why there, with
 * **Try again** (`shell.welcome-start`). A press that comes before the start is ready keeps its
 * button busy, and runs once it is.
 *
 * Under the button, **Recent** lists up to five remembered workspaces, and one press opens one
 * (states-flow-map W2). A row whose folder is gone says so on the same line with
 * **Remove from Recent**; the row stays until it's removed, and focus then goes to the next row,
 * else **Open folder** (W7). One folder opens at a time: presses meanwhile are ignored.
 *
 * @example
 * <Welcome onOpenFolder={openFolder} recent={{ workspaces, onOpen, onRemove }} />
 */
export function Welcome({
  onOpenFolder,
  onNewWorkspace,
  onTrySample,
  recent,
  start,
}: WelcomeProps) {
  const [opening, setOpening] = useState<Opening | undefined>(undefined);
  /** True while the demo is being copied; Open folder and New workspace… stay usable. */
  const [creatingSample, setCreatingSample] = useState(false);
  const [shownProblem, setShownProblem] = useState<ShownProblem | undefined>(undefined);
  const [sampleProblem, setSampleProblem] = useState<WelcomeSampleProblem | undefined>(undefined);
  /** Where focus goes once a removed row is gone: a row's location, or `null` for Open folder. */
  const [focusAfterRemove, setFocusAfterRemove] = useState<string | null | undefined>(undefined);
  const openButton = useRef<HTMLButtonElement>(null);
  const demoButton = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const copyDetails = useCopyDetails();
  const alertId = useId();
  const startState = useWelcomeStart(start);
  const lead = useCallback(() => demoButton.current ?? openButton.current, []);
  // Before any effect of the start's, so a failure that is there at once keeps its focus.
  useLayoutEffect(() => lead()?.focus(), [lead]);
  useEffect(() => {
    if (focusAfterRemove === undefined) {
      return;
    }
    const row = focusAfterRemove === null ? undefined : rows.current.get(focusAfterRemove);
    (row ?? openButton.current)?.focus();
    setFocusAfterRemove(undefined);
  }, [focusAfterRemove]);
  const failedLocation = shownProblem?.location;
  useEffect(() => {
    if (failedLocation !== undefined) {
      // On a small window the failed row can sit below the fold, and its outline is what names it.
      rows.current.get(failedLocation)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [failedLocation]);
  const rowRef = useCallback(
    (location: string) => (button: HTMLButtonElement | null) => {
      if (button === null) {
        rows.current.delete(location);
      } else {
        rows.current.set(location, button);
      }
    },
    [],
  );

  const run = async (what: Opening, open: () => Promise<WelcomeOpenProblem | undefined>) => {
    if (opening !== undefined) {
      return;
    }
    setOpening(what);
    setShownProblem(undefined);
    setSampleProblem(undefined);
    try {
      // The picker's folder is retried by whoever opens it, so the picker isn't shown again.
      const problem = await startState.afterStart(() =>
        what.from === "recent"
          ? untilAnswered(open, (answer) => answer?.kind === "unavailable")
          : open(),
      );
      setShownProblem(
        problem === undefined
          ? undefined
          : {
              problem,
              fromRecent: what.from === "recent",
              location: what.from === "recent" ? what.location : undefined,
            },
      );
    } finally {
      setOpening(undefined);
    }
  };

  const trySample = async () => {
    if (creatingSample || onTrySample === undefined) {
      return;
    }
    setCreatingSample(true);
    setShownProblem(undefined);
    setSampleProblem(undefined);
    try {
      setSampleProblem(
        await startState.afterStart(() =>
          untilAnswered(onTrySample, (answer) => answer?.unavailable === true),
        ),
      );
    } finally {
      setCreatingSample(false);
    }
  };

  const remove = (location: string) => {
    if (recent === undefined) {
      return;
    }
    const shown = recent.workspaces.slice(0, WELCOME_RECENT_ROWS);
    const next = shown[shown.findIndex((workspace) => workspace.location === location) + 1];
    setShownProblem(undefined);
    recent.onRemove(location);
    setFocusAfterRemove(next?.location ?? null);
  };

  const problem = shownProblem?.problem;
  const hasRecent = recent !== undefined && recent.workspaces.length > 0;
  const demoLeads = onTrySample !== undefined && !hasRecent;
  const offersRemove =
    shownProblem?.fromRecent === true && problem?.kind === "not_found" && recent !== undefined;

  return (
    <div className="flex h-full justify-center overflow-auto p-6 pt-[18vh]">
      <div className="flex h-fit w-full min-w-0 max-w-dialog-sm flex-col items-center gap-4 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Halonic Studio</h1>
          <p className="text-body text-fg-muted">
            Your workspace is a folder of plain files.
            <br />
            Local first, private, and yours.
          </p>
        </div>
        <WelcomeActions
          demo={
            demoLeads ? { busy: creatingSample, onPress: trySample, ref: demoButton } : undefined
          }
          openButton={openButton}
          openingFolder={opening?.from === "picker"}
          onOpenFolder={() => run({ from: "picker" }, onOpenFolder)}
          onNewWorkspace={onNewWorkspace}
          opening={opening !== undefined}
          offId={startState.offId}
          start={
            <WelcomeStartArea
              start={start}
              view={startState.view}
              offId={startState.offId}
              demo={onTrySample !== undefined}
              lead={lead}
            />
          }
        />
        <p id={alertId} role="alert" className="text-body text-danger break-words empty:hidden">
          {problem === undefined ? null : `Can't open ${problem.folder}: ${problem.reason}`}
          {sampleProblem === undefined ? null : cantCreateSampleLine(sampleProblem)}
        </p>
        {offersRemove ? (
          <button
            type="button"
            className={`text-body ${inlineLinkClasses}`}
            onClick={() => remove(problem.folder)}
          >
            {removeFromRecentLabel}
          </button>
        ) : null}
        {problem?.details === undefined ? null : (
          <button
            type="button"
            className={`text-body ${inlineLinkClasses}`}
            onClick={() => copyDetails(problem.details ?? "")}
          >
            {copyDetailsWords.label}
          </button>
        )}
        {recent === undefined ? null : (
          <WelcomeRecent
            workspaces={recent.workspaces}
            opening={opening?.from === "recent" ? opening.location : undefined}
            onOpen={(location) => run({ from: "recent", location }, () => recent.onOpen(location))}
            rowRef={rowRef}
            failed={
              shownProblem?.location === undefined
                ? undefined
                : { location: shownProblem.location, alertId }
            }
          />
        )}
        {hasRecent && onTrySample !== undefined ? (
          <TrySample quiet busy={creatingSample} onPress={trySample} offId={startState.offId} />
        ) : null}
      </div>
    </div>
  );
}

/** Props for {@link WelcomeActions}. */
interface WelcomeActionsProps {
  /** The leading **Open demo**, focused first, or `undefined` when **Open folder** leads. */
  readonly demo:
    | {
        readonly busy: boolean;
        readonly onPress: () => void;
        readonly ref: Ref<HTMLButtonElement>;
      }
    | undefined;
  readonly openButton: Ref<HTMLButtonElement>;
  /** True while the picked folder opens. */
  readonly openingFolder: boolean;
  readonly onOpenFolder: () => void;
  /** Opens the New workspace dialog; without it there is no **New workspace…** link. */
  readonly onNewWorkspace: (() => void) | undefined;
  /** True while a folder opens: **New workspace…** then does nothing. */
  readonly opening: boolean;
  /** The id of the line that says why Open demo and Open folder are off, while they are. */
  readonly offId: string | undefined;
  /** Halonic's start, right under the buttons it turns off (`shell.welcome-start`). */
  readonly start: ReactNode;
}

/**
 * Welcome's buttons: **Open demo** and **Open folder** side by side when the demo leads, else
 * **Open folder** alone as the primary button; then Halonic's start while it shows; then the time
 * line while the demo leads, and last the **New workspace…** link (`shell.welcome-sample`).
 */
function WelcomeActions({
  demo,
  openButton,
  openingFolder,
  onOpenFolder,
  onNewWorkspace,
  opening,
  offId,
  start,
}: WelcomeActionsProps) {
  const timeId = useId();
  const demoLeads = demo !== undefined;
  return (
    <>
      <div className="flex flex-wrap justify-center gap-3">
        {demo === undefined ? null : (
          <TrySample
            quiet={false}
            busy={demo.busy}
            onPress={demo.onPress}
            buttonRef={demo.ref}
            timeId={timeId}
            offId={offId}
          />
        )}
        <Button
          ref={openButton}
          variant={demoLeads ? "secondary" : "primary"}
          busy={openingFolder}
          busyLabel="Opening…"
          unavailable={openingFolder || offId === undefined ? undefined : { reason: offId }}
          onClick={onOpenFolder}
        >
          Open folder
        </Button>
      </div>
      {start}
      {demoLeads ? (
        <p id={timeId} className="text-small text-fg-muted">
          {trySampleWords.time}
        </p>
      ) : null}
      {onNewWorkspace === undefined ? null : (
        <Button variant="ghost" onClick={() => opening || onNewWorkspace()}>
          New workspace…
        </Button>
      )}
    </>
  );
}

/** The link that drops a Recent row whose folder is gone (microcopy 3.2). */
export const removeFromRecentLabel = "Remove from Recent";
