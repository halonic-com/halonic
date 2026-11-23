import {
  Button,
  CloseIcon,
  Disclosure,
  InfoIcon,
  SheetFrame,
  StatusChip,
  TickIcon,
  useWriteClipboard,
} from "@halonicjs/studio-kit";
import { type ReactNode, useState } from "react";
import {
  type ConnectionFacts,
  type ConnectionLine,
  type ConnectionMark,
  connectionChecking,
  connectionHeading,
  connectionLines,
  connectionReport,
} from "./connection-check.ts";
import { linkRowClasses } from "./first-reach.tsx";
import { checkWords } from "./reach-words.ts";

/** The screen's marks are the report's glyphs (✓ ✕ –), as Check this computer draws them. */
const markIcons: Readonly<Record<ConnectionMark, ReactNode>> = {
  pass: <TickIcon />,
  problem: <CloseIcon />,
  info: <InfoIcon />,
};

const markColours: Readonly<Record<ConnectionMark, string>> = {
  pass: "text-success",
  problem: "text-danger",
  info: "text-fg-subtle",
};

/** What a screen reader hears for a mark, after the label: "Phone, works: …". */
const markNames: Readonly<Record<ConnectionMark, string>> = {
  pass: "works",
  problem: "problem",
  info: "info",
};

function LineItem({ line }: { readonly line: ConnectionLine }) {
  return (
    <li className="grid grid-cols-[auto_1fr] items-start gap-x-3 px-4 py-3 text-small">
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-grid size-icon-sm place-items-center *:size-full ${markColours[line.mark]}`}
      >
        {markIcons[line.mark]}
      </span>
      <div className="flex min-w-0 flex-col gap-1 wrap-break-word">
        <span className="font-medium text-fg">
          {line.label}
          <span className="sr-only">, {markNames[line.mark]}:</span>
        </span>
        <p className="text-fg">{line.sentence}</p>
        {line.fix === undefined ? null : <p className="text-fg-muted">{line.fix}</p>}
      </div>
    </li>
  );
}

/** The heading as a chip: "1 problem" in danger, or "No problems found". */
function Heading({ lines }: { readonly lines: readonly ConnectionLine[] }) {
  const problems = lines.some((line) => line.mark === "problem");
  return <StatusChip tone={problems ? "danger" : "success"}>{connectionHeading(lines)}</StatusChip>;
}

/** Copy report, what it said, and Show the report over exactly what it copies. */
function ReportParts({ report }: { readonly report: string }) {
  const writeClipboard = useWriteClipboard();
  const [copied, setCopied] = useState<boolean>();
  let said = "";
  if (copied !== undefined) said = copied ? checkWords.copied : checkWords.notCopied;
  return (
    <>
      <div className="flex flex-col items-center">
        <button
          type="button"
          className={linkRowClasses}
          onClick={async () => setCopied(await writeClipboard(report))}
        >
          {checkWords.copyReport}
        </button>
        <p role="status" className="text-center text-small text-fg-muted">
          {said}
        </p>
      </div>
      <Disclosure summary={checkWords.showReport} openSummary={checkWords.hideReport}>
        {/* Not wrapped: it shows exactly what Copy report copies, columns and all. */}
        <pre className="overflow-x-auto px-4 pb-3 font-mono text-small whitespace-pre">
          {report}
        </pre>
        <p className="px-4 text-small text-fg-muted">{checkWords.reportNote}</p>
      </Disclosure>
    </>
  );
}

/**
 * **Check this connection** (first-run-progress section 6): a full sheet with Close that lists
 * only what the phone can see, its own connection and whether the computer answers, says that
 * the computer's own checks need the computer first, and offers Check again and the report with
 * Check this computer's rules. It changes nothing and sends nothing; Check again only connects.
 */
export function ConnectionCheckSheet({
  facts,
  onCheckAgain,
  onClose,
}: {
  readonly facts: ConnectionFacts;
  readonly onCheckAgain: () => void;
  /** Close, Escape and Android back. The page unmounts the sheet. */
  readonly onClose: () => void;
}) {
  const lines = connectionLines(facts);
  const checking = connectionChecking(facts);
  return (
    <SheetFrame title={checkWords.title} onClose={onClose} onCancel={onClose}>
      <div className="flex flex-col gap-4 px-4 py-3">
        <p className="text-small text-fg-muted">{checkWords.intro}</p>
        {/* Said once while it checks, and once with the count when it knows (section 5). */}
        <div role="status">
          {checking ? (
            <p className="text-small text-fg-muted">{checkWords.checking}</p>
          ) : (
            <Heading lines={lines} />
          )}
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {lines.map((line) => (
            <LineItem key={line.id} line={line} />
          ))}
        </ul>
        <p className="text-small text-fg-muted">{checkWords.notChecked}</p>
        <Button
          variant="secondary"
          size="touch"
          block
          busy={checking}
          busyLabel="Checking…"
          onClick={onCheckAgain}
        >
          {checkWords.checkAgain}
        </Button>
        {checking ? null : <ReportParts report={connectionReport(lines, new Date())} />}
      </div>
    </SheetFrame>
  );
}
