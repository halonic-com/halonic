import type { SearchProviderContribution } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { AgentsHostService } from "./api.ts";
import { agentsFeature } from "./feature.ts";
import { memoryAgentsHost } from "./memory-host.ts";

/** Registers the feature on a stand-in `studio` and returns what it added. */
function registered() {
  const providers: SearchProviderContribution[] = [];
  const commands: { id: string; title: string; run: (context: never) => void }[] = [];
  const kinds: { tab?: { describe: (item: never, context: never) => { label: string } } }[] = [];
  const studio = {
    places: { add: () => undefined },
    itemKinds: { add: (kind: (typeof kinds)[number]) => kinds.push(kind) },
    search: { addProvider: (provider: SearchProviderContribution) => providers.push(provider) },
    commands: { add: (command: (typeof commands)[number]) => commands.push(command) },
  };
  agentsFeature.register(studio as never);
  return { providers, commands, kinds };
}

const host = memoryAgentsHost({
  hubs: [{ id: "acme", name: "Acme" }],
  agents: [
    { hubId: "acme", id: "sorter", name: "Sorter", description: "Sorts the inbox" },
    { hubId: "acme", id: "refund-checker", name: "Refund checker" },
  ],
});
const context = {
  services: { get: (key: unknown) => (key === AgentsHostService ? host : undefined) },
} as never;

describe("agentsFeature", () => {
  it("is registered under its folder name", () => {
    expect(agentsFeature.id).toBe("agents");
  });
});

verifies("agents.list.find", () => {
  it("finds agents by name, id or description for Ctrl K", async () => {
    const [provider] = registered().providers;

    expect(await provider?.search("sort", context)).toEqual([
      {
        item: { kind: "agent", hub: "acme", id: "sorter" },
        label: "Sorter",
        detail: "Agent · Acme",
        description: "Sorts the inbox",
      },
    ]);
    expect(await provider?.search("INBOX", context)).toHaveLength(1);
    expect(await provider?.search("refund-checker", context)).toHaveLength(1);
    expect(await provider?.search("  ", context)).toEqual([]);
  });

  it("adds the New agent command, which opens the Agents page", () => {
    const command = registered().commands.find((each) => each.id === "agents.new");
    const openPlace = vi.fn();

    command?.run({ openPlace } as never);

    expect(command?.title).toBe("New agent");
    expect(openPlace).toHaveBeenCalledWith("agents");
  });

  it("names an agent's tab by its name, and by its id before it is read", () => {
    const tab = registered().kinds[0]?.tab;

    expect(tab?.describe({ kind: "agent", hub: "acme", id: "sorter" } as never, context)).toEqual({
      label: "Sorter",
    });
    expect(tab?.describe({ kind: "agent", hub: "acme", id: "ghost" } as never, context)).toEqual({
      label: "ghost",
    });
  });
});
