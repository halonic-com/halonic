// @vitest-environment jsdom
import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const runId = "run_a_7k2m9p";
const temperature = "Left out temperature: claude-sonnet-5-5 doesn't take it.";
const topP = "Left out top_p: claude-sonnet-5-5 doesn't take it.";

const answered = (notes?: string[]): RunEventBody => ({
  type: "llm.response",
  agent: "writer",
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  usage: { inputTokens: 1200, outputTokens: 300 },
  latencyMs: 900,
  text: "",
  ...(notes === undefined ? {} : { notes }),
});

/** A run whose writer called the model three times, each call with the same note. */
const noted = logOf(runId, [
  [0, entered("draft")],
  [1, answered([temperature])],
  [2, answered([temperature, topP])],
  [3, answered([temperature])],
]);

async function openRun(log: readonly RunEvent[]) {
  const list = new RunsList(
    fakeSource([summaryWith({ id: runId, lastSeq: log.length })], { [runId]: [...log] }).source,
  );
  const root = render(<RunView list={list} runId={runId} now={() => mondayMorning} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

function notesList(root: HTMLElement): HTMLUListElement | null {
  return root.querySelector('ul[aria-label="Notes on this run"]');
}

function shownNotes(root: HTMLElement): string[] {
  return [...(notesList(root)?.querySelectorAll("li") ?? [])].map((item) => item.textContent ?? "");
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}".`);
  return found;
}

/** Whether `first` comes before `second` in the page. */
function before(first: Node, second: Node): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

verifies("runs.run-view.provider-notes", () => {
  it("shows each note once, in first-seen order, after the steps and before Show the run log", async () => {
    const root = await openRun(noted);

    expect(shownNotes(root)).toEqual([temperature, topP]);
    const list = notesList(root) as HTMLUListElement;
    const timeline = root.querySelector('[role="grid"]') as HTMLElement;
    expect(before(timeline, list)).toBe(true);
    expect(before(list, button(root, "Show the run log"))).toBe(true);
  });

  it("keeps the notes under the run log when it's shown", async () => {
    const root = await openRun(noted);

    await act(async () => button(root, "Show the run log").click());
    expect(shownNotes(root)).toEqual([temperature, topP]);
    const runLog = root.querySelector('[aria-label="Run log"]') as HTMLElement;
    expect(before(runLog, notesList(root) as HTMLUListElement)).toBe(true);
  });

  it("shows no notes for a run without them", async () => {
    const root = await openRun(
      logOf(runId, [
        [0, entered("draft")],
        [1, answered()],
      ]),
    );

    expect(root.textContent).toContain("Every step");
    expect(notesList(root)).toBeNull();
  });

  it("writes a hidden character in a note as its escape", async () => {
    const root = await openRun(
      logOf(runId, [
        [0, entered("draft")],
        [1, answered([`Left out ${String.fromCodePoint(0x202e)}top_k.`])],
      ]),
    );

    expect(shownNotes(root)).toEqual(["Left out \\u202etop_k."]);
  });
});
