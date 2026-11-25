import type { GitHubQuery } from "../snapshot/graphql.ts";
import { type Decision, marker, type PullFacts, type Reason, short } from "./decide.ts";
import { pullKey } from "./facts.ts";
import type { GitHubGet } from "./github.ts";
import type { Paperclip, TaskRow } from "./paperclip.ts";

/**
 * Stacked pull requests (HAL-18031): when the pull request below merges,
 * GitHub deletes its branch and moves the child to `main`. The watcher then
 * asks GitHub once per head to rebase the child on `main`, instead of waking
 * its author. A rebase GitHub takes wakes nobody; one it refuses gives the
 * single wake the author would have had, with the files and the command
 * that leaves out the base's old commits. `main` takes squash merges, so a
 * rebase replays those old commits: GitHub drops the ones that come out
 * empty and refuses when one conflicts (trial on HAL-18035).
 */

/** The merged pull request a child was stacked on: its number and its last head. */
export interface StackBase {
  readonly number: number;
  readonly head: string;
}

/** The merged base of a pull request still carrying its commits, or undefined when it has none. */
export type StackBaseFinder = (pull: PullFacts) => Promise<StackBase | undefined>;

/** One head the watcher tried, kept so it never tries the same head again. */
export interface StackRecord {
  readonly key: string;
  readonly pull: string;
  readonly from: string;
  readonly baseHead: string;
}

/** The heads tried so far, in plugin state between passes. */
export interface TriedHeads {
  has(key: string): boolean;
  /** Saved before the rebase is sent, so a crash can't lead to a second try. */
  add(record: StackRecord): Promise<void>;
  /** The last head of the base a pull request (`pullKey`) was rebased off, when the watcher rebased it from `from`. */
  baseOf(pull: string, from: string): string | undefined;
}

/** Tried heads in memory, saved through `save` after each new one; at most `limit` kept, newest last. */
export function triedHeads(
  records: readonly StackRecord[],
  save: (records: readonly StackRecord[]) => Promise<void>,
  limit = 500,
): TriedHeads {
  let kept = [...records];
  return {
    has: (key) => kept.some((record) => record.key === key),
    add: async (record) => {
      kept = [...kept, record].slice(-limit);
      await save(kept);
    },
    // An approval names its head with 7 or more characters.
    baseOf: (pull, from) =>
      kept.find(
        (record) => record.pull === pull && from.length >= 7 && record.from.startsWith(from),
      )?.baseHead,
  };
}

/** What the stack step needs. Unset in the tick: the step is off. */
export interface StackRebase {
  readonly find: StackBaseFinder;
  readonly rebase: (
    pull: PullFacts,
  ) => Promise<{ kind: "rebased" } | { kind: "refused"; reason: string }>;
  readonly tried: TriedHeads;
}

/** The key that says the watcher tried this head. */
export function stackKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} stack-rebase`;
}

const stackBaseQuery =
  "query StackBase($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { isCrossRepository baseRefName timelineItems(itemTypes: [BASE_REF_CHANGED_EVENT], last: 1) { nodes { ... on BaseRefChangedEvent { previousRefName } } } } } }";

const mergedBaseQuery =
  "query StackBaseMerged($owner: String!, $name: String!, $branch: String!) { repository(owner: $owner, name: $name) { pullRequests(headRefName: $branch, states: [MERGED], last: 1) { nodes { number merged headRefOid } } } }";

interface ChildShape {
  readonly repository?: {
    readonly pullRequest?: {
      readonly isCrossRepository?: boolean;
      readonly baseRefName?: string;
      readonly timelineItems?: { readonly nodes?: readonly { previousRefName?: string }[] };
    } | null;
  } | null;
}

interface BaseShape {
  readonly repository?: {
    readonly pullRequests?: {
      readonly nodes?: readonly { number?: number; merged?: boolean; headRefOid?: string }[];
    };
  } | null;
}

/**
 * The base a child was moved off, read with the read token: the child is in
 * the same repository and now on `main`, its last base change came from a
 * branch whose pull request GitHub says merged, and the child's head still
 * holds that pull request's last head, so its author hasn't rebased yet.
 * Three reads, made only for a pull request the watcher would wake about.
 */
export function gitHubStackBase(query: GitHubQuery, get: GitHubGet): StackBaseFinder {
  return async (pull) => {
    const [owner = "", name = ""] = pull.repo.split("/");
    const child = (await query(stackBaseQuery, { owner, name, number: pull.number })) as ChildShape;
    const facts = child.repository?.pullRequest;
    const from = facts?.timelineItems?.nodes?.at(-1)?.previousRefName;
    if (facts?.isCrossRepository !== false || facts.baseRefName !== "main" || from === undefined) {
      return undefined;
    }
    const base = (await query(mergedBaseQuery, { owner, name, branch: from })) as BaseShape;
    const merged = base.repository?.pullRequests?.nodes?.at(-1);
    if (merged?.merged !== true || merged.number === undefined || merged.headRefOid === undefined) {
      return undefined;
    }
    const compare = (await get(
      `/repos/${pull.repo}/compare/${merged.headRefOid}...${pull.head}`,
    )) as {
      behind_by?: number;
    };
    return compare.behind_by === 0 ? { number: merged.number, head: merged.headRefOid } : undefined;
  };
}

/** What the step needs from the pass. */
export interface StackStepOptions {
  readonly stackRebase?: StackRebase | undefined;
  readonly paperclip: Paperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/** The pull requests a wake names for a base change or a conflict, once each. */
function stackCandidates(reasons: readonly Reason[]): PullFacts[] {
  const pulls = new Map<string, PullFacts>();
  for (const { pull, kind } of reasons) {
    if (kind === "retargeted" || kind === "conflict") {
      pulls.set(pullKey(pull), pull);
    }
  }
  return [...pulls.values()];
}

/** The keys of the reasons about this pull request that the stack step answers. */
function answeredKeys(reasons: readonly Reason[], pull: PullFacts): string[] {
  return reasons
    .filter((reason) => pullKey(reason.pull) === pullKey(pull))
    .filter((reason) => reason.kind === "retargeted" || reason.kind === "conflict")
    .map((reason) => reason.key);
}

/** The note for rebased pull requests: wakes nobody, and keeps their old head's reasons answered. */
export function rebasedNote(
  rebased: readonly { pull: PullFacts; base: StackBase; keys: readonly string[] }[],
): string {
  const lines = rebased.map(
    ({ pull, base }) =>
      `- [#${pull.number}](${pull.url}): #${base.number} below it merged, so GitHub is rebasing it on \`main\` (from \`${short(pull.head)}\`). CI runs on the new head; an approval on the old head goes to its reviewer as rebase only once \`ci-ok\` is green.`,
  );
  return [
    "PR watcher: rebased stacked pull requests, nothing for you to do.",
    "",
    ...lines,
    ...rebased.flatMap(({ pull, keys }) => [stackKey(pull), ...keys].map(marker)),
  ].join("\n");
}

