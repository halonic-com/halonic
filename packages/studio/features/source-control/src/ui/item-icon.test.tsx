// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemKind } from "../change-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemIcon } from "./item-icon.tsx";

afterEach(unmountAll);

/** Which icon a kind draws: the place or Settings section it names, or "other" for the rest. */
function iconOf(kind: ItemKind | undefined): string {
  const svg = render(<ItemIcon kind={kind} />).querySelector("svg");
  return svg?.getAttribute("data-place-icon") ?? svg?.getAttribute("data-section-icon") ?? "other";
}

verifies("source-control.change-list", () => {
  describe("ItemIcon", () => {
    it("draws the place a kind's items are in", () => {
      expect(iconOf("agent")).toBe("agents");
      expect(iconOf("workflow")).toBe("workflows");
      expect(iconOf("routine")).toBe("routines");
      expect(iconOf("skill")).toBe("library");
    });

    it("draws a workflow test with its workflow, and a provider with Models, not the Library", () => {
      expect(iconOf("workflowTest")).toBe("workflows");
      expect(iconOf("provider")).toBe("models");
    });

    it("draws a hub's own file as its settings, with the gear", () => {
      const svg = render(<ItemIcon kind="hub" />).querySelector("svg");
      expect(svg?.getAttribute("data-place-icon")).toBeNull();
      // The gear has a hole drawn as a circle.
      expect(svg?.querySelector("circle")).not.toBeNull();
    });
  });
});
