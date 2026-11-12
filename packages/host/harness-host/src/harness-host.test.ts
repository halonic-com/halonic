import type { HarnessProfileBuilder, ProposalRun } from "@halonicjs/engine";
import type { Harness, Sandbox } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  approveAll,
  clock,
  digest,
  harnessAgentOf,
  MemoryDefinitionStore,
  MemoryPlacementStore,
  noTools,
  RecordingBridgeServer,
} from "./fakes.test-helper.ts";
import { type HarnessHostInput, harnessHostOf } from "./harness-host.ts";
import { ProposalsNeedHistoryError } from "./history-proposal-folders.ts";
import { refusingTrash } from "./not-wired.ts";

// Only their identity matters here: the builder hands them to the engine as they are.
const fenced = { name: "fenced" } as unknown as Sandbox;
const unfenced = { name: "unfenced" } as unknown as Sandbox;
const claudeCode = { id: "claude-code" } as unknown as Harness;
const profiles = { profileOf: async () => ({}) } as unknown as HarnessProfileBuilder;

const writer = harnessAgentOf("writer", null);
const savedFilesRun: ProposalRun = {
  runId: "01JD8Q",
  hubId: "support",
  workflowId: "triage",
  version: { reads: "saved-files" },
};

function inputOf(overrides: Partial<HarnessHostInput> = {}) {
  const bridgeServer = new RecordingBridgeServer();
  const records = new MemoryDefinitionStore();
  const input: HarnessHostInput = {
    sandboxes: { sandbox: fenced, "this-computer": unfenced },
    harnesses: { "claude-code": claudeCode },
    bridgeServer,
    services: {
      servicesFor: () => ({ providers: {}, prices: {}, tools: noTools, approvals: approveAll }),
    },
    profiles,
    home: "<home>",
    placement: {
      store: new MemoryPlacementStore(),
      location: "/workspaces/acme",
      files: { bytesOf: async () => encodeUtf8("kind: agent\n") },
    },
    digest,
    clock,
    proposals: {
      vcs: null,
      copies: null,
      records,
      store: new MemoryDefinitionStore(),
      trash: refusingTrash,
      onEndFailed: () => {},
    },
    ...overrides,
  };
  return { input, bridgeServer, records };
}

verifies("harness-host.builder", () => {
  it("gives the engine the host's sandboxes, harnesses, profiles and home as they are", () => {
    const { harnesses } = harnessHostOf(inputOf().input);

    expect(harnesses.sandboxes).toEqual({ sandbox: fenced, "this-computer": unfenced });
    expect(harnesses.harnesses["claude-code"]).toBe(claudeCode);
    expect(harnesses.profiles).toBe(profiles);
    expect(harnesses.home).toBe("<home>");
    expect(harnesses).not.toHaveProperty("startTimeoutsMs");
  });

  it("passes start time limits on when the host gives them", () => {
    const { input } = inputOf({ startTimeoutsMs: { sandbox: 5_000 } });

    expect(harnessHostOf(input).harnesses.startTimeoutsMs).toEqual({ sandbox: 5_000 });
  });

  it("asks the person's choices where each agent runs", async () => {
    const { harnesses } = harnessHostOf(inputOf().input);

    expect(await harnesses.placement.where(writer)).toEqual({ runsOn: "sandbox" });
  });

  it("opens each run's bridge on the host's bridge server", async () => {
    const { input, bridgeServer } = inputOf();

    await harnessHostOf(input).harnesses.bridges.open(writer, { record: async () => {} });

    expect(bridgeServer.opened.map(({ runId, agentId }) => ({ runId, agentId }))).toEqual([
      { runId: "01JD8Q", agentId: "writer" },
    ]);
  });

  it("refuses a history-off run when its folder opens, when the host has no run copies", async () => {
    const { proposalFolders } = harnessHostOf(inputOf().input);

    await expect(proposalFolders.open(savedFilesRun)).rejects.toBeInstanceOf(
      ProposalsNeedHistoryError,
    );
  });

  it("clears what ended runs left at start, from the proposal records", async () => {
    const { input, records } = inputOf();
    records.list = async () => {
      throw new Error("The records can't be listed.");
    };

    await expect(harnessHostOf(input).start(new Set())).rejects.toThrow(
      "The records can't be listed.",
    );
  });

  it("starts with nothing to clear", async () => {
    await expect(harnessHostOf(inputOf().input).start(new Set())).resolves.toBeUndefined();
  });
});
