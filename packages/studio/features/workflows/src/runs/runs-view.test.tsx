// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
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
  reviewInInbox?: (runId: string) => void;
}) {
  const { load, retry } = useRuns(props.source);
  const [picked, setPicked] = useState<string | undefined>();
  return (
    <RunsView
      {...props}
      load={load}
      retry={retry}
      workflow={reply}
      picked={picked}
      onPick={setPicked}
    />
  );
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

    failWith(new KindedError("unavailable", "The engine isn't answering."));
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

  it("keeps the 24 px inset itself, empty or with runs, as the tab panel around it has none", async () => {
    const empty = await show(<Connected source={memoryRuns().source} />);
    expect(empty.querySelector("p")?.parentElement?.className).toContain("p-6");
    unmount();

    const page = await show(<Connected source={memoryRuns([finished]).source} />);
    expect(page.querySelector("section")?.closest(".p-6")).not.toBeNull();
    // Pulled out by a negative margin, it would sit on the panel's edge and scroll sideways.
    expect(page.querySelector("[class*='-m-']")).toBeNull();
  });

  it("gives a run's card the whole tab on a phone, and shows the list again with its row focused on close", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        <Connected source={memoryRuns([finished]).source} />
      </PresentationProvider>,
    );
    const list = () => page.querySelector<HTMLElement>("[data-testid=runs-inset]");
    const row = page.querySelector<HTMLButtonElement>("li button");

    await act(async () => row?.click());
    expect(page.querySelector("aside")).not.toBeNull();
    expect(list()?.className).toBe("hidden");

    await act(async () => {
      page
        .querySelector("aside")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(list()?.className).not.toContain("hidden");
    expect(document.activeElement).toBe(row);
  });

  // jsdom lays nothing out, so this checks the container query's class (DW1, WCAG 1.4.10).
  it("hides the list under 800 px beside a run's card on a desktop, and keeps it otherwise", async () => {
    const page = await show(<Connected source={memoryRuns([finished]).source} />);
    const list = () =>
      page.querySelector<HTMLElement>("[data-testid=runs-inset]")?.className.split(" ") ?? [];
    expect(list()).not.toContain("@max-[800px]:hidden");

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());
    expect(page.querySelector("aside")?.className.split(" ")).toContain("@max-[800px]:w-full");
    expect(list()).toContain("@max-[800px]:hidden");
    expect(list()).not.toContain("hidden");
  });

  it("outlines the open run's row in high contrast, where its soft fill doesn't show", async () => {
    const page = await show(<Connected source={memoryRuns([finished]).source} />);
    const row = page.querySelector("li");
    expect(row?.className).not.toContain("selected-forced");

    await act(async () => row?.querySelector("button")?.click());
    expect(row?.className).toContain("selected-forced");
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
        if (reads === 1) throw new KindedError("unavailable", "x");
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

  it("shows the banner of a run that waits for you, and Review in Inbox opens the Inbox on that run", async () => {
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
    expect(reviewInInbox).toHaveBeenCalledExactlyOnceWith("run_a_01wait1");
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
