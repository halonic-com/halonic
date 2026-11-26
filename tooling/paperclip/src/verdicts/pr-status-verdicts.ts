import type { PrStatus } from "../pr-tools/pr-status.ts";
import type { GitHubGet } from "../pr-watcher/github.ts";
import { type RecordedGate, type RecordedSource, refusedGate } from "./gate.ts";
import { recordedGateOf } from "./gate-read.ts";
import { readVerdictPull } from "./pull-facts.ts";

/**
 * `pr_status` and the board's flag (HAL-19969). With the flag off nothing
 * changes and the answer says so; with it on, the approvals and whether the
 * head is approved come only from the recorded verdicts (`recordedGateOf`),
 * never from PR comments, and any read that fails counts as not approved.
 */

/** Where approvals come from: the records once the flag is on, or undefined while it is off. */
export type VerdictGate = RecordedSource | undefined;

async function gateOf(
  get: GitHubGet,
  status: PrStatus,
  source: RecordedSource,
): Promise<RecordedGate> {
  try {
    const facts = await readVerdictPull(get, status.repo, status.number);
    if (facts.head !== status.head.toLowerCase()) {
      return refusedGate("the head moved while it was read: ask again");
    }
    return await recordedGateOf(source, { ...facts, repo: status.repo, number: status.number });
  } catch (error) {
    return refusedGate(`the pull request couldn't be read: ${(error as Error).message}`);
  }
}

/** The status with its approvals from the source the board's flag names. */
export async function withVerdictGate(
  get: GitHubGet,
  status: PrStatus,
  source: VerdictGate,
): Promise<PrStatus> {
  if (source === undefined) {
    return { ...status, verdictGate: "off" };
  }
  const gate = await gateOf(get, status, source);
  const [why] = gate.reasons;
  return {
    ...status,
    approvals: gate.approvals,
    approvedOnHead: gate.approved,
    verdictGate: "on",
    ...(why === undefined ? {} : { verdictWhy: why }),
  };
}

/** The line that says where the approvals come from. */
export function verdictGateText(status: PrStatus): string | undefined {
  if (status.verdictGate === undefined) {
    return undefined;
  }
  if (status.verdictGate === "off") {
    return "approvals read from: PR comments (the board's verdict flag is off)";
  }
  const why = status.verdictWhy === undefined ? "" : `; not approved: ${status.verdictWhy}`;
  return `approvals read from: recorded verdicts only (the board's verdict flag is on)${why}`;
}
