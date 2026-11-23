import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  agents,
  fakeGitHub,
  fakePaperclip,
  type RecordingName,
  recording,
  restFacts,
  task,
} from "./fakes.test-helper.ts";
import { postponeUntil } from "./monitors.ts";
import { tick } from "./watch.ts";

const now = new Date("2026-11-23T10:00:00Z");
const sixHoursOut = "2026-11-23T16:00:00.000Z";

/** A check time this many minutes after `now`. */
function inMinutes(minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function run(name: RecordingName, paperclip: ReturnType<typeof fakePaperclip>, dryRun = false) {
  const lines: string[] = [];
  const summary = tick({
    paperclip: paperclip.paperclip,
    facts: restFacts(fakeGitHub(recording(name)).get),
    discover: paperclip.discover,
    dryRun,
    log: (line) => lines.push(line),
    now,
  });
  return { summary, lines };
}

verifies("paperclip.pr-watcher-monitor-postpone", () => {
  test("moves the fallback monitor of a task with an open pull request 6 hours out", async () => {
    // #4605: open, green, on Mateo's branch.
    const paperclip = fakePaperclip([
      task(4605, agents.mateo, { monitorNextCheckAt: inMinutes(180) }),
    ]);
    const { summary, lines } = run("green", paperclip);
    expect(await summary).toMatchObject({ postponed: 1, postponeRefused: 0, failed: [] });
    expect(paperclip.postponed).toEqual([{ taskId: "task-4605", until: sixHoursOut }]);
    expect(lines).toContain(`HAL-4605: moved its monitor to ${sixHoursOut}`);
  });

  test("leaves the author's short CI check, a monitor still far enough out, and no monitor alone", async () => {
    for (const monitorNextCheckAt of [inMinutes(20), inMinutes(330), null]) {
      const paperclip = fakePaperclip([task(4605, agents.mateo, { monitorNextCheckAt })]);
      expect(await run("green", paperclip).summary).toMatchObject({ postponed: 0 });
      expect(paperclip.postponed).toEqual([]);
    }
  });

  test("leaves the monitor of a task it marks done alone", async () => {
    // #4485: merged with a green ci-ok, on Priya's branch.
    const paperclip = fakePaperclip([
      task(4485, agents.priya, { monitorNextCheckAt: inMinutes(180) }),
    ]);
    expect(await run("merged-green", paperclip).summary).toMatchObject({ done: 1, postponed: 0 });
    expect(paperclip.postponed).toEqual([]);
  });

  test("leaves the monitor of a task the reviewer holds alone", async () => {
    const paperclip = fakePaperclip([
      task(4605, agents.liam, {
        branch: "mateo/HAL-4605-work",
        monitorNextCheckAt: inMinutes(180),
      }),
    ]);
    expect(await run("green", paperclip).summary).toMatchObject({ postponed: 0 });
    expect(paperclip.postponed).toEqual([]);
  });

  test("logs and counts a refused move without failing the task", async () => {
    const refusal =
      "Monitor postpone refused (past_timeout): `until` must be earlier than the monitor's timeoutAt";
    const paperclip = fakePaperclip(
      [task(4605, agents.mateo, { monitorNextCheckAt: inMinutes(180) })],
      {},
      new Set(),
      refusal,
    );
    const { summary, lines } = run("green", paperclip);
    expect(await summary).toMatchObject({ postponed: 0, postponeRefused: 1, failed: [] });
    expect(lines).toContain(`HAL-4605: couldn't move its monitor: ${refusal}`);
  });

  test("in a dry run only logs the move", async () => {
    const paperclip = fakePaperclip([
      task(4605, agents.mateo, { monitorNextCheckAt: inMinutes(180) }),
    ]);
    const { summary, lines } = run("green", paperclip, true);
    expect(await summary).toMatchObject({ postponed: 1 });
    expect(paperclip.postponed).toEqual([]);
    expect(lines).toContain(`HAL-4605: would move its monitor to ${sixHoursOut} (dry run)`);
  });
});

describe("postponeUntil", () => {
  test("moves a monitor due from 1 hour up to, not including, 5 hours out", () => {
    expect(postponeUntil(inMinutes(59), now)).toBeUndefined();
    expect(postponeUntil(inMinutes(60), now)).toBe(sixHoursOut);
    expect(postponeUntil(inMinutes(299), now)).toBe(sixHoursOut);
    expect(postponeUntil(inMinutes(300), now)).toBeUndefined();
    expect(postponeUntil(inMinutes(-5), now)).toBeUndefined();
    expect(postponeUntil(null, now)).toBeUndefined();
  });
});
