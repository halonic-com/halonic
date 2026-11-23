import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { ranOnTestModel, testModelsOf } from "./sample-answers.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** Acme, with the test model under two ids, and a provider called `mock` that is Ollama. */
async function acme(): Promise<LoadedWorkspace> {
  return loadWorkspace(
    new TestDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "providers/scripted.yaml": "id: scripted\ntype: mock\n",
      "providers/sample.yaml": "id: sample\ntype: mock\n",
      "providers/mock.yaml": "id: mock\ntype: ollama\n",
      "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-api-key\n",
    }),
  );
}

/** A log of Acme's Support reply whose drafter called each of `providers`, in order. */
function callingLog(providers: readonly string[]): RunEvent[] {
  const bodies: RunEventBody[] = [
    { type: "state.entered", state: "draft" },
    ...providers.map(
      (provider): RunEventBody => ({
        type: "llm.request",
        agent: "drafter",
        provider,
        model: "a-model",
        messages: 1,
      }),
    ),
  ];
  return bodies.map((body, index) => ({
    ...body,
    runId: "run_mfx3k2a1_01jd8q",
    seq: index + 1,
    at: "2026-11-10T14:00:00.000Z",
  }));
}

async function onTestModel(providers: readonly string[]): Promise<boolean> {
  const testModels = testModelsOf(await acme());
  return ranOnTestModel(callingLog(providers), (providerId) => testModels.has(providerId));
}

verifies("runs.sample-chip", () => {
  it("knows the test model by its file's type, not its id", async () => {
    expect(testModelsOf(await acme())).toEqual(new Set(["scripted", "sample"]));
  });

  it("is on the test model when every call went to one, whatever its id", async () => {
    expect(await onTestModel(["scripted"])).toBe(true);
    expect(await onTestModel(["scripted", "sample"])).toBe(true);
  });
});

verifies("cli.sample-answers", () => {
  it("is not on the test model for a mixed run, no call, or a provider it doesn't know", async () => {
    expect(await onTestModel(["scripted", "claude"])).toBe(false);
    expect(await onTestModel(["mock"])).toBe(false);
    expect(await onTestModel([])).toBe(false);
    expect(await onTestModel(["gone"])).toBe(false);
  });
});
