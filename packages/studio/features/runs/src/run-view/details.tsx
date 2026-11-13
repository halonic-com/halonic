import type { RunVersion } from "@halonicjs/events";
import { Tooltip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { detailsWords } from "../run-words.ts";
import type { DetailRow } from "./details-model.ts";
import { RunVersionLine } from "./run-version-line.tsx";

/** The props of `Details`. */
export interface DetailsProps {
  readonly rows: readonly DetailRow[];
  /** What the run's `run.started` records; `undefined` for a run from before the log recorded it. */
  readonly version: RunVersion | undefined;
  /** Whether the log has been read: Ran on waits for it rather than saying "Version not recorded." */
  readonly logRead: boolean;
  readonly runId: string;
  readonly now: Date;
}

/**
 * The run page's Details column (checklist part 1, 1.11): side-label rows, no
 * card, Ran on in words, then the run id in subtle text, last.
 *
 * @example
 * <Details rows={detailRows(run, context, routine)} version={started?.version} logRead runId={run.id} now={now} />
 */
export function Details({ rows, version, logRead, runId, now }: DetailsProps) {
  return (
    <section aria-labelledby="run-details" className="flex flex-col gap-3">
      <h2 id="run-details" className="text-section">
        {detailsWords.heading}
      </h2>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-small">
        {rows.map((row) => (
          <Row key={row.label} label={row.label}>
            {row.tooltip === undefined ? (
              row.value
            ) : (
              <Tooltip text={row.tooltip}>{(props) => <span {...props}>{row.value}</span>}</Tooltip>
            )}
          </Row>
        ))}
        {logRead ? (
          <Row label={detailsWords.ranOn}>
            <RunVersionLine version={version} now={now} />
          </Row>
        ) : null}
      </dl>
      <p className="text-small text-fg-subtle">{runId}</p>
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
