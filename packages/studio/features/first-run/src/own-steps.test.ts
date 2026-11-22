import type { RunSummary } from "@halonicjs/events";
import type { AgentListing } from "@halonicjs/studio-feature-agents/api";
import type { ProviderCheck } from "@halonicjs/studio-feature-models/api";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnCardMemory } from "./api.ts";
import { CHECK_LIMIT_MS, OwnSteps, type OwnStepsSources } from "./own-steps.ts";

const TEST_MODEL = "id: mock\nname: Test model\ntype: mock\nlocal: true\n";
const OLLAMA = "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n";
const writer: AgentListing = { hubId: "default", id: "writer", name: "Writer" };
const finished = { summary: { kind: "run", status: "completed" } as RunSummary };

interface Acme {
  readonly provider?: string;
  /** The agents, or why they can't be read. */
  readonly agents?: readonly AgentListing[] | Error;
  readonly runs?: readonly { summary: RunSummary }[];
  readonly memory?: OwnCardMemory;
  readonly check?: ProviderCheck;
  /** Why the runs' first load failed; the list then has never loaded. */
  readonly runsError?: Error;
}

/** An invented workspace, Acme, with `default` on Ollama or the test model; `saved` collects what's remembered. */
function acme({
  provider = TEST_MODEL,
  agents = [],
  runs = [],
  memory = "unseen",
  check,
  runsError,
}: Acme) {
  const providerId = /^id: (\S+)/.exec(provider)?.[1] ?? "mock";
  const saved: OwnCardMemory[] = [];
  const runListeners = new Set<() => void>();
  const fileListeners = new Set<() => void>();
  const runsList = {
    state: { runs, loaded: runsError === undefined, error: runsError, workflows: undefined },
  };
  const sources: OwnStepsSources = {
    files: {
      readModels: async () => `aliases:\n  default:\n    provider: ${providerId}\n    model: m1\n`,
      readProviders: async () => [{ path: `providers/${providerId}.yaml`, text: provider }],
      readWorkspace: async () => null,
      subscribe: (listener) => {
        fileListeners.add(listener);
        return () => fileListeners.delete(listener);
      },
    },
    agents: {
      list: async () => {
        if (agents instanceof Error) throw agents;
        return agents;
      },
      subscribe: () => () => {},
    },
    runs: {
      get state() {
        return runsList.state as OwnStepsSources["runs"]["state"];
      },
      subscribe: (listener) => {
        runListeners.add(listener);
        return () => runListeners.delete(listener);
      },
    },
    check,
    memory: { ownCardMemory: () => memory, recordOwnCard: (next) => void saved.push(next) },
    now: () => new Date(0),
  };
  const finishRun = () => {
    runsList.state = { ...runsList.state, runs: [finished], loaded: true, error: undefined };
    for (const listener of runListeners) listener();
  };
  /** A file changes that leaves `default` where it was. */
  const touchFiles = () => {
    for (const listener of fileListeners) listener();
  };
  return { steps: new OwnSteps(sources), saved, finishRun, touchFiles };
}

/** Starts the steps and lets every read settle. */
async function started(steps: OwnSteps) {
  steps.start();
  await vi.waitFor(() => expect(steps.state.kind).not.toBe("loading"));
  return steps.state;
}

afterEach(() => vi.useRealTimers());

verifies("first-run.own-card", () => {
  describe("OwnSteps", () => {
    it("shows a new workspace with nothing done, and remembers it as showing", async () => {
      const { steps, saved } = acme({});
      expect(await started(steps)).toMatchObject({
        kind: "showing",
        model: { status: "todo" },
        agentDone: false,
        runDone: false,
      });
      expect(saved).toEqual(["showing"]);
    });

    it("stays for the visit in which all three get done, remembered as finished", async () => {
      const ollama = { addressOf: () => "localhost:11434", isAnswering: async () => true };
      const { steps, saved, finishRun } = acme({
        provider: OLLAMA,
        agents: [writer],
        check: ollama,
      });
      await started(steps);
      finishRun();
      expect(steps.state).toMatchObject({ kind: "showing", runDone: true, lastAgent: writer });
      expect(saved).toEqual(["showing", "finished"]);
    });

    it("waits for the check before a first visit with the rest done, so it never shows finished", async () => {
      const answer = Promise.withResolvers<boolean>();
      const slow = { addressOf: () => "localhost:11434", isAnswering: () => answer.promise };
      const { steps, saved } = acme({
        provider: OLLAMA,
        agents: [writer],
        runs: [finished],
        check: slow,
      });
      steps.start();
      await Promise.resolve();
      expect(steps.state.kind).toBe("loading");
      answer.resolve(true);
      await vi.waitFor(() => expect(steps.state.kind).toBe("hidden"));
      expect(saved).toEqual(["finished"]);
    });

    it("shows the check, then the problem when the provider hasn't answered after 5 seconds", async () => {
      vi.useFakeTimers();
      const silent = {
        addressOf: () => "localhost:11434",
        isAnswering: () => new Promise<boolean>(() => {}),
      };
      const { steps } = acme({ provider: OLLAMA, check: silent });
      steps.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(steps.state).toMatchObject({ model: { status: "checking" }, providerName: "Ollama" });
      await vi.advanceTimersByTimeAsync(CHECK_LIMIT_MS);
      expect(steps.state).toMatchObject({
        model: { status: "not-answering", address: "localhost:11434" },
      });
    });

    it("shows the check's answer when a file changes during it and `default` stays put", async () => {
      const answer = Promise.withResolvers<boolean>();
      const slow = { addressOf: () => "localhost:11434", isAnswering: () => answer.promise };
      vi.useFakeTimers();
      const { steps, touchFiles } = acme({ provider: OLLAMA, check: slow });
      steps.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(steps.state).toMatchObject({ model: { status: "checking" } });
      touchFiles();
      // The files are read again before the answer comes.
      await vi.advanceTimersByTimeAsync(0);
      answer.resolve(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(steps.state).toMatchObject({ model: { status: "done" } });
    });

    it("shows the section's error when the agents can't be read", async () => {
      const { steps } = acme({ agents: new Error("disk") });
      expect(await started(steps)).toMatchObject({ kind: "failed" });
    });

    it("shows the section's error while the runs have never loaded, and the steps once they do", async () => {
      const { steps, finishRun } = acme({ runsError: new Error("disk") });
      expect(await started(steps)).toMatchObject({ kind: "failed" });
      finishRun();
      expect(steps.state).toMatchObject({ kind: "showing", runDone: true });
    });

    it("remembers nothing once Home has closed", async () => {
      const answer = Promise.withResolvers<boolean>();
      const slow = { addressOf: () => "localhost:11434", isAnswering: () => answer.promise };
      const { steps, saved } = acme({
        provider: OLLAMA,
        agents: [writer],
        runs: [finished],
        check: slow,
      });
      vi.useFakeTimers();
      const stop = steps.start();
      await vi.advanceTimersByTimeAsync(0);
      stop();
      answer.resolve(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(steps.state.kind).toBe("loading");
      expect(saved).toEqual([]);
    });
  });
});
