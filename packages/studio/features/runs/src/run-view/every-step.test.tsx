// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const runId = "run_a_7k2m9p";
const drafting = logOf(runId, [
  [0, entered("read")],
  [1, entered("draft")],
]);
const reviewing = [...drafting, ...logOf(runId, [[2, entered("review")]]).slice(1)].map(
  (event, index) => ({ ...event, seq: index + 1 }),
);
const running = summaryWith({ id: runId, lastSeq: drafting.length });

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openRun(fake: ReturnType<typeof fakeSource>) {
  const list = new RunsList(fake.source);
  const root = render(<RunView list={list} runId={runId} now={() => mondayMorning} />);
  await settled();
  return { root, list };
}

/** What a screen reader hears for each timeline entry. */
function entries(root: HTMLElement): string[] {
  const grid = root.querySelector('[role="grid"][aria-labelledby]');
  return [...(grid?.querySelectorAll(".sr-only") ?? [])].map((part) => part.textContent ?? "");
}

verifies("runs.every-step", () => {
  it("lists the steps under the h2 Every step, each with its dot, in one List", async () => {
    const { root } = await openRun(fakeSource([running], { [runId]: drafting }));

    expect(root.querySelectorAll("h2")[1]?.textContent).toBe("Every step");
    expect(root.querySelectorAll('[role="grid"]')).toHaveLength(1);
    expect(entries(root)).toEqual([
      "Read, done, 10:40, Took 1 min",
      "Draft, running, 10:41, Running",
    ]);
    // The List draws a row's icon in its wide and its stacked layout, so each row is read once.
    const marks = [...root.querySelectorAll('[role="grid"] tbody tr')].map((row) =>
      row.querySelector("[data-mark]")?.getAttribute("data-mark"),
    );
    expect(marks).toEqual(["done", "running"]);
  });

  it("shows no Every step until the run's log has loaded", async () => {
    const { root } = await openRun(fakeSource([running]));

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.textContent).not.toContain("Every step");
  });

  it("reads the log again as the run moves on, and keeps the steps when a read fails", async () => {
    const fake = fakeSource([running], { [runId]: drafting });
    const { root, list } = await openRun(fake);

    fake.change([{ ...running, lastSeq: reviewing.length, updatedAt: minutesLater(2) }], {
      [runId]: reviewing,
    });
    await settled();
    expect(entries(root).at(-1)).toBe("Review, running, 10:42, Running");

    fake.fail(new Error("no answer"));
    await act(async () => list.refresh());
    expect(entries(root)).toHaveLength(3);
  });

  it("reads the log again on Retry after the first read failed, and keeps the steps when a later read fails", async () => {
    const fake = fakeSource([running], { [runId]: drafting });
    fake.failLog(new Error("no answer"));
    const { root, list } = await openRun(fake);
    expect(root.textContent).not.toContain("Every step");

    fake.answer();
    await act(async () => list.refresh());
    await settled();
    expect(entries(root)).toHaveLength(2);

    fake.failLog(new Error("no answer"));
    fake.change([{ ...running, lastSeq: reviewing.length, updatedAt: minutesLater(2) }], {
      [runId]: reviewing,
    });
    await settled();
    await act(async () => list.refresh());
    await settled();
    expect(entries(root)).toHaveLength(2);
  });
});
