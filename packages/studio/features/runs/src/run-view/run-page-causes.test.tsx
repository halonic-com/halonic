// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
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

const modelCall = {
  type: "llm.request",
  agent: "reporter",
  provider: "ollama",
  model: "llama3.1:70b",
  messages: 1,
} as const;

async function settled(milliseconds = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
}

async function openOn(presentation: "desktop" | "phone", run: ReturnType<typeof summaryWith>) {
  const log = logOf(run.id, [
    [0, entered("draft")],
    [0, modelCall],
  ]);
  const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
  const root = render(
    <PresentationProvider presentation={presentation}>
      <RunView list={list} runId={run.id} now={() => mondayMorning} />
    </PresentationProvider>,
  );
  await settled();
  return root;
}

verifies("runs.run-view.failure-banners", () => {
  const outOfMemory = summaryWith({
    id: "run_a_7k2m9p",
    status: "failed",
    reason: "model-out-of-memory",
    state: "draft",
    endedAt: mondayMorning.toISOString(),
  });

  it("fixes it in Models on a computer", async () => {
    const root = await openOn("desktop", outOfMemory);
    expect(root.textContent).toContain("Close other programs, or pick a smaller model in Models.");
    expect(root.textContent).not.toContain("Fix this on your computer");
  });

  it("tells a phone to fix it on the computer, because the page passes it that it is one", async () => {
    const root = await openOn("phone", outOfMemory);
    expect(root.textContent).toContain("Close other programs, or pick a smaller model.");
    expect(root.textContent).toContain("Fix this on your computer: Models");
  });
});

verifies("runs.run-view.slow-step-line", () => {
  it("draws the line when the step turns 10 seconds quiet, without a new event", async () => {
    const run = summaryWith({ id: "run_b_01jd8q", state: "draft", statesVisited: ["draft"] });
    const log = logOf(run.id, [
      [0, entered("draft")],
      [0, modelCall],
    ]);
    const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
    let clock = mondayMorning.getTime() + 9_950;
    const root = render(<RunView list={list} runId={run.id} now={() => new Date(clock)} />);
    await settled();
    expect(root.textContent).not.toContain("Waiting for Ollama to answer.");
    clock = mondayMorning.getTime() + 10_000;
    await settled(120);
    expect(root.textContent).toContain("Waiting for Ollama to answer.");
  });
});
