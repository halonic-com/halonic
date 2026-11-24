import type {
  MergeQueue,
  PullRequestList,
  Seat,
  SpendSummary,
  TeamStatusParts,
} from "@halonicjs/ports";

// Each function copies only the fields the port names, so whatever else a
// provider hangs on an answer (a request, its headers, a key) never reaches
// the hub's answers or its cache file (requirement `agent-host.team-status-hub`).
// The team status types nest deeper than messaging's, so the fields are
// written as shapes and one picker walks them.

/** The fields of a type to keep: `true` for a plain value or a list of them, a nested shape for an object. */
type Shape = { readonly [field: string]: true | Shape };

const money: Shape = { cents: true, currency: true };
const tokens: Shape = { input: true, cached: true, output: true };
const author: Shape = { kind: true, agent: true, name: true };

const partsShape: Shape = { source: true, spend: true, seats: true, pullRequests: true };

const spendShape: Shape = {
  asOf: true,
  source: true,
  range: true,
  paid: money,
  tokens,
  budget: money,
  unpricedRuns: true,
};

const seatShape: Shape = {
  asOf: true,
  id: true,
  source: true,
  label: true,
  role: true,
  state: true,
  windows: { kind: true, label: true, usedPercent: true, resetsAt: true, reaches90At: true },
  agents: true,
  manualReset: { usedAt: true },
  proposal: { text: true, at: true },
};

const pullRequestShape: Shape = {
  id: true,
  source: true,
  repo: true,
  label: true,
  title: true,
  author,
  work: true,
  reviewer: author,
  state: true,
  since: true,
  reason: true,
  fastTrack: true,
  queue: { position: true, group: true },
  changedLines: true,
  webLink: true,
};

const pullRequestListShape: Shape = {
  asOf: true,
  source: true,
  repo: true,
  open: pullRequestShape,
  recent: pullRequestShape,
};

const mergeQueueShape: Shape = {
  asOf: true,
  source: true,
  repo: true,
  health: true,
  runnerWaitMinutes: true,
  medianMinutesToMerge: true,
  groups: { position: true, state: true, since: true, pullRequests: true },
  waiting: true,
  removedToday: { pullRequest: true, at: true, reason: true },
};

/**
 * A copy of `value` with only the fields `shape` names. A list is copied item
 * by item. An object where the shape expects a plain value is dropped, so an
 * unknown object never slips in under a known name.
 */
function picked(value: unknown, shape: true | Shape): unknown {
  if (Array.isArray(value)) {
    return value.map((each) => picked(each, shape)).filter((each) => each !== undefined);
  }
  if (typeof value === "function") return undefined;
  if (typeof value !== "object" || value === null) return value;
  if (shape === true) return undefined;
  const fields = value as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const [field, fieldShape] of Object.entries(shape)) {
    const each = picked(fields[field], fieldShape);
    if (each !== undefined) kept[field] = each;
  }
  return kept;
}

// The casts below hold because each shape lists exactly its type's fields.

/** The parts' port fields only. */
export function keptParts(parts: TeamStatusParts): TeamStatusParts {
  return picked(parts, partsShape) as TeamStatusParts;
}

/** The spend summary's port fields only. */
export function keptSpend(spend: SpendSummary): SpendSummary {
  return picked(spend, spendShape) as SpendSummary;
}

/** The seat's port fields only. */
export function keptSeat(seat: Seat): Seat {
  return picked(seat, seatShape) as Seat;
}

/** The pull request list's port fields only, its pull requests' too. */
export function keptPullRequestList(list: PullRequestList): PullRequestList {
  return picked(list, pullRequestListShape) as PullRequestList;
}

/** The merge queue's port fields only. */
export function keptMergeQueue(queue: MergeQueue): MergeQueue {
  return picked(queue, mergeQueueShape) as MergeQueue;
}
