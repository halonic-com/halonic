// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineRun, RoutineRuns, RoutinesHost, RoutineView } from "../api.ts";
import { RoutineScreen } from "../page/routine-page.tsx";
import { buttonNamed, memoryHost, show, unmount } from "../test-support.tsx";
import { RunsView } from "./runs-view.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const daily: RoutineView = {
  hubId: "acme",
  id: "daily",
  name: "Daily",
  enabled: true,
  trigger: { kind: "schedule", cron: "30 7 * * 1-5" },
  triggerSentence: "Weekdays at 07:30",
  summary: "Weekdays at 07:30 → Briefing",
  targetName: "Briefing",
  target: { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" },
  targetState: "ready",
  overlap: "skip",
  catchUp: "last",
  file: "hubs/acme/workflows/routines/daily.routine.yaml",
  everLive: true,
  changesNotLive: false,
  problems: [],
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

function run(shortId: string, more: Partial<RoutineRun> = {}): RoutineRun {
  return {
    runId: `run_${shortId}`,
    shortId,
    startedAt: hoursAgo(1),
    outcome: "completed",
    startedBy: "schedule",
    ...more,
  };
}

/** A host that reads `daily` and answers the runs with `answer`, which may reject. */
function hostWith(answer: () => Promise<RoutineRuns>, routine: RoutineView = daily) {
  const { host } = memoryHost([], []);
  return {
    ...host,
    mailboxes: async () => [],
    targets: async () => [],
    nextTimes: async () => ({
      times: [new Date(2026, 10, 6, 7, 30).toISOString()],
      atNextCheck: false,
    }),
    read: async () => routine,
    runs: answer,
  } as RoutinesHost;
}

async function openRuns(host: RoutinesHost, openRun?: (runId: string) => void) {
  const page = await show(
    <RoutineScreen
      host={host}
      hubId="acme"
      id="daily"
      announce={() => {}}
      {...(openRun ? { openRun } : {})}
    />,
  );
  const tab = [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((each) =>
    each.textContent?.startsWith("Runs"),
  );
  await act(async () => tab?.click());
  return page;
}

const sectionOf = (page: HTMLElement, title: string) =>
  [...page.querySelectorAll("section")].find(
    (each) => each.querySelector("h2")?.textContent === title,
  );

verifies("routines.runs.view", () => {
  it("lists a finished run under Earlier and opens it", async () => {
    const opened: string[] = [];
    const page = await openRuns(
      hostWith(async () => ({ runs: [run("9hv3bw")], skips: [] })),
      (runId) => opened.push(runId),
    );

    const earlier = sectionOf(page, "Earlier");
    expect(earlier?.textContent).toContain("Done");
    expect(earlier?.textContent).toContain("9hv3bw");
    expect(earlier?.textContent).toContain("On schedule");
    await act(async () => earlier?.querySelector("button")?.click());
    expect(opened).toEqual(["run_9hv3bw"]);
  });

  it("names a run row as the Runs list does, not as its loose words", async () => {
    const runs = [run("81d0ae", { startedBy: "run-now" }), run("891b5a", { outcome: "waiting" })];
    const page = await openRuns(
      hostWith(async () => ({ runs, skips: [] })),
      () => {},
    );

    const names = [...page.querySelectorAll("li button")].map((row) =>
      row.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      expect.stringMatching(/^Run 891b5a, needs you\. Started: On schedule, \d\d:\d\d\.$/),
      expect.stringMatching(/^Run 81d0ae, done\. Started: Run now, \d\d:\d\d\.$/),
    ]);
  });

  it("stacks a run row in two lines on a phone", async () => {
    const runs = { runs: [run("a1b2")], skips: [] };
    const page = await show(
      <PresentationProvider presentation="phone">
        <RunsView
          host={hostWith(async () => runs)}
          routine={daily}
          load={{ kind: "ready", runs }}
          retry={() => {}}
          openRun={() => {}}
        />
      </PresentationProvider>,
    );
    const row = page.querySelector("li button");
    expect(row?.children).toHaveLength(1);
    expect(row?.firstElementChild?.children).toHaveLength(2);
    expect(row?.textContent).toContain("a1b2");
  });

  it("puts running and waiting runs under Now and counts the waiting one on the tab", async () => {
    const runs = [
      run("run001", { outcome: "running", startedBy: "run-now" }),
      run("wait01", { outcome: "waiting" }),
    ];
    const page = await openRuns(hostWith(async () => ({ runs, skips: [] })));

    expect(sectionOf(page, "Now")?.textContent).toContain("run001");
    expect(sectionOf(page, "Now")?.textContent).toContain("wait01");
    expect(sectionOf(page, "Earlier")).toBeUndefined();
    const tab = [...page.querySelectorAll("[role=tab]")].find((each) =>
      each.textContent?.startsWith("Runs"),
    );
    expect(tab?.textContent).toContain("1 needs you");
  });

  it("shows a skipped range as a quiet row that is not a button", async () => {
    const at = new Date(2026, 10, 3, 8, 0).toISOString();
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    const skips = [{ reason: "busy" as const, from: at, to: at, count: 1 }];
    const page = await openRuns(hostWith(async () => ({ runs: [], skips })));

    const row = sectionOf(page, "Earlier")?.querySelector("li");
    expect(row?.textContent).toBe("08:00 Tue: the last run was still busy");
    expect(row?.querySelector("button")).toBeNull();
  });

  it("says a range of skipped times within one day with the day once", async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    const skips = [
      {
        reason: "target-never-live" as const,
        from: new Date(2026, 10, 3, 7, 0).toISOString(),
        to: new Date(2026, 10, 3, 9, 0).toISOString(),
        count: 3,
      },
    ];
    const page = await openRuns(hostWith(async () => ({ runs: [], skips })));
    expect(page.textContent).toContain("07:00 to 09:00 Tue: Briefing isn't live yet");
  });

  it("shows queued times as one quiet row under Now that a screen reader hears as Queued", async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    const queued = {
      from: new Date(2026, 10, 2, 14, 0).toISOString(),
      to: new Date(2026, 10, 3, 8, 0).toISOString(),
      count: 99,
    };
    const page = await openRuns(hostWith(async () => ({ runs: [], skips: [], queued })));

    const row = sectionOf(page, "Now")?.querySelector("li");
    expect(row?.textContent).toBe(
      "Queued, 14:00 Mon to 08:00 Tue: 99 times waiting to start, one after another",
    );
    expect(row?.querySelector(".sr-only")?.textContent).toBe("Queued, ");
  });

  it("says when it runs next when there are no runs", async () => {
    const page = await openRuns(hostWith(async () => ({ runs: [], skips: [] })));
    expect(page.textContent).toContain("No runs yet");
    expect(page.textContent).toContain("It runs next on Fri 6 Nov at 07:30, or press Run now.");
  });

  it("says Press Run now for a routine that has no next time", async () => {
    const manual = { ...daily, trigger: { kind: "manual" } as const };
    const page = await openRuns(hostWith(async () => ({ runs: [], skips: [] }), manual));
    expect(page.textContent).toContain("Press Run now to start one.");
  });

  it("says the runs can't be read and tries again", async () => {
    let fail = true;
    const page = await openRuns(
      hostWith(async () => {
        if (fail) throw new KindedError("unavailable", "The engine isn't answering.");
        return { runs: [run("9hv3bw")], skips: [] };
      }),
    );
    expect(page.textContent).toContain("Couldn't load runs");

    fail = false;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(sectionOf(page, "Earlier")?.textContent).toContain("9hv3bw");
  });
});
