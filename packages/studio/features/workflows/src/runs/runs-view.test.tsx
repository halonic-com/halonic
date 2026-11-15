// @vitest-environment jsdom

import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonNamed, memoryRuns, runSummary, show, unmount } from "../test-support.tsx";
import { RunsView } from "./runs-view.tsx";
import { runsWords } from "./runs-words.ts";
import { useRuns } from "./use-runs.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const reply = { hubId: "acme", id: "reply" };

/** The view as the page draws it: the page reads the runs and hands them down. */
function Connected(props: {
  source: RunsSource;
  openRun?: (id: string) => void;
  seeAll?: () => void;
  reviewInInbox?: () => void;
}) {
  const { load, retry } = useRuns(props.source);
  return <RunsView {...props} load={load} retry={retry} workflow={reply} />;
}

const finished = runSummary({
  id: "run_a_01done",
  status: "completed",
  state: null,
  endedAt: "2026-11-09T10:45:00.000Z",
});

verifies("workflows.runs.runs-view", () => {
  it("lists Now and Earlier with a test run left out, and See all opens the Runs list", async () => {
    const seeAll = vi.fn();
    const { source } = memoryRuns([
      runSummary({ id: "run_b_01going" }),
      finished,
      runSummary({ id: "run_c_01test1", kind: "test" }),
    ]);
    const page = await show(<Connected source={source} seeAll={seeAll} />);

    expect([...page.querySelectorAll("h2")].map((one) => one.textContent)).toEqual([
      "Now",
      "Earlier",
    ]);
    expect(page.querySelectorAll("li")).toHaveLength(2);
    expect(page.textContent).not.toContain("01test1");
    await act(async () => buttonNamed(page, runsWords.seeAll)?.click());
    expect(seeAll).toHaveBeenCalledOnce();
  });

  it("says there are no runs yet", async () => {
    const page = await show(<Connected source={memoryRuns().source} />);

    expect(page.textContent).toBe("No runs yet. Press Run to start one.");
  });

  it("shows a skeleton after 300 ms, then why the runs can't load, and reads again on Try again", async () => {
    const { source, failWith } = memoryRuns([finished]);
    let release: (runs: never[]) => void = () => {};
    const slow: RunsSource = {
      ...source,
      list: () => new Promise((resolve) => (release = resolve)),
    };
    const page = await show(<Connected source={slow} />);
    expect(page.querySelector("[role=status]")).toBeNull();
    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading runs");
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
    await act(async () => release([]));

    failWith(new Error("The engine isn't answering."));
    const failing = await show(<Connected source={source} />);
    expect(failing.textContent).toContain("Couldn't load runs");
    expect(failing.textContent).toContain("The engine isn't answering.");
    failWith(undefined);
    await act(async () => buttonNamed(failing, "Try again")?.click());
    expect(failing.textContent).toContain("01done");
  });

  it("starts the skeleton and Still loading timers over when Try again is pressed while still waiting", async () => {
    const { source } = memoryRuns([finished]);
    let reads = 0;
    const hanging: RunsSource = {
      ...source,
      list: () => {
        reads += 1;
        return new Promise(() => {});
      },
    };
    const page = await show(<Connected source={hanging} />);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");

    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(reads).toBe(2);
    expect(page.textContent).not.toContain("Still loading");
    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading runs");
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
  });

  it("docks the card with the status, the receipt and Open the run log, and Esc closes it", async () => {
    const openRun = vi.fn();
    const page = await show(<Connected source={memoryRuns([finished]).source} openRun={openRun} />);

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());
    const card = page.querySelector("aside");
    expect(card?.getAttribute("aria-label")).toBe("Run 01done");
    expect(card?.textContent).toContain("Done");
    expect(card?.textContent).toContain("Finished in");
    await act(async () => buttonNamed(card as HTMLElement, runsWords.openLog)?.click());
    expect(openRun).toHaveBeenCalledWith("run_a_01done");

    await act(async () => {
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(page.querySelector("aside")).toBeNull();
  });
});

verifies("workflows.runs.card-receipt", () => {
  it("shows the receipt's summary line on the card", async () => {
    const page = await show(<Connected source={memoryRuns([finished]).source} />);

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());

    expect(page.querySelector("aside section[aria-labelledby=run-receipt] p")?.textContent).toMatch(
      /^Finished in /,
    );
  });

  it("says the log can't be read, with Try again that reads it again, and keeps the header and Open the run log", async () => {
    const { source } = memoryRuns([finished]);
    let reads = 0;
    const flaky: RunsSource = {
      ...source,
      log: async () => {
        reads += 1;
        if (reads === 1) throw new Error("x");
        return [];
      },
    };
    const page = await show(<Connected source={flaky} openRun={vi.fn()} />);

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());

    const card = page.querySelector("aside") as HTMLElement;
    expect(card.textContent).toContain("Couldn't load run 01done");
    expect(card.textContent).not.toContain("Couldn't read this run's log");
    expect(card.textContent).toContain("Done");
    expect(card.querySelector('[aria-label="Close run"]')).not.toBeNull();
    expect(buttonNamed(card, runsWords.openLog)).toBeDefined();
    await act(async () => buttonNamed(card, "Try again")?.click());
    expect(card.textContent).not.toContain("Couldn't load run");
    expect(card.querySelector("section[aria-labelledby=run-receipt]")).not.toBeNull();
    expect(buttonNamed(card, runsWords.openLog)).toBeDefined();
  });

  it("shows a skeleton named Loading run 01done, and no chip, while the log is read", async () => {
    const { source } = memoryRuns([finished]);
    const slow: RunsSource = { ...source, log: () => new Promise(() => undefined) };
    const page = await show(<Connected source={slow} />);

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());

    const card = page.querySelector("aside") as HTMLElement;
    expect(card.querySelector("[role=status]")?.textContent).toBe("Loading run 01done");
    expect(card.querySelector("h2")?.textContent).toBe("01done");
    expect(card.textContent).not.toContain("Done");
  });

  it("shows the banner of a run that waits for you, and Review in Inbox opens the Inbox", async () => {
    const waiting = runSummary({
      id: "run_a_01wait1",
      approvals: [
        {
          agent: "reporter",
          tool: "gmail_send",
          args: {},
          callId: "call-1",
          at: new Date(2026, 10, 9, 10, 41).toISOString(),
          state: "send",
          branch: null,
          item: null,
        },
      ],
    });
    const reviewInInbox = vi.fn();
    const page = await show(
      <Connected source={memoryRuns([waiting]).source} reviewInInbox={reviewInInbox} />,
    );

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());

    const card = page.querySelector("aside") as HTMLElement;
    expect(card.querySelector('section[aria-label="Waiting for you"]')).not.toBeNull();
    await act(async () => buttonNamed(card, "Review in Inbox")?.click());
    expect(reviewInInbox).toHaveBeenCalledOnce();
  });

  it("shows Every step under the receipt, with Show the run log in it", async () => {
    const { source } = memoryRuns([finished]);
    const at = finished.startedAt;
    const withLog: RunsSource = {
      ...source,
      log: async () => [
        {
          type: "run.started",
          hubId: "acme",
          workflowId: "reply",
          input: {},
          kind: "run",
          definitionsVersion: "v1",
          runId: finished.id,
          seq: 1,
          at,
        },
        { type: "state.entered", state: "draft", runId: finished.id, seq: 2, at },
      ],
    };
    const page = await show(<Connected source={withLog} openRun={vi.fn()} />);

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());

    const card = page.querySelector("aside") as HTMLElement;
    const heading = [...card.querySelectorAll("h2")].find(
      (one) => one.textContent === "Every step",
    );
    const section = heading?.closest("section") as HTMLElement;
    expect(section).not.toBeNull();
    expect(buttonNamed(section, "Show the run log")).toBeDefined();
    expect(buttonNamed(card, "Open the run log")).toBeDefined();
    expect(buttonNamed(card, "Show the run log")?.closest("section")).toBe(section);
  });
});
