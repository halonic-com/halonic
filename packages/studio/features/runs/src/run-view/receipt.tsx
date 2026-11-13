import { receiptWords } from "../run-words.ts";
import type { ApprovalLine } from "./receipt-model.ts";

/** The props of `Receipt`. */
export interface ReceiptProps {
  /** The summary line from `summaryLine`. */
  readonly summary: string;
  /** The Approvals section's lines from `approvalLines`; none hides the section. */
  readonly approvals: readonly ApprovalLine[];
  /** The Messages section's lines from `messageLines`; none hides the section. */
  readonly messages?: readonly string[];
  /** The Read section's line from `readLines`; none hides the section. */
  readonly reads?: readonly string[];
  /** The Models and cost section's lines from `modelLines`; none hides the section. */
  readonly models?: readonly string[];
}

/**
 * The run page's receipt (checklist part 1, 1.9): the `h2`, the summary line,
 * `text-section`, wrapping, then the sections that have something to say.
 * Lines are plain text, never Markdown or links (RCPT-3.3).
 *
 * @example
 * <Receipt summary="Finished in 2 min · sent nothing" approvals={[]} />
 */
export function Receipt({
  summary,
  approvals,
  messages = [],
  reads = [],
  models = [],
}: ReceiptProps) {
  return (
    <section aria-labelledby="run-receipt" className="flex flex-col gap-2">
      <h2 id="run-receipt" className="sr-only">
        {receiptWords.heading}
      </h2>
      <p className="text-section">{summary}</p>
      <TextSection id="receipt-messages" heading={receiptWords.messagesHeading} lines={messages} />
      <TextSection id="receipt-read" heading={receiptWords.readHeading} lines={reads} />
      <TextSection id="receipt-models" heading={receiptWords.modelsHeading} lines={models} />
      {approvals.length === 0 ? null : (
        <section aria-labelledby="receipt-approvals" className="flex flex-col gap-1">
          <h3 id="receipt-approvals" className="text-small text-fg-muted">
            {receiptWords.approvalsHeading}
          </h3>
          <ul className="flex flex-col gap-1 text-small">
            {approvals.map((line) => (
              <li key={line.callId} className="break-words">
                {line.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** A section of plain lines under its own small heading; no lines, no section. */
function TextSection({
  id,
  heading,
  lines,
}: {
  readonly id: string;
  readonly heading: string;
  readonly lines: readonly string[];
}) {
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className="text-small text-fg-muted">
        {heading}
      </h3>
      <ul className="flex flex-col gap-1 text-small">
        {lines.map((line) => (
          <li key={line} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
