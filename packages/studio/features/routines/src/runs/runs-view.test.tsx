// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineRun, RoutineRuns, RoutineSkip, RoutinesHost, RoutineView } from "../api.ts";
import { RoutineScreen } from "../page/routine-page.tsx";
import { buttonNamed, memoryHost, show, unmount } from "../test-support.tsx";
import { RunsView } from "./runs-view.tsx";

// A fixed midday, so a run started an hour ago is today wherever and whenever the test runs:
// on the real clock it read "yesterday" between 00:00 and 01:00 (HAL-15561).
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
});
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
    // At midday, an hour ago is still today, so the row says a time rather than "yesterday".
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    const runs = [run("81d0ae", { startedBy: "run-now" }), run("891b5a", { outcome: "waiting" })];
    const page = await openRuns(
      hostWith(async () => ({ runs, skips: [] })),
      () => {},
    );

    const names = [...page.querySelectorAll("li button")].map((row) =>
      row.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      "Run 891b5a, needs you. Started: On schedule, 11:00.",
      "Run 81d0ae, done. Started: Run now, 11:00.",
    ]);
  });

  it("ends a run row with the kit's short time, and names it the same way", async () => {
    const yesterday = new Date(2026, 10, 2, 9, 5);
    const runs = [run("9hv3bw", { startedAt: yesterday.toISOString() })];
    const page = await openRuns(
      hostWith(async () => ({ runs, skips: [] })),
      () => {},
    );

    const row = page.querySelector("li button");
    expect(row?.querySelector("time")?.textContent).toBe("Yesterday");
    expect(row?.getAttribute("aria-label")).toBe(
      "Run 9hv3bw, done. Started: On schedule, Yesterday.",
    );
  });

  it("names a run row without a time when its start isn't a date", async () => {
    const runs = [run("9hv3bw", { startedAt: "not a date" })];
    const page = await openRuns(
      hostWith(async () => ({ runs, skips: [] })),
      () => {},
    );

    const row = page.querySelector("li button");
    expect(row?.querySelector("time")).toBeNull();
    expect(row?.getAttribute("aria-label")).toBe("Run 9hv3bw, done. Started: On schedule.");
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

  it("shows a refused start as a quiet row that a screen reader hears as Couldn't start", async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    const at = (minute: number) => new Date(2026, 10, 3, 8, minute).toISOString();
    const noField = "The input has no field mail, which the step Read the email reads.";
    const skips = [
      { reason: "start-refused" as const, sentence: noField, from: at(1), to: at(1), count: 1 },
      { reason: "start-refused" as const, from: at(0), to: at(0), count: 1 },
    ];
    const page = await openRuns(hostWith(async () => ({ runs: [], skips })));

    const [refused, unexplained] = sectionOf(page, "Earlier")?.querySelectorAll("li") ?? [];
    expect(refused?.querySelector("[aria-hidden=true]")?.textContent).toBe(
      `08:01 Tue: couldn't start. ${noField}`,
    );
    expect(refused?.querySelector(".sr-only")?.textContent).toBe(
      `Couldn't start at 08:01 Tue. ${noField}`,
    );
    expect(refused?.querySelector("button")).toBeNull();
    expect(unexplained?.querySelector(".sr-only")?.textContent).toBe(
      "Couldn't start at 08:00 Tue. Halonic ran into a problem it can't explain yet. Press Run now to see the details.",
    );
    expect(page.textContent).not.toContain("No runs yet");
  });

  it("breaks a long word in a refused start's row rather than widen the panel", async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    const at = new Date(2026, 10, 3, 8, 1).toISOString();
    const longName = "attachments_from_the_customer_support_mailbox_forwarding_rule";
    const sentence = `The input has no field ${longName}.`;
    const skips = [{ reason: "start-refused" as const, sentence, from: at, to: at, count: 1 }];
    const page = await openRuns(hostWith(async () => ({ runs: [], skips })));

    // jsdom has no layout, so this checks the class that gives `overflow-wrap: anywhere`; skip and
    // queue rows share it.
    const row = sectionOf(page, "Earlier")?.querySelector("li");
    expect(row?.textContent).toContain(longName);
    expect(row?.classList.contains("wrap-anywhere")).toBe(true);
  });

  it("shows a start refused while the view is open, with its next step, once the host says so", async () => {
    vi.setSystemTime(new Date(2026, 10, 21, 19, 42));
    const at = new Date(2026, 10, 21, 19, 41).toISOString();
    const sentence = 'Writer uses the connector "notes", which Studio can\'t start yet.';
    const fix = "To keep it starting on time, run halonic routines watch in a terminal.";
    let skips: RoutineSkip[] = [];
    const { host, change } = memoryHost([], []);
    const page = await openRuns({
      ...hostWith(async () => ({ runs: [], skips })),
      // A new read each time, as the app's host gives, so the view reads its runs again.
      read: async () => ({ ...daily }),
      subscribe: host.subscribe,
    } as RoutinesHost);
    expect(page.textContent).toContain("No runs yet");

    skips = [{ reason: "start-refused", sentence, fix, from: at, to: at, count: 1 }];
    await act(async () => change([]));

    const row = sectionOf(page, "Earlier")?.querySelector("li");
    expect(row?.querySelector("[aria-hidden=true]")?.textContent).toBe(
      `19:41 Sat: couldn't start. ${sentence} ${fix}`,
    );
    // The command is in code style, and the sentence's full stop isn't part of it.
    expect(row?.querySelector("code")?.textContent).toBe("halonic routines watch");
    expect(row?.querySelector(".sr-only")?.textContent).toBe(
      `Couldn't start at 19:41 Sat. ${sentence} ${fix}`,
    );
    expect(page.textContent).not.toContain("No runs yet");
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

  it("says what the list says, and no next time, for a routine that won't start on its own", async () => {
    const gone = {
      ...daily,
      targetName: "gone-report",
      target: { ...daily.target, id: "gone-report" },
      targetState: "not-found",
    } as const;
    const cases: [RoutineView, string][] = [
      [gone, "gone-report isn't in this workspace. Pick another workflow."],
      [{ ...daily, startErrors: ["Unknown time zone Mars/Base."] }, "Unknown time zone Mars/Base."],
      [{ ...daily, enabled: false }, "It's off, so it runs only when you press Run now."],
      [{ ...daily, everLive: false }, "It isn't live yet, so it doesn't run."],
      [
        { ...daily, everLive: false, pausedUntilTrusted: true },
        "It isn't live yet, so it doesn't run.",
      ],
      [{ ...daily, pausedUntilTrusted: true }, "It's paused until you trust this workspace."],
    ];
    for (const [routine, line] of cases) {
      const page = await openRuns(hostWith(async () => ({ runs: [], skips: [] }), routine));
      expect(page.textContent).toContain("No runs yet");
      expect(page.textContent).toContain(line);
      expect(page.textContent).not.toContain("It runs next on");
      unmount();
    }
  });

  it("offers Review, which opens the trust check, on a paused routine's empty view (C656 #4)", async () => {
    let asked = 0;
    const host = hostWith(async () => ({ runs: [], skips: [] }), {
      ...daily,
      pausedUntilTrusted: true,
    });
    const page = await openRuns({
      ...host,
      askTrust: async () => {
        asked += 1;
        return "declined";
      },
    });
    expect(page.textContent).toContain("It's paused until you trust this workspace.");
    await act(async () => buttonNamed(page, "Review")?.click());
    expect(asked).toBe(1);
    unmount();

    // Without a trust check to open there's no button, and an off routine never offers one.
    expect(buttonNamed(await openRuns(host), "Review")).toBeUndefined();
    unmount();
    const off = hostWith(async () => ({ runs: [], skips: [] }), { ...daily, enabled: false });
    expect(
      buttonNamed(await openRuns({ ...off, askTrust: async () => "trusted" }), "Review"),
    ).toBeUndefined();
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
