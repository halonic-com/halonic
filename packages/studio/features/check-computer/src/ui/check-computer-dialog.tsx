import { Button, Dialog, Disclosure, StatusChip } from "@halonicjs/studio-kit";
import { useCopyDetails } from "@halonicjs/studio-shell";
import type { CheckComputerSource } from "../api.ts";
import { countWords, markCounts } from "../check-marks.ts";
import { type CheckLine, sentenceText } from "../lines/check-line.ts";
import { checkLine } from "../lines/check-lines.ts";
import { checkReport } from "../report/check-report.ts";
import { type ActionHandlers, CheckList } from "./check-list.tsx";
import { dialogWords } from "./dialog-words.ts";
import { useCheck } from "./use-check.ts";

/** The props of {@link CheckComputerDialog}. */
export interface CheckComputerDialogProps {
  readonly source: CheckComputerSource;
  /** What the lines' buttons do; Check again is the dialog's own. */
  readonly handlers: ActionHandlers;
  readonly onClose: () => void;
}

/** The heading as chips: "1 problem" in danger, "1 warning" in attention, or "No problems found" (4.2). */
function Heading({ lines }: { readonly lines: readonly CheckLine[] }) {
  const { problems, warnings } = markCounts(lines.map((line) => line.mark));
  if (problems === 0 && warnings === 0) {
    return <StatusChip tone="success">No problems found</StatusChip>;
  }
  return (
    <span className="flex flex-wrap gap-2">
      {problems === 0 ? null : (
        <StatusChip tone="danger">{countWords(problems, "problem")}</StatusChip>
      )}
      {warnings === 0 ? null : (
        <StatusChip tone="attention">{countWords(warnings, "warning")}</StatusChip>
      )}
    </span>
  );
}

/**
 * **Check this computer** (requirement `check-computer.dialog`, first-run-progress 4): the
 * workspace's lines as each check answers, the heading counting causes, the lines' buttons,
 * **Check again**, and **Show the report** over exactly what **Copy report** copies. It opens
 * already checking, takes focus on its title, and changes nothing and sends nothing.
 */
export function CheckComputerDialog({ source, handlers, onClose }: CheckComputerDialogProps) {
  const { facts, checking, run } = useCheck(source);
  const copyDetails = useCopyDetails();
  const context = {
    about: source.about,
    demo: source.isDemo(),
    ...(source.sandboxKind === undefined ? {} : { sandboxKind: source.sandboxKind }),
  };
  const all = facts.map((fact) => checkLine(fact, context));
  // Not checked is a quiet sentence under the list, not a line of it (4.1).
  const lines = all.filter((line) => line.id !== "not-checked");
  const notChecked = all.find((line) => line.id === "not-checked");
  const report = checkReport(facts, { about: source.about, at: new Date(), demo: context.demo });
  const namesOnScreen = facts.some((fact) => fact.check === "last-run");
  const allClear = !checking && lines.every((line) => line.mark !== "problem");
  return (
    <Dialog
      title={dialogWords.title}
      size="lg"
      anchor="top"
      focusTitle
      confirm={{ label: dialogWords.close, busyLabel: dialogWords.close }}
      cancelButton={false}
      onConfirm={onClose}
      onCancel={onClose}
      {...(checking
        ? {}
        : {
            alternative: { label: dialogWords.copyReport, onClick: () => void copyDetails(report) },
          })}
    >
      <div className="flex flex-col gap-3">
        <p className="text-small text-fg-muted">
          Includes everything <code className="font-mono">halonic doctor</code> checks in a
          terminal. It changes nothing and sends nothing.
        </p>
        <div className="flex items-center justify-between gap-3">
          {/* Said once when the check starts, and once with the count when it ends (section 5). */}
          <div role="status">{checking ? dialogWords.checking : <Heading lines={lines} />}</div>
          <Button variant="secondary" size="sm" busy={checking} busyLabel="Checking…" onClick={run}>
            {dialogWords.checkAgain}
          </Button>
        </div>
        {lines.length === 0 ? null : (
          <CheckList lines={lines} handlers={{ ...handlers, "check-again": run }} />
        )}
        {notChecked === undefined ? null : (
          <p className="text-small text-fg-muted">
            {notChecked.sentences.map(sentenceText).join(" ")}
          </p>
        )}
        {allClear ? <p className="text-small text-fg-muted">{dialogWords.allClear}</p> : null}
        {checking ? null : (
          <Disclosure summary={dialogWords.showReport} openSummary={dialogWords.hideReport}>
            <pre className="overflow-auto px-4 pb-3 font-mono text-small whitespace-pre-wrap">
              {report}
            </pre>
            <p className="px-4 text-small text-fg-muted">
              {dialogWords.reportNote}
              {namesOnScreen ? ` ${dialogWords.reportNoteNames}` : ""}
            </p>
          </Disclosure>
        )}
      </div>
    </Dialog>
  );
}