/** Tries one pull request; what came of it, or undefined when it isn't a stacked child to try. */
async function tryOne(
  stack: StackRebase,
  options: StackStepOptions,
  task: TaskRow,
  pull: PullFacts,
): Promise<{ base: StackBase; rebased: boolean; reason?: string } | undefined> {
  if (stack.tried.has(stackKey(pull))) {
    return undefined;
  }
  const base = await stack.find(pull);
  if (base === undefined) {
    return undefined;
  }
  if (options.dryRun) {
    options.log(
      `${task.identifier}: would rebase #${pull.number} after #${base.number} merged (dry run)`,
    );
    return undefined;
  }
  await stack.tried.add({
    key: stackKey(pull),
    pull: pullKey(pull),
    from: pull.head,
    baseHead: base.head,
  });
  const outcome = await stack.rebase(pull);
  options.log(
    `${task.identifier}: rebase of #${pull.number} after #${base.number}: ${outcome.kind === "rebased" ? "sent" : `refused, ${outcome.reason}`}`,
  );
  return outcome.kind === "rebased"
    ? { base, rebased: true }
    : { base, rebased: false, reason: outcome.reason };
}

/**
 * Applies the stack rebase to a wake: each stacked child it names is tried
 * once per head. A rebased one leaves the wake, with a note that wakes
 * nobody; a refused one becomes one `stack-conflict` reason in its place.
 * Anything else in the wake stays. A failed read leaves the wake as it was.
 */
export async function stackStep(
  options: StackStepOptions,
  task: TaskRow,
  decision: Decision,
): Promise<Decision> {
  const stack = options.stackRebase;
  if (stack === undefined || decision.kind !== "wake") {
    return decision;
  }
  let reasons = [...decision.reasons];
  const rebased: { pull: PullFacts; base: StackBase; keys: string[] }[] = [];
  for (const pull of stackCandidates(decision.reasons)) {
    const tried = await tryOne(stack, options, task, pull).catch((error: unknown) => {
      options.log(
        `${task.identifier}: couldn't check #${pull.number} for a stack: ${(error as Error).message}`,
      );
      return undefined;
    });
    if (tried === undefined) {
      continue;
    }
    const keys = answeredKeys(reasons, pull);
    reasons = reasons.filter((reason) => !keys.includes(reason.key));
    if (tried.rebased) {
      rebased.push({ pull, base: tried.base, keys });
    } else {
      reasons.push({
        pull,
        kind: "stack-conflict",
        key: stackKey(pull),
        also: keys,
        base: tried.base,
      });
    }
  }
  if (
    rebased.length > 0 &&
    (await options.paperclip.note(task.id, rebasedNote(rebased))) === "closed"
  ) {
    options.log(`${task.identifier}: closed during this pass, so the rebase note wasn't written`);
  }
  return reasons.length === 0
    ? { kind: "skip", why: "it rebased its stacked pull requests" }
    : { kind: "wake", reasons };
}
