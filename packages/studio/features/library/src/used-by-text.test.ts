import type { ItemUsage, Usage } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { usedByLine, usedByText } from "./used-by-text.ts";

const named = (...names: string[]): Usage[] =>
  names.map((name) => ({ id: name.toLowerCase(), name, hub: null }));

function usage(parts: Partial<ItemUsage>): ItemUsage {
  return { agents: [], hubs: [], routines: [], collections: [], ...parts };
}

verifies("library.library-used-by", () => {
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

  it("joins three parts with commas and a final and", () => {
    expect(
      usedByText(
        usage({ agents: named("Support"), routines: named("Inbox"), collections: named("Claims") }),
      ),
    ).toBe("Used by 1 agent, 1 routine and 1 collection");
  });

  it("counts the routines of a connector", () => {
    expect(usedByText(usage({ routines: named("Inbox") }))).toBe("Used by 1 routine");
  });

  it("says not used yet, also when only a hub takes the item", () => {
    expect(usedByText(usage({}))).toBe("Not used yet");
    expect(usedByText(usage({ hubs: named("beta") }))).toBe("Not used yet");
  });
});

verifies("library.library-delete", () => {
  it("says nothing when nobody uses the item", () => {
    expect(usedByLine(usage({}))).toBeUndefined();
  });

  it("says who uses it, as the row does", () => {
    expect(usedByLine(usage({ agents: named("Support") }))).toBe("Used by Support");
  });

  it("names the hubs that take a shared item, which the row doesn't count", () => {
    expect(usedByLine(usage({ hubs: named("Support") }))).toBe("Used by the Support hub");
    expect(usedByLine(usage({ hubs: named("Support", "Billing") }))).toBe("Used by 2 hubs");
    expect(usedByLine(usage({ agents: named("Support"), hubs: named("Billing") }))).toBe(
      "Used by Support and 1 hub",
    );
  });
});
