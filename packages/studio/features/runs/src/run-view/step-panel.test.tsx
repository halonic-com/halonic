// @vitest-environment jsdom
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
const log = logOf(runId, [
  [0, entered("read")],
  [1, entered("draft")],
  [
    1,
    {
      type: "llm.response",
      agent: "writer",
      provider: "anthropic",
      model: "claude-sonnet",
      usage: { inputTokens: 1204, outputTokens: 312 },
      latencyMs: 900,
      text: "",
    },
  ],
  [
    1,
    { type: "tool.called", agent: "writer", tool: "send_email", args: { to: "sam@acme.example" } },
  ],
]);

async function openRun() {
  const list = new RunsList(
    fakeSource([summaryWith({ id: runId, lastSeq: log.length })], { [runId]: log }).source,
  );
  const root = render(<RunView list={list} runId={runId} now={() => mondayMorning} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

/** The focusable cell of the timeline's `index`th entry. */
function entry(root: HTMLElement, index: number): HTMLElement {
  const row = root.querySelectorAll('[role="grid"] tbody tr')[index];
  const cell = row?.querySelector<HTMLElement>('[role="gridcell"]');
  if (cell == null) throw new Error(`No entry ${index}.`);
  return cell;
}

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

verifies("runs.run-view.step-events", () => {
  it("opens an entry's model and tool calls in the side panel with Enter", async () => {
    const root = await openRun();
    act(() => entry(root, 1).focus());
    press(entry(root, 1), "Enter");

    const panel = root.querySelector("aside");
    expect(panel?.querySelector("h2")?.textContent).toBe("Draft");
    expect(document.activeElement).toBe(panel?.querySelector("h2"));
    expect(panel?.textContent).toContain("Model callsclaude-sonnet1,204 in · 312 out");
    const tool = panel?.querySelector("details");
    expect(tool?.querySelector("summary")?.textContent).toContain("send_email");
    expect(tool?.open).toBe(false);
    expect(entry(root, 1).closest("tr")?.getAttribute("aria-current")).toBe("true");
  });

  it("says so for a step without calls", async () => {
    const root = await openRun();
    act(() => entry(root, 0).click());

    expect(root.querySelector("aside")?.textContent).toContain(
      "This step made no model or tool calls.",
    );
  });

  it("closes with Escape and gives focus back to the entry", async () => {
    const root = await openRun();
    act(() => entry(root, 1).focus());
    press(entry(root, 1), "Enter");
    press(root.querySelector("aside h2") as Element, "Escape");

    expect(root.querySelector("aside")).toBeNull();
    expect(document.activeElement).toBe(entry(root, 1));
    expect(entry(root, 1).closest("tr")?.hasAttribute("aria-current")).toBe(false);
  });

  it("closes with ✕, named by the step", async () => {
    const root = await openRun();
    act(() => entry(root, 1).click());
    act(() => (root.querySelector('[aria-label="Close Draft"]') as HTMLElement).click());

    expect(root.querySelector("aside")).toBeNull();
  });
});
