// @vitest-environment jsdom
import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
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
  [2, entered("install")],
  [2, refused("registry.npmjs.org", 1)],
  [2, refused("registry.npmjs.org", 12)],
  [2, refused("objects.githubusercontent.com", 1)],
  [3, entered("check")],
  [3, { type: "workflow.started", state: "check", workflow: "verify", childRunId: `${runId}.13` }],
]);

/** A `sandbox.blocked` event of step Install; `count` is the site's running total. */
function refused(host: string, count: number): RunEventBody {
  return {
    type: "sandbox.blocked",
    state: "install",
    agent: "writer",
    block: { kind: "network", host, port: 443 },
    count,
  };
}

async function openRun(openOther?: (runId: string) => void) {
  const list = new RunsList(
    fakeSource([summaryWith({ id: runId, lastSeq: log.length })], { [runId]: log }).source,
  );
  const root = render(
    <RunView
      list={list}
      runId={runId}
      now={() => mondayMorning}
      {...(openOther === undefined ? {} : { openRun: openOther })}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

/** The focusable cell of the timeline's `index`th entry. */
/** The `index`th step's cell; the "Blocked 2 sites" rows under a step aren't steps. */
function entry(root: HTMLElement, index: number): HTMLElement {
  const steps = [...root.querySelectorAll('[role="grid"] tbody tr')].filter(
    (row) => !/^Blocked \d+ sites?/.test(row.textContent ?? ""),
  );
  const row = steps[index];
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

verifies("runs.run-view.blocked-sites", () => {
  it("names the sites a step's sandbox refused at the top of its panel, once each with its tries", async () => {
    const root = await openRun();
    act(() => entry(root, 2).click());

    const blocked = root.querySelector("aside section");
    expect(blocked?.querySelector("h3")?.textContent).toBe("Blocked sites");
    const rows = [...(blocked?.querySelectorAll("li") ?? [])].map((row) => row.textContent);
    expect(rows).toEqual(["registry.npmjs.org, 12 tries", "objects.githubusercontent.com, 1 try"]);
    expect(blocked?.textContent).toContain(
      "These sites aren't in Writer's allowed sites. To allow one, add it to Writer's allowed sites.",
    );
  });

  it("has no action and never says no connection was made, until the panel can know both", async () => {
    const root = await openRun();
    act(() => entry(root, 2).click());

    const blocked = root.querySelector("aside section");
    expect(blocked?.querySelector("button, a")).toBeNull();
    expect(blocked?.textContent).not.toContain("your computer");
    expect(blocked?.textContent).not.toContain("No connection was made.");
  });

  it("has no Blocked sites part for a step whose sandbox refused nothing", async () => {
    const root = await openRun();
    act(() => entry(root, 1).click());

    expect(root.querySelector("aside")?.textContent).not.toContain("Blocked sites");
  });
});

verifies("runs.run-view.blocked-sites", () => {
  it("draws a Blocked line under the refused step, and its row opens that step's entry", async () => {
    const root = await openRun();
    const rows = [...root.querySelectorAll('[role="grid"] tbody tr')];
    const blocked = rows.find((row) => /^Blocked 2 sites/.test(row.textContent ?? ""));
    expect(blocked).toBeDefined();
    expect(blocked?.querySelector("svg")).not.toBeNull();
    const before = rows.indexOf(blocked as Element) - 1;
    expect(rows[before]?.textContent).toContain("Install");

    act(() => blocked?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
    expect(root.querySelector("aside")?.textContent).toContain("registry.npmjs.org");
  });
});

verifies("runs.run-view.blocked-sites", () => {
  it("names the refused sites in the failed banner and opens the failed step with See the step", async () => {
    const failedLog = logOf(runId, [
      [0, entered("install")],
      [0, refused("registry.npmjs.org", 12)],
      [0, refused("objects.githubusercontent.com", 1)],
      [1, { type: "run.failed", error: "fetch failed" } as RunEventBody],
    ]);
    const failed = summaryWith({
      id: runId,
      status: "failed",
      endedAt: new Date(mondayMorning.getTime() + 60_000).toISOString(),
      error: "fetch failed",
      lastSeq: failedLog.length,
      state: null,
      statesVisited: ["install"],
    });
    const list = new RunsList(fakeSource([failed], { [runId]: failedLog }).source);
    const root = render(<RunView list={list} runId={runId} now={() => mondayMorning} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const banner = root.querySelector('section[aria-label="Run failed"]');
    expect(banner?.textContent).toContain(
      "The sandbox stopped Writer from reaching 2 sites that aren't in its allowed sites, such as registry.npmjs.org.",
    );
    expect(banner?.textContent).not.toContain("can't tell the cause yet");
    const see = [...(banner?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "See the step",
    );
    act(() => see?.click());
    expect(root.querySelector("aside")?.textContent).toContain("registry.npmjs.org");
  });
});

verifies("runs.run-view.child-runs", () => {
  it("names the child run a step started, and its button opens that run", async () => {
    const openOther = vi.fn();
    const root = await openRun(openOther);
    act(() => entry(root, 3).click());

    // The fake source names every workflow Support reply.
    const child = root.querySelector("aside li");
    expect(child?.textContent).toBe("Started Support reply→Run m9p.13");
    act(() => child?.querySelector("button")?.click());
    expect(openOther).toHaveBeenCalledWith(`${runId}.13`);
    expect(root.querySelector("aside")?.textContent).not.toContain("made no model or tool calls");
  });

  it("names the child run without a button where the page can't open another run", async () => {
    const root = await openRun();
    act(() => entry(root, 3).click());

    expect(root.querySelector("aside li")?.textContent).toBe("Started Support reply→Run m9p.13");
    expect(root.querySelector("aside li button")).toBeNull();
  });
});
