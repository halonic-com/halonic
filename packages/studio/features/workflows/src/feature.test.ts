import type { SearchProviderContribution } from "@halonicjs/studio-shell";
import { describe, expect, it, vi } from "vitest";
import { WorkflowsHostService } from "./api.ts";
import { workflowsFeature } from "./feature.ts";
import { listing, memoryHost } from "./test-support.tsx";

/** Registers the feature on a stand-in `studio` and returns what it added. */
function registered() {
  const providers: SearchProviderContribution[] = [];
  const commands: { id: string; title: string; run: (context: never) => void }[] = [];
  const kinds: {
    tab?: {
      describe: (item: never, context: never) => { label: string };
      subscribe?: (listener: () => void, context: never) => () => void;
    };
  }[] = [];
  const studio = {
    places: { add: () => undefined },
    itemKinds: { add: (kind: (typeof kinds)[number]) => kinds.push(kind) },
    search: { addProvider: (provider: SearchProviderContribution) => providers.push(provider) },
    commands: { add: (command: (typeof commands)[number]) => commands.push(command) },
  };
  workflowsFeature.register(studio as never);
  return { providers, commands, kinds };
}

const hubs = [{ id: "acme", name: "Acme" }];
const rows = [
  listing("acme", "mail-triage", "Mail triage", { description: "Sorts the inbox" }),
  listing("acme", "invoice-intake", "Invoice intake"),
];
const contextOf = (memory = memoryHost(hubs, rows)) => ({
  services: { get: (key: unknown) => (key === WorkflowsHostService ? memory.host : undefined) },
});

describe("workflowsFeature", () => {
  it("is registered under its folder name", () => {
    expect(workflowsFeature.id).toBe("workflows");
  });

  it("finds workflows by name, id or description for Ctrl K", async () => {
    const [provider] = registered().providers;
    const context = contextOf() as never;

    const byName = await provider?.search("triage", context);
    expect(byName).toEqual([
      {
        item: { kind: "workflow", hub: "acme", id: "mail-triage" },
        label: "Mail triage",
        detail: "Workflow · Acme",
        description: "Sorts the inbox",
      },
    ]);
    expect(await provider?.search("INBOX", context)).toHaveLength(1);
    expect(await provider?.search("  ", context)).toEqual([]);
  });

  it("adds the New workflow command, which opens the Workflows page", () => {
    const command = registered().commands.find((each) => each.id === "workflows.new");
    const openPlace = vi.fn();

    command?.run({ openPlace } as never);

    expect(command?.title).toBe("New workflow");
    expect(openPlace).toHaveBeenCalledWith("workflows");
  });

  it("names a tab by the workflow's name, else its id", () => {
    const tab = registered().kinds[0]?.tab;
    const context = contextOf() as never;

    expect(
      tab?.describe({ kind: "workflow", hub: "acme", id: "mail-triage" } as never, context),
    ).toEqual({
      label: "Mail triage",
    });
    expect(tab?.describe({ kind: "workflow", hub: "acme", id: "gone" } as never, context)).toEqual({
      label: "gone",
    });
  });

  it("tells the window when the host's workflows change, so a tab named by its id follows (L14, HAL-12730)", () => {
    const tab = registered().kinds[0]?.tab;
    const memory = memoryHost(hubs, []);
    const listener = vi.fn();

    const stop = tab?.subscribe?.(listener, contextOf(memory) as never);
    memory.change(rows);
    stop?.();
    memory.change([]);

    expect(listener).toHaveBeenCalledOnce();
  });
});
