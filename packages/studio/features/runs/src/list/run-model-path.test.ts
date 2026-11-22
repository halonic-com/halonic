import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { DamagedRunLog, type RunsSource } from "../api.ts";
import { entered, logOf } from "../run-view/run-log.test-helper.ts";
import { fakeSource } from "../source.test-helper.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { runModelPath } from "./run-model-path.ts";

const runId = "run_mfx3k2a1_01jd8q";
const call = (provider: string): RunEventBody => ({
  type: "llm.request",
  agent: "drafter",
  provider,
  model: "a-model",
  messages: 1,
});
const completed: RunEventBody = { type: "run.completed", state: "review", context: {} };

/** A source with one run of Support reply that called each of `providers`, ended or not. */
function sourceCalling(providers: readonly string[], ended = true) {
  const log = logOf(runId, [
    [0, entered("draft")],
    ...providers.map((provider) => [0, call(provider)] as const),
    ...(ended ? [[1, completed] as const] : []),
  ]);
  const fake = fakeSource([summaryWith({ id: runId })], { [runId]: log });
  const read = vi.spyOn(fake.source, "log");
  return { source: fake.source, read };
}

verifies("runs.sample-chip", () => {
  it("is sample when every call went to a test model, whatever its id", async () => {
    expect(await runModelPath(sourceCalling(["mock"]).source, runId)).toBe("sample");
    expect(await runModelPath(sourceCalling(["mock", "scripted"]).source, runId)).toBe("sample");
  });

  it("goes by the real calls when a run mixed the test model with a real one", async () => {
    expect(await runModelPath(sourceCalling(["mock", "claude"]).source, runId)).toBe("cloud");
    expect(await runModelPath(sourceCalling(["mock", "ollama"]).source, runId)).toBe("local");
    expect(await runModelPath(sourceCalling(["ollama", "claude"]).source, runId)).toBe("cloud");
  });

  it("has no path for a run without a model call", async () => {
    expect(await runModelPath(sourceCalling([]).source, runId)).toBeUndefined();
  });

  it("never says sample for a source that can't tell the test model", async () => {
    const { source } = sourceCalling(["mock"]);
    const { isTestModel: _left, ...without } = source;

    expect(await runModelPath(without, runId)).toBe("local");
  });

  it("keeps an ended run's answer for its source, and reads a waiting run again", async () => {
    const ended = sourceCalling(["mock"]);
    const waiting = sourceCalling(["mock"], false);
    const other = sourceCalling(["claude"]);

    await runModelPath(ended.source, runId);
    await runModelPath(ended.source, runId);
    await runModelPath(waiting.source, runId);
    await runModelPath(waiting.source, runId);

    expect(ended.read).toHaveBeenCalledTimes(1);
    expect(waiting.read).toHaveBeenCalledTimes(2);
    expect(await runModelPath(other.source, runId)).toBe("cloud");
  });

  it("doesn't keep an answer while a provider is unknown to the workspace", async () => {
    const { source, read } = sourceCalling(["gone"]);

    expect(await runModelPath(source, runId)).toBe("cloud");
    await runModelPath(source, runId);

    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads the calls before a damaged line, and rejects when the log can't be read", async () => {
    const damaged: RunsSource = {
      ...fakeSource([]).source,
      log: async () => {
        throw new DamagedRunLog(4, logOf(runId, [[0, call("mock")]]));
      },
    };
    const broken = fakeSource([]);
    broken.failLog(new Error("disk gone"));

    expect(await runModelPath(damaged, runId)).toBe("sample");
    await expect(runModelPath(broken.source, runId)).rejects.toThrow("disk gone");
  });
});
