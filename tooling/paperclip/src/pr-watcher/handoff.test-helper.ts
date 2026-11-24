import type { PullFacts } from "./decide.ts";
import { type FakeTask, fakePaperclip } from "./fakes.test-helper.ts";
import type { Reviewer } from "./handoff.ts";
import { tick } from "./watch.ts";

/** Facts and a watcher pass for the review handoff tests (HAL-17675), with facts given directly. */

/** The watched repository. */
export const repo = "halonic-com/halonic";
/** The current head of every pull request unless a test says otherwise. */
export const head = "5701aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
/** An older head. */
export const oldHead = "4999bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/** An open pull request on `branch`, out of draft, green and mergeable, unless `extra` says otherwise. */
export function open(number: number, branch: string, extra: Partial<PullFacts> = {}): PullFacts {
  return {
    repo,
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    branch,
    head,
    ciOkOnHead: "success",
    draft: false,
    conflicting: false,
    inQueue: false,
    retargeted: false,
    latestReview: undefined,
    approvals: [],
    landed: false,
    mergedAt: undefined,
    ...extra,
  };
}

/** What a test sets up. */
export interface Setup {
  readonly tasks: FakeTask[];
  readonly pulls: PullFacts[];
  readonly comments?: Parameters<typeof fakePaperclip>[1];
  readonly byPaths?: Reviewer;
}

/** A fake Paperclip and a `run` that does one watcher pass with a fixed reviewer route. */
export function setup({ tasks, pulls, comments = {}, byPaths = "julian" }: Setup) {
  const paperclip = fakePaperclip(tasks, comments);
  const routed: number[] = [];
  const lines: string[] = [];
  const run = () =>
    tick({
      paperclip: paperclip.paperclip,
      discover: paperclip.discover,
      facts: async (refs) =>
        new Map(
          refs.flatMap((ref) =>
            pulls
              .filter((pull) => pull.number === ref.number)
              .map((pull) => [`${repo}#${ref.number}`, pull] as const),
          ),
        ),
      dryRun: false,
      log: (line) => lines.push(line),
      now: new Date("2026-11-24T17:00:00Z"),
      route: async (pull) => {
        routed.push(pull.number);
        return byPaths;
      },
    });
  return { ...paperclip, routed, lines, run };
}

/** Mateo's branch for HAL-5701. */
export const mateoBranch = "mateo/HAL-5701-work";
