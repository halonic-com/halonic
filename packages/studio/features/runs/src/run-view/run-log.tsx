import { ListHeading } from "@halonicjs/studio-kit";
import { useId } from "react";
import { everyStepWords, runLogWords } from "../run-words.ts";
import { BlockedSitesLogLines } from "./blocked-sites.tsx";
import type { RunLogLine } from "./run-log-model.ts";

/**
 * The run log view (checklist part 1, 1.10): under the "Every step" heading,
 * one numbered line per event, in monospace, as plain text. Long lines wrap
 * and are never cut sideways.
 */
export function RunLog({ lines }: { readonly lines: readonly RunLogLine[] }) {
  const headingId = useId();
  return (
    <div className="rounded-md border border-border">
      <ListHeading id={headingId} name={everyStepWords.heading} />
      <ol aria-label={runLogWords.label} className="flex flex-col gap-1 px-4 pt-1 pb-4">
        {lines.map((line) =>
          line.kind === "blocked" ? (
            <li key={`blocked-${line.seq}-${line.step.state}`} className="pl-[7ch]">
              <BlockedSitesLogLines step={line.step} />
            </li>
          ) : (
            <li key={line.seq} className="flex gap-2 font-mono text-small">
              <span className="w-[5ch] shrink-0 text-right text-fg-muted tabular-nums">
                {line.seq}
              </span>
              <span className="min-w-0 wrap-anywhere">
                <span className="text-fg-muted tabular-nums">{line.time}</span>{" "}
                <span className="text-fg">{line.type}</span>{" "}
                <span className="text-fg-muted">{line.fields}</span>
              </span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
