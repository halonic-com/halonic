import {
  AlertIcon,
  Button,
  Dialog,
  Disclosure,
  InfoIcon,
  TickIcon,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useCopyDetails } from "../page/copy-details.ts";
import {
  type CheckLine,
  type CheckMark,
  checkHeading,
  checkLines,
  checkReport,
  liteCheckWords,
} from "./lite-check-lines.ts";
import type { LiteCheckResult, StartView, WelcomeStart } from "./start-status.ts";

/** Props for {@link LiteCheckDialog}. */
export interface LiteCheckDialogProps {
  readonly start: WelcomeStart;
  /** The start as Welcome shows it, for the Engine line. */
  readonly view: StartView;
  /** Gets each finished check, so Welcome's Copy report can hold it after the dialog closed. */
  readonly onChecked: (results: readonly LiteCheckResult[]) => void;
  readonly onClose: () => void;
}

const markIcons: Readonly<Record<CheckMark, ReactNode>> = {
  pass: <TickIcon />,
  problem: <AlertIcon />,
  warning: <WarningIcon />,
  info: <InfoIcon />,
};

const markColours: Readonly<Record<CheckMark, string>> = {
  pass: "text-success",
  problem: "text-danger",
  warning: "text-attention",
  info: "text-fg-subtle",
};

/** What a screen reader hears for a mark, before the line's words: "Engine, problem: Not running". */
const markNames: Readonly<Record<CheckMark, string>> = {
  pass: "works",
  problem: "problem",
  warning: "warning",
  info: "info",
};

/**
 * **Check this computer** as the window runs it while the engine isn't running
 * (first-run-progress 3.2, 4.2 to 4.4): the lite check's lines, the Engine line, and the engine's
 * own checks as Not checked, never as passed. It opens already checking; **Check again** runs it
 * again. The heading counts causes and is said once when the check ends. **Show the report**
 * unfolds exactly what **Copy report** copies. It changes nothing and sends nothing.
 */
export function LiteCheckDialog({ start, view, onChecked, onClose }: LiteCheckDialogProps) {
  const { lines, run } = useLiteCheck(start, view, onChecked);
  const copyDetails = useCopyDetails();
  const report = lines === undefined ? undefined : checkReport(start.about, new Date(), lines);
  return (
    <Dialog
      title={liteCheckWords.title}
      size="md"
      anchor="top"
      confirm={{ label: liteCheckWords.close, busyLabel: liteCheckWords.close }}
      cancelButton={false}
      onConfirm={onClose}
      onCancel={onClose}
      {...(report === undefined
        ? {}
        : {
            alternative: {
              label: liteCheckWords.copyReport,
              onClick: () => void copyDetails(report),
            },
          })}
    >
      <div className="flex flex-col gap-3">
        <p className="text-small text-fg-muted">{start.about}</p>
        <p>{liteCheckWords.intro}</p>
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-body-strong">
            {lines === undefined ? liteCheckWords.checking : checkHeading(lines)}
          </p>
          <Button variant="ghost" size="sm" busy={lines === undefined} onClick={() => void run()}>
            {liteCheckWords.checkAgain}
          </Button>
        </div>
        {lines === undefined ? null : <CheckList lines={lines} />}
        {report === undefined ? null : (
          <Disclosure summary={liteCheckWords.showReport}>
            <pre className="overflow-auto px-4 pb-3 font-mono text-small whitespace-pre-wrap">
              {report}
            </pre>
          </Disclosure>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Runs the lite check when the dialog opens, and again on `run`, and gives its lines: `undefined`
 * while it runs. An answer to an older run, or after the dialog closed, is dropped.
 */
function useLiteCheck(
  start: WelcomeStart,
  view: StartView,
  onChecked: (results: readonly LiteCheckResult[]) => void,
): { readonly lines: readonly CheckLine[] | undefined; readonly run: () => Promise<void> } {
  const [results, setResults] = useState<readonly LiteCheckResult[] | undefined>(undefined);
  /** True when the window couldn't run the check: its lines then read Not checked. */
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(true);
  const runs = useRef(0);
  const run = useCallback(async () => {
    const mine = ++runs.current;
    setChecking(true);
    const found = await start.check().catch(() => undefined);
    // A later Check again, or the dialog closing, wins over this one.
    if (mine !== runs.current) return;
    setChecking(false);
    setResults(found);
    setFailed(found === undefined);
    if (found !== undefined) onChecked(found);
  }, [start, onChecked]);
  useEffect(() => {
    void run();
    return () => {
      runs.current += 1;
    };
  }, [run]);

  return { lines: checking ? undefined : checkLines(view, results, failed), run };
}

/** The lines as a list: each one's state is part of its words, never only an icon or a colour. */
function CheckList({ lines }: { readonly lines: readonly CheckLine[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => (
        <li key={line.label} className="flex items-start gap-2 text-small">
          <span
            aria-hidden="true"
            className={`mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${markColours[line.mark]}`}
          >
            {markIcons[line.mark]}
          </span>
          <span className="min-w-0 flex-1 wrap-break-word">
            <span className="text-fg">{line.label}</span>
            <span className="sr-only">, {markNames[line.mark]}:</span>{" "}
            <span className="text-fg-muted">{line.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
