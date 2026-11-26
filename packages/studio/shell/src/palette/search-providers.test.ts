import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { SearchProviderContribution, SearchResult } from "../points/commands.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { searchProviders } from "./search-providers.ts";

/** A stand-in context that only says which feature it is for. */
function contextFor(featureId: string): WorkspaceContext {
  return { featureId } as unknown as WorkspaceContext;
}

function provider(
  featureId: string,
  search: SearchProviderContribution["search"],
): Registered<SearchProviderContribution> {
  return { featureId, id: featureId, title: featureId, order: 0, search };
}

const sorter: SearchResult = {
  item: { kind: "agent", hub: "acme", id: "sorter" },
  label: "Sorter",
};
const support: SearchResult = {
  item: { kind: "workflow", hub: "acme", id: "support-reply" },
  label: "Support reply",
};

verifies("shell.palette-groups", () => {
  it("asks every provider with its own feature's context, in provider order", async () => {
    const asked: string[] = [];
    const found = await searchProviders(
      "s",
      [
        provider("agents", async (words, context) => {
          asked.push(`${words} for ${(context as unknown as { featureId: string }).featureId}`);
          return [sorter];
        }),
        provider("workflows", async () => [support]),
      ],
      contextFor,
    );
    expect(asked).toEqual(["s for agents"]);
    expect(found).toEqual({ results: [sorter, support], failed: false });
  });

  it("keeps what the others found when a provider fails, and logs each failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const engineDown = new Error("engine down");
    const found = await searchProviders(
      "s",
      [
        provider("agents", () => {
          throw new Error("index not ready");
        }),
        provider("runs", async () => Promise.reject(engineDown)),
        provider("workflows", async () => [support]),
      ],
      contextFor,
    );
    expect(found).toEqual({ results: [support], failed: true });
    expect(logged).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledWith(`Ctrl K: the "runs" search provider failed.`, engineDown);
    logged.mockRestore();
  });

  it("asks nobody while nothing is typed", async () => {
    let asked = false;
    const found = await searchProviders(
      "  ",
      [
        provider("agents", async () => {
          asked = true;
          return [sorter];
        }),
      ],
      contextFor,
    );
    expect(asked).toBe(false);
    expect(found).toEqual({ results: [], failed: false });
  });
});
