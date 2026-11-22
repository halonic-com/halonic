// @vitest-environment jsdom
import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { RunsSource } from "../api.ts";
import { type SampleCandidate, sampleReadsAtOnce, useSampleRuns } from "./run-model-path.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

const call = (provider: string) => ({ type: "llm.request", provider }) as unknown as RunEvent;
const ended = { type: "run.completed" } as unknown as RunEvent;

/** A source whose logs a test sets, counting the reads in flight and the most at once. */
function sourceWith(logs: Record<string, RunEvent[]>) {
  const reads = { inFlight: 0, most: 0, waiting: [] as (() => void)[] };
  const source = {
    log: (runId: string) =>
      new Promise<RunEvent[]>((resolve) => {
        reads.inFlight += 1;
        reads.most = Math.max(reads.most, reads.inFlight);
        reads.waiting.push(() => {
          reads.inFlight -= 1;
          resolve(logs[runId] ?? []);
        });
      }),
    providerKind: () => "local",
    isTestModel: (id: string) => id === "mock",
  } as unknown as RunsSource;
  /** Lets every read waiting now finish, and the reads they start after them. */
  const finishAll = async () => {
    while (reads.waiting.length > 0) {
      await act(async () => {
        for (const finish of reads.waiting.splice(0)) finish();
      });
    }
  };
  return { source, reads, finishAll };
}

/** Renders the hook and returns the ids it found, as text; `rerender` gives it new runs. */
function renderHook(source: RunsSource, runs: readonly SampleCandidate[]) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  function Probe({ candidates }: { readonly candidates: readonly SampleCandidate[] }) {
    return <span>{[...useSampleRuns(source, candidates)].join(" ")}</span>;
  }
  act(() => root.render(<Probe candidates={runs} />));
  return {
    found: () => container.textContent ?? "",
    rerender: (next: readonly SampleCandidate[]) =>
      act(() => root.render(<Probe candidates={next} />)),
  };
}

verifies("runs.sample-chip", () => {
  it("reads a long list's logs a few at a time, and finds the runs on Sample answers", async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `run_${index}`);
    const logs = Object.fromEntries(
      ids.map((id, index) => [id, [call(index % 2 === 0 ? "mock" : "ollama"), ended]]),
    );
    const { source, reads, finishAll } = sourceWith(logs);
    const hook = renderHook(
      source,
      ids.map((id) => ({ id, standing: "done" })),
    );
    expect(reads.inFlight).toBe(sampleReadsAtOnce);
    await finishAll();
    expect(reads.most).toBe(sampleReadsAtOnce);
    expect(hook.found()).toBe("run_0 run_2 run_4 run_6 run_8");
  });

  it("reads a run again when its standing changes, so a run that went on to a real model loses the chip", async () => {
    const logs: Record<string, RunEvent[]> = { run_1: [call("mock")] };
    const { source, finishAll } = sourceWith(logs);
    const hook = renderHook(source, [{ id: "run_1", standing: "needs-you" }]);
    await finishAll();
    expect(hook.found()).toBe("run_1");
    logs["run_1"] = [call("mock"), call("anthropic"), ended];
    hook.rerender([{ id: "run_1", standing: "done" }]);
    await finishAll();
    expect(hook.found()).toBe("");
  });
});
