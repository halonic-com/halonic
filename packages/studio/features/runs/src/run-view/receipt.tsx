import { receiptWords } from "../run-words.ts";

/** The props of `Receipt`. */
export interface ReceiptProps {
  /** The summary line from `summaryLine`. */
  readonly summary: string;
}

/**
 * The run page's receipt (checklist part 1, 1.9): the `h2` and the summary
 * line, `text-section`, wrapping. Its sections come in the next pull requests.
 *
 * @example
 * <Receipt summary="Finished in 2 min · sent nothing" />
 */
export function Receipt({ summary }: ReceiptProps) {
  return (
    <section aria-labelledby="run-receipt" className="flex flex-col gap-2">
      <h2 id="run-receipt" className="sr-only">
        {receiptWords.heading}
      </h2>
      <p className="text-section">{summary}</p>
    </section>
  );
}
