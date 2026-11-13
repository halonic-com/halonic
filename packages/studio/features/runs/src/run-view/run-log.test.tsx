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
  [
    1,
    {
      type: "sandbox.blocked",
      state: "read",
      agent: "writer",
      block: { kind: "network", host: "registry.npmjs.org", port: 443 },
      count: 12,
    },
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

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}".`);
  return found;
}

verifies("runs.run-view.run-log", () => {
  it("shows Every step first, and the run log only after Show the run log", async () => {
    const root = await openRun();

    expect(root.querySelector('[aria-label="Run log"]')).toBeNull();
    expect(root.querySelector('[role="grid"]')).not.toBeNull();

    await act(async () => button(root, "Show the run log").click());

    expect(root.querySelector('[role="grid"]')).toBeNull();
    expect(root.querySelectorAll("h2")[1]?.textContent).toBe("Every step");
    const lines = [...root.querySelectorAll('[aria-label="Run log"] > li')].map(
      (line) => line.textContent,
    );
    expect(lines[0]).toMatch(/^110:40:00 run\.started \{"hubId":"acme"/);
    expect(lines[1]).toBe('210:40:00 state.entered {"state":"read"}');
    expect(lines[2]).toBe("Blocked: registry.npmjs.org (12 tries)");
    expect(lines).toHaveLength(3);
  });

  it("brings the timeline back with Show every step", async () => {
    const root = await openRun();
    await act(async () => button(root, "Show the run log").click());
    await act(async () => button(root, "Show every step").click());

    expect(root.querySelector('[aria-label="Run log"]')).toBeNull();
    expect(root.querySelector('[role="grid"]')).not.toBeNull();
  });
});
