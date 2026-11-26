import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { prStatus } from "../pr-tools/pr-status.ts";
import { type PullLine, statusLine } from "../state-packet/pull-line.ts";
import type { Decision, PullFacts } from "./decide.ts";
import {
  agents,
  fakeGitHub,
  fakePaperclip,
  type RecordingName,
  recording,
  restFacts,
  task,
} from "./fakes.test-helper.ts";
import {
  dedupeReason,
  factMarks,
  isShortCheck,
  lineMarks,
  type MonitorCheck,
} from "./monitor-dedupe.ts";
import { tick } from "./watch.ts";

const now = new Date("2026-11-23T10:00:00Z");
const sixHoursOut = "2026-11-23T16:00:00.000Z";

/** A check time this many minutes after `now`. */
function inMinutes(minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function run(
  name: RecordingName,
  paperclip: ReturnType<typeof fakePaperclip>,
  lastCheck?: MonitorCheck,
  dryRun = false,
) {
  const lines: string[] = [];
  const asked: string[] = [];
  const summary = tick({
    paperclip: paperclip.paperclip,
    facts: restFacts(fakeGitHub(recording(name)).get),
    discover: paperclip.discover,
    dryRun,
    log: (line) => lines.push(line),
    now,
    lastCheck: async (identifier) => {
      asked.push(identifier);
      return lastCheck;
    },
  });
  return { summary, lines, asked };
}

/** The facts the watcher reads for a recording's task, as a monitor wake would have kept them. */
async function factsOf(name: RecordingName, number: number): Promise<PullFacts[]> {
  const paperclip = fakePaperclip([task(number, agents.mateo)]);
  let seen: readonly PullFacts[] = [];
  await tick({
    paperclip: paperclip.paperclip,
    facts: restFacts(fakeGitHub(recording(name)).get),
    discover: paperclip.discover,
    dryRun: true,
    log: () => undefined,
    now,
    observe: (_task, _owner, pulls) => {
      seen = pulls;
    },
  });
  return [...seen];
}

async function checkOf(pulls: readonly PullFacts[]): Promise<MonitorCheck> {
  return { at: inMinutes(-20), marks: factMarks(pulls) };
}

verifies("paperclip.monitor-dedupe", () => {
  test("moves the short check of a task the watcher wakes the author on", async () => {
    // #4614: failed ci-ok and a conflict, outside the merge queue, on Mateo's branch.
    const paperclip = fakePaperclip([
      task(4614, agents.mateo, { monitorNextCheckAt: inMinutes(20) }),
    ]);
    const { summary, lines, asked } = run("red-and-conflicting", paperclip);
    expect(await summary).toMatchObject({ woken: 1, dedupedWake: 1, postponed: 0, failed: [] });
    expect(paperclip.postponed).toEqual([{ taskId: "task-4614", until: sixHoursOut }]);
    expect(lines).toContain(
      `Monitor dedupe: HAL-4614: the watcher wakes the author now; moved its monitor to ${sixHoursOut}`,
    );
    // The wake decides it; the kept check isn't read.
    expect(asked).toEqual([]);
  });

  test("moves the short check when head and ci-ok are unchanged since the last monitor check", async () => {
    const last = await checkOf(await factsOf("green", 4605));
    const paperclip = fakePaperclip([
      task(4605, agents.mateo, { monitorNextCheckAt: inMinutes(15) }),
    ]);
    const { summary, lines } = run("green", paperclip, last);
    expect(await summary).toMatchObject({ dedupedUnchanged: 1, postponed: 0, failed: [] });
    expect(paperclip.postponed).toEqual([{ taskId: "task-4605", until: sixHoursOut }]);
    expect(lines).toContain(
      `Monitor dedupe: HAL-4605: head and ci-ok unchanged since the last monitor check; moved its monitor to ${sixHoursOut}`,
    );
  });

  test("leaves the short check alone when the head or ci-ok changed, or no check was kept", async () => {
    const [pull] = await factsOf("green", 4605);
    if (pull === undefined) {
      throw new Error("the green recording has no pull request");
    }
    const changed = [
      await checkOf([{ ...pull, head: "0000000000000000000000000000000000000000" }]),
      await checkOf([{ ...pull, ciOkOnHead: "pending" }]),
      { at: inMinutes(-20), marks: null },
      undefined,
    ];
    for (const last of changed) {
      const paperclip = fakePaperclip([
        task(4605, agents.mateo, { monitorNextCheckAt: inMinutes(15) }),
      ]);
      expect(await run("green", paperclip, last).summary).toMatchObject({
        dedupedUnchanged: 0,
        postponed: 0,
      });
      expect(paperclip.postponed).toEqual([]);
    }
  });

  test("never counts a red ci-ok or an open finding as unchanged", async () => {
    const [pull] = await factsOf("green", 4605);
    if (pull === undefined) {
      throw new Error("the green recording has no pull request");
    }
    const skip: Decision = { kind: "skip", why: "nothing new" };
    const unchanged = async (pulls: PullFacts[]) =>
      dedupeReason(skip, pulls, async () => checkOf(pulls));
    expect(await unchanged([pull])).toBe("unchanged");
    // A same-head re-run: the old failed ci-ok is the newest until the re-run's jobs finish.
    expect(await unchanged([{ ...pull, ciOkOnHead: "failure" }])).toBeUndefined();
    // An open finding: the short check keeps a progress note from counting as an answer.
    const finding = { id: "review-1", at: inMinutes(-30), by: "Julian" };
    expect(await unchanged([{ ...pull, latestReview: finding }])).toBeUndefined();
  });

  test("leaves a monitor already due, and short checks with the setting off, alone", async () => {
    const last = await checkOf(await factsOf("green", 4605));
    const due = fakePaperclip([task(4605, agents.mateo, { monitorNextCheckAt: inMinutes(-1) })]);
    expect(await run("green", due, last).summary).toMatchObject({ dedupedUnchanged: 0 });
    const off = fakePaperclip([task(4614, agents.mateo, { monitorNextCheckAt: inMinutes(20) })]);
    const summary = await tick({
      paperclip: off.paperclip,
      facts: restFacts(fakeGitHub(recording("red-and-conflicting")).get),
      discover: off.discover,
      dryRun: false,
      log: () => undefined,
      now,
    });
    expect(summary).toMatchObject({ woken: 1, dedupedWake: 0 });
    expect(off.postponed).toEqual([]);
  });

  test("in a dry run only logs the move", async () => {
    const paperclip = fakePaperclip([
      task(4614, agents.mateo, { monitorNextCheckAt: inMinutes(20) }),
    ]);
    const { summary, lines } = run("red-and-conflicting", paperclip, undefined, true);
    expect(await summary).toMatchObject({ dedupedWake: 1 });
    expect(paperclip.postponed).toEqual([]);
    expect(lines).toContain(
      `Monitor dedupe: HAL-4614: the watcher wakes the author now; would move its monitor to ${sixHoursOut} (dry run)`,
    );
  });
});

describe("marks", () => {
  const line = (extra: Partial<PullLine>): PullLine => ({
    repo: "acme/rockets",
    number: 41,
    state: "open",
    draft: false,
    commit: "abc1234",
    ciOk: "pending",
    mergeable: "yes",
    approvedBy: [],
    queue: false,
    dataAsOf: now.toISOString(),
    ...extra,
  });

  test("a monitor wake's lines mark only open pull requests, sorted, and none while one is a draft", () => {
    expect(
      lineMarks([line({ number: 42 }), line({ state: "merged", number: 7 }), line({})]),
    ).toEqual(["acme/rockets#41@abc1234 pending", "acme/rockets#42@abc1234 pending"]);
    expect(lineMarks([line({}), line({ number: 42, draft: true })])).toBeNull();
  });

  test("a monitor wake's lines mark a pull request as the watcher's facts do", async () => {
    const facts = await factsOf("green", 4605);
    const [pull] = facts;
    if (pull === undefined) {
      throw new Error("the green recording has no pull request");
    }
    // The recording holds what the watcher reads; what only `pr_status` reads answers empty.
    const recorded = fakeGitHub(recording("green")).get;
    const get = async (path: string) => {
      try {
        return await recorded(path);
      } catch {
        return /\/compare\//.test(path) ? {} : [];
      }
    };
    const status = await prStatus(get, pull.repo, pull.number);
    expect(factMarks(facts)).toHaveLength(1);
    expect(lineMarks([statusLine(status, [], now.toISOString())])).toEqual(factMarks(facts));
  });

  test("a short check is due after now and within the hour", () => {
    expect(isShortCheck(inMinutes(1), now)).toBe(true);
    expect(isShortCheck(inMinutes(59), now)).toBe(true);
    expect(isShortCheck(inMinutes(60), now)).toBe(false);
    expect(isShortCheck(inMinutes(0), now)).toBe(false);
    expect(isShortCheck(null, now)).toBe(false);
  });
});
