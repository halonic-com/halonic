import type { ItemUsage, Usage } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { usedByText } from "./used-by-text.ts";

const named = (...names: string[]): Usage[] =>
  names.map((name) => ({ id: name.toLowerCase(), name, hub: null }));

function usage(parts: Partial<ItemUsage>): ItemUsage {
  return { agents: [], hubs: [], routines: [], collections: [], ...parts };
}

verifies("library.rows.used-by", () => {
  it("names a single agent", () => {
    expect(usedByText(usage({ agents: named("Support") }))).toBe("Used by Support");
  });

  it("counts several agents", () => {
    expect(usedByText(usage({ agents: named("Support", "Billing") }))).toBe("Used by 2 agents");
  });

  it("counts an agent next to a collection", () => {
    expect(usedByText(usage({ agents: named("Support"), collections: named("Claims") }))).toBe(
      "Used by 1 agent and 1 collection",
    );
  });

  it("counts the routines of a connector", () => {
    expect(usedByText(usage({ routines: named("Inbox") }))).toBe("Used by 1 routine");
  });

  it("says not used yet, also when only a hub takes the item", () => {
    expect(usedByText(usage({}))).toBe("Not used yet");
    expect(usedByText(usage({ hubs: named("beta") }))).toBe("Not used yet");
  });
});
