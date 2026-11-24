import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ItemCardTakers } from "./item-card-takers.ts";

const writer = { kind: "agent", hub: "acme", id: "writer" };

verifies("shell.panels.show-replaces-windows", () => {
  it("asks only the page in the tab it is given, and nothing once that page stops", () => {
    const takers = new ItemCardTakers();
    const stop = takers.add("tab-1", () => true);

    expect(takers.take("tab-1", writer)).toBe(true);
    expect(takers.take("tab-2", writer)).toBe(false);
    stop();
    expect(takers.take("tab-1", writer)).toBe(false);
  });

  it("keeps the taker of a page drawn afresh in the same tab when the old one stops", () => {
    const takers = new ItemCardTakers();
    const stopOld = takers.add("tab-1", () => false);
    takers.add("tab-1", () => true);

    stopOld();

    expect(takers.take("tab-1", writer)).toBe(true);
  });
});
