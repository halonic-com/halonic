// The words of a run proposal's row (flow-inbox 2.2, microcopy 10.1,
// HAL-11945 Q1 and Q2). A proposal isn't an approval, so none of them says
// "approve".

import { shortRunId } from "@halonicjs/app";
import { markHiddenName } from "@halonicjs/std";
import type { ProposalEnding, ProposalItem } from "../proposal-items.ts";
import { endedAgo } from "./waiting-time.ts";

const endingVerbs: Readonly<Record<ProposalEnding, string>> = {
  finished: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

/**
 * The row's title: "Run 01JD8Q proposes 3 changes to Support triage", with more items "to Support
 * triage and 2 more". Item names come from workspace files, so hidden characters are marked.
 *
 * @example
 * proposalTitle(item); // "Run 01JD8Q proposes 1 change to Support triage"
 */
export function proposalTitle(item: ProposalItem): string {
  const changes = `${item.changes} ${item.changes === 1 ? "change" : "changes"}`;
  return `Run ${shortRunId(item.runId)} proposes ${changes}${toItems(item.itemNames)}`;
}

function toItems(names: readonly string[]): string {
  const [first] = names;
  if (first === undefined) return "";
  const more = names.length > 1 ? ` and ${names.length - 1} more` : "";
  return ` to ${markHiddenName(first)}${more}`;
}

/**
 * The row's meta, read from the run's record (Q2): "Finished 2 h ago", "Failed 2 h ago" or
 * "Stopped 2 h ago"; "Ended 2 h ago" when the record can't be read.
 */
export function proposalMeta(item: ProposalItem, now: Date): string {
  const verb = item.ending === null ? "Ended" : endingVerbs[item.ending];
  return endedAgo(verb, new Date(item.since), now);
}
