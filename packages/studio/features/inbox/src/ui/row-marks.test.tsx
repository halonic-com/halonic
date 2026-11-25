import { verifies } from "@halonicjs/testing-spec";
import { isValidElement } from "react";
import { expect, it } from "vitest";
import type { SetupItem } from "../inbox-items.ts";
import { itemMark } from "./row-marks.tsx";

verifies("inbox.row-marks", () => {
  it("gives a setup item a mark on the same tile as the other rows, so its title lines up", () => {
    const setup: SetupItem = {
      kind: "setup",
      key: "setup:google:acme",
      provider: "google",
      account: "acme",
      title: "Set up Google",
      progress: "Step 4 of 7 · Scopes",
      changedAt: "2026-11-08T09:00:00.000Z",
    };
    expect(isValidElement(itemMark(setup).avatar)).toBe(true);
  });
});
