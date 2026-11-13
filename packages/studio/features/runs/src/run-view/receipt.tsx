import { receiptWords } from "../run-words.ts";
import type { ApprovalLine } from "./receipt-model.ts";

/** The props of `Receipt`. */
export interface ReceiptProps {
  /** The summary line from `summaryLine`. */
  readonly summary: string;
  /** The Approvals section's lines from `approvalLines`; none hides the section. */
  readonly approvals: readonly ApprovalLine[];
}

/**
 * The run page's receipt (checklist part 1, 1.9): the `h2`, the summary line,
 * `text-section`, wrapping, then the sections that have something to say.
 * Lines are plain text, never Markdown or links (RCPT-3.3).
 *
 * @example
 * <Receipt summary="Finished in 2 min · sent nothing" approvals={[]} />
 */
export function Receipt({ summary, approvals }: ReceiptProps) {
  return (
    <section aria-labelledby="run-receipt" className="flex flex-col gap-2">
      <h2 id="run-receipt" className="sr-only">
        {receiptWords.heading}
      </h2>
      <p className="text-section">{summary}</p>
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
