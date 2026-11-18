import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { actionFailedLine } from "./plugin-actions.ts";

verifies("plugins.plugin-actions", () => {
  it("lower-cases a reason's first word after the colon, but never a name", () => {
    expect(actionFailedLine("remove trust", "The store is locked.")).toBe(
      "Couldn't remove trust: the store is locked.",
    );
    expect(actionFailedLine("open the folder", "Halonic can't find it.")).toBe(
      "Couldn't open the folder: Halonic can't find it.",
    );
    expect(actionFailedLine("open the folder", "Studio can't open folders yet.")).toBe(
      "Couldn't open the folder: Studio can't open folders yet.",
    );
    expect(actionFailedLine("remove trust", "GitHub is down.")).toBe(
      "Couldn't remove trust: GitHub is down.",
    );
  });
});
