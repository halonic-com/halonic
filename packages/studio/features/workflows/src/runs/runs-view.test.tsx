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

verifies("workflows.runs", () => {
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

  it("docks the simple card with the status, the line and Open the run log, and Esc closes it", async () => {
    const openRun = vi.fn();
    const page = await show(<Connected source={memoryRuns([finished]).source} openRun={openRun} />);

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());
    const card = page.querySelector("aside");
    expect(card?.getAttribute("aria-label")).toBe("Run 01done");
    expect(card?.textContent).toContain("Done");
    expect(card?.textContent).toContain("read → draft");
    await act(async () => buttonNamed(card as HTMLElement, runsWords.openLog)?.click());
    expect(openRun).toHaveBeenCalledWith("run_a_01done");

    await act(async () => {
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(page.querySelector("aside")).toBeNull();
  });
});
