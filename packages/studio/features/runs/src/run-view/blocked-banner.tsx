import type { RunEvent, RunSummary } from "@halonicjs/events";
import { Callout } from "@halonicjs/studio-kit";
import { runPageWords } from "../run-words.ts";
import { BlockedSitesBannerText, seeTheStepText } from "./blocked-sites.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { type AgentBlockedSites, stepBlockedSites } from "./step-events-model.ts";

/** A run the sandbox stopped: the step it failed in and what that step was refused. */
export interface BlockedFailure {
  readonly entryId: string;
  readonly blocked: AgentBlockedSites;
}

/**
 * Whether a failed run was stopped by the sandbox (microcopy 15.3 and 23.2). The engine has no
 * `blocked` reason yet, so a run counts when it failed without a specific reason (none, or
 * `error`) in a step the sandbox refused sites in. `undefined` for any other run, so the page
 * keeps its general banner.
 */
export function blockedFailure(
  summary: RunSummary,
  log: readonly RunEvent[],
  entries: readonly StepEntry[],
): BlockedFailure | undefined {
  if (summary.status !== "failed") return undefined;
  if (summary.reason !== null && summary.reason !== "error") return undefined;
  const failed = entries.findLast((entry) => entry.mark === "failed");
  const blocked = failed === undefined ? undefined : stepBlockedSites(log, failed.id)[0];
  return failed === undefined || blocked === undefined
    ? undefined
    : { entryId: failed.id, blocked };
}

/** The failed banner for a run the sandbox stopped: which sites, and **See the step**. */
export function BlockedFailureBanner({
  failure,
  onSeeStep,
}: {
  readonly failure: BlockedFailure;
  readonly onSeeStep: (entryId: string) => void;
}) {
  const { entryId, blocked } = failure;
  return (
    <section aria-label={runPageWords.failedName}>
      <Callout
        tone="danger"
        action={{ label: seeTheStepText(), onClick: () => onSeeStep(entryId) }}
      >
        <BlockedSitesBannerText
          step={blocked.sites}
          agent={blocked.agent}
          noConnectionProven={false}
        />
      </Callout>
    </section>
  );
}
