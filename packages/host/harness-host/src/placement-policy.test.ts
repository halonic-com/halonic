import { AgentPlacement } from "@halonicjs/app";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { clock, digest, harnessAgentOf, MemoryPlacementStore } from "./fakes.test-helper.ts";
import { type AgentFiles, FilePlacementPolicy } from "./placement-policy.ts";

const location = "/workspaces/acme";
const coder = harnessAgentOf("coder", null);

/** The agents' files by hub and id, which a test can change. */
function filesOf(texts: Record<string, string>): AgentFiles & { read: string[] } {
  const read: string[] = [];
  return {
    read,
    bytesOf: async (hubId, agentId) => {
      const key = `${hubId}/${agentId}`;
      read.push(key);
      const text = texts[key];
      if (text === undefined) throw new Error(`No agent ${key}.`);
      return encodeUtf8(text);
    },
  };
}

function setup(texts: Record<string, string>) {
  const reader = new AgentPlacement({ store: new MemoryPlacementStore(), digest, clock });
  const files = filesOf(texts);
  const policy = new FilePlacementPolicy({ reader, files, location });
  return { reader, files, policy };
}

/** Chooses "this computer" for the file, the way a person does. */
async function chooseThisComputer(reader: AgentPlacement, file: string): Promise<void> {
  const subject = { location, agent: "coder", file: encodeUtf8(file) };
  const shown = await reader.where(subject);
  await reader.chooseThisComputer(subject, shown.agentFingerprint);
}

verifies("harness-host.placement", () => {
  it("runs an agent nobody chose for in a sandbox", async () => {
    const { policy } = setup({ "support/coder": "kind: agent\n" });

    expect(await policy.where(coder)).toEqual({ runsOn: "sandbox" });
  });

  it("runs an agent on this computer when a person chose that for its file as it is", async () => {
    const { reader, policy } = setup({ "support/coder": "kind: agent\n" });
    await chooseThisComputer(reader, "kind: agent\n");

    expect(await policy.where(coder)).toEqual({
      runsOn: "this-computer",
      chosenAt: "2026-11-11T10:00:00.000Z",
    });
  });

  it("runs the agent in a sandbox again once its file changed", async () => {
    const { reader, policy } = setup({ "support/coder": "kind: agent\n " });
    await chooseThisComputer(reader, "kind: agent\n");

    expect(await policy.where(coder)).toEqual({ runsOn: "sandbox" });
  });

  it("reads the file of the agent the engine asks about, in its hub", async () => {
    const { files, policy } = setup({ "support/coder": "kind: agent\n" });

    await policy.where(coder);

    expect(files.read).toEqual(["support/coder"]);
  });

  it("fails when the agent's file can't be read, so the harness doesn't start", async () => {
    const { policy } = setup({});

    await expect(policy.where(coder)).rejects.toThrow("No agent support/coder.");
  });
});
