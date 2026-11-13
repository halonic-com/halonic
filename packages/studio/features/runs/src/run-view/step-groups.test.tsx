// @vitest-environment jsdom
import type { RunEventBody } from "@halonicjs/events";
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
const begin: RunEventBody = { type: "agent.started", state: "fan", agent: "writer", prompt: "Go" };
const ended: RunEventBody = { type: "agent.finished", state: "fan", agent: "writer", output: null };
const log = logOf(runId, [
  [0, entered("fan")],
  [0, { ...begin, branch: "summarise" } as RunEventBody],
  [1, { ...ended, branch: "summarise" } as RunEventBody],
]);

verifies("runs.run-view.step-groups", () => {
  it("draws a branch as a row right under its step, read with its state first", async () => {
    const fake = fakeSource([summaryWith({ id: runId, lastSeq: log.length })], { [runId]: log });
    const root = render(
      <RunView list={new RunsList(fake.source)} runId={runId} now={() => mondayMorning} />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const grid = root.querySelector('[role="grid"][aria-labelledby]');
    const heard = [...(grid?.querySelectorAll(".sr-only") ?? [])].map((part) => part.textContent);
    expect(heard).toEqual([
      "Fan, running, 10:40, Running",
      "Branch summarise, in the step Fan, done, 10:40, Took 1 min",
    ]);
  });
});
