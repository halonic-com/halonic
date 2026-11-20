import type { ApprovalLine } from "./receipt-model.ts";
import { receiptWords } from "./receipt-words.ts";

/** The props of `Receipt`. */
export interface ReceiptProps {
  /** The summary line from `summaryLine`. */
  readonly summary: string;
  /** The Approvals section's lines from `approvalLines`; none hides the section. */
  readonly approvals: readonly ApprovalLine[];
  /** The Items section's lines from `itemLines`; none hides the section. */
  readonly items?: readonly string[];
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
 * <Receipt summary="Finished in 2 min · asked you once" approvals={[]} />
 */
export function Receipt({
  summary,
  approvals,
  items = [],
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
      <TextSection id="receipt-items" heading={receiptWords.itemsHeading} lines={items} />
      <TextSection id="receipt-messages" heading={receiptWords.messagesHeading} lines={messages} />
      <TextSection id="receipt-read" heading={receiptWords.readHeading} lines={reads} />
      <TextSection id="receipt-models" heading={receiptWords.modelsHeading} lines={models} />
      {approvals.length === 0 ? null : (
        <section aria-labelledby="receipt-approvals" className="flex flex-col gap-1">
          <h3 id="receipt-approvals" className="text-label uppercase text-fg-muted">
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

/**
 * What the agent says it did, after the receipt (RCPT-3.4; checklist part 1, 1.9): its own
 * words in a dashed frame, a named region, so they can't be taken for the receipt. Plain text
 * with its line breaks: a Markdown link or image in it shows as text and loads nothing.
 *
 * @example
 * <AgentSays text="This week: 12 emails." />
 */
export function AgentSays({ text }: { readonly text: string }) {
  return (
    <section
      aria-labelledby="run-agent-says"
      className="flex flex-col gap-1 rounded-sm border border-dashed border-border p-3"
    >
      <h2 id="run-agent-says" className="text-label uppercase text-fg-muted">
        {receiptWords.agentSaysHeading}
      </h2>
      <p className="whitespace-pre-wrap break-words text-small">{text}</p>
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
      <h3 id={id} className="text-label uppercase text-fg-muted">
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
