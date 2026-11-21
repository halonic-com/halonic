import type { RunSummary } from "@halonicjs/events";
import type { ProviderCheck } from "@halonicjs/studio-feature-models/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  agentStepDone,
  type DefaultProviderFiles,
  modelStep,
  ownCardVisit,
  readDefaultProvider,
  runStepDone,
} from "./own-progress.ts";

const TEST_MODEL = "id: mock\nname: Test model\ntype: mock\nlocal: true\n";
const ACME_CLOUD = "id: acme-cloud\nname: Acme Cloud\ntype: anthropic\nsecret: ACME_CLOUD_KEY\n";
const OLLAMA = "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n";

/** An invented workspace: `default` on `provider`, with the given provider files. */
function files(
  provider: string,
  providers: Record<string, string>,
  localOnly = false,
): DefaultProviderFiles {
  return {
    readModels: async () => `aliases:\n  default:\n    provider: ${provider}\n    model: m1\n`,
    readProviders: async () =>
      Object.entries(providers).map(([id, text]) => ({ path: `providers/${id}.yaml`, text })),
    readWorkspace: async () =>
      `version: 1\nid: acme\nname: Acme\nprivacy:\n  localOnly: ${localOnly}\n`,
  };
}

/** A provider check where only the providers named in `answering` answer. */
function check(...answering: string[]): ProviderCheck {
  return {
    addressOf: () => "localhost:11434",
    isAnswering: async ({ type }) => answering.includes(type),
  };
}

const savedKeys = (...names: string[]) => ({
  stored: async (name: string) => names.includes(name),
});

async function step1(workspace: DefaultProviderFiles, probes: Parameters<typeof modelStep>[1]) {
  return modelStep(await readDefaultProvider(workspace), probes);
}

verifies("first-run.own-progress", () => {
  describe("step 1, Connect your own model", () => {
    it("never counts the test model, whatever answers or is saved", async () => {
      const workspace = files("mock", { mock: TEST_MODEL });
      expect(await readDefaultProvider(workspace)).toEqual({ kind: "test" });
      expect(
        await step1(workspace, { keys: savedKeys("ACME_CLOUD_KEY"), check: check("mock") }),
      ).toEqual({
        status: "todo",
      });
    });

    it("counts a cloud provider with a saved key when the workspace isn't local only", async () => {
      const workspace = files("acme-cloud", { "acme-cloud": ACME_CLOUD });
      expect(await step1(workspace, { keys: savedKeys("ACME_CLOUD_KEY") })).toEqual({
        status: "done",
      });
      expect(await step1(workspace, { keys: savedKeys() })).toEqual({ status: "todo" });
    });

    it("doesn't count a cloud provider with a saved key while the workspace is local only", async () => {
      const workspace = files("acme-cloud", { "acme-cloud": ACME_CLOUD }, true);
      expect(await step1(workspace, { keys: savedKeys("ACME_CLOUD_KEY") })).toEqual({
        status: "todo",
      });
    });

    it("counts a local provider that answers, also while the workspace is local only", async () => {
      const workspace = files("ollama", { ollama: OLLAMA }, true);
      expect(await step1(workspace, { check: check("ollama") })).toEqual({ status: "done" });
    });

    it("says where a local provider that doesn't answer was asked", async () => {
      const workspace = files("ollama", { ollama: OLLAMA });
      expect(await step1(workspace, { check: check() })).toEqual({
        status: "not-answering",
        address: "localhost:11434",
      });
      // Without a check nothing can tell it answers, so it isn't claimed done.
      expect(await step1(workspace, {})).toEqual({ status: "todo" });
    });

    it("reads a missing alias or provider file as no model", async () => {
      expect(await readDefaultProvider(files("ollama", {}))).toEqual({ kind: "none" });
      const noModels = { ...files("ollama", { ollama: OLLAMA }), readModels: async () => null };
      expect(await readDefaultProvider(noModels)).toEqual({ kind: "none" });
      const broken = files("ollama", { ollama: "type: [" });
      expect(await readDefaultProvider(broken)).toEqual({ kind: "none" });
    });

    it("fails, rather than reading as not done, when a file can't be read", async () => {
      const unreadable = {
        ...files("ollama", { ollama: OLLAMA }),
        readProviders: async () => Promise.reject(new Error("acme: permission denied")),
      };
      await expect(readDefaultProvider(unreadable)).rejects.toThrow("permission denied");
    });
  });

  describe("step 2, Make your first agent", () => {
    it("is done once the workspace has an agent", async () => {
      expect(await agentStepDone({ list: async () => [] })).toBe(false);
      const writer = { hubId: "default", id: "writer" } as never;
      expect(await agentStepDone({ list: async () => [writer] })).toBe(true);
    });
  });

  describe("step 3, Run it once", () => {
    const run = (kind: RunSummary["kind"], status: RunSummary["status"]) => ({ kind, status });

    it("is done once any run in the workspace finished, not a test or a failed run", () => {
      expect(
        runStepDone([run("run", "failed"), run("test", "completed"), run("run", "cant-try")]),
      ).toBe(false);
      expect(runStepDone([run("run", "failed"), run("run", "completed")])).toBe(true);
    });
  });

  describe("when the card shows", () => {
    it("never shows a finished card to a folder that had everything done the first time", () => {
      expect(ownCardVisit("unseen", true)).toEqual({ shows: false, remember: "finished" });
      expect(ownCardVisit("finished", false)).toEqual({ shows: false, remember: "finished" });
    });

    it("shows while steps are left, and for the visit in which it finishes", () => {
      expect(ownCardVisit("unseen", false)).toEqual({ shows: true, remember: "showing" });
      expect(ownCardVisit("showing", false)).toEqual({ shows: true, remember: "showing" });
      expect(ownCardVisit("showing", true)).toEqual({ shows: true, remember: "finished" });
    });
  });
});
