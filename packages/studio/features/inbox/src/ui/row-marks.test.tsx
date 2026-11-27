// @vitest-environment jsdom
import type { InboxItem as AgentItem } from "@halonicjs/ports";
import type { ListRow } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { isValidElement } from "react";
import { afterEach, expect, it } from "vitest";
import type { SetupItem } from "../inbox-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { agentMark, itemMark } from "./row-marks.tsx";

afterEach(unmountAll);

const setup: SetupItem = {
  kind: "setup",
  key: "setup:google:acme",
  provider: "google",
  account: "acme",
  title: "Set up Google",
  progress: "Step 4 of 7 · Scopes",
  changedAt: "2026-11-08T09:00:00.000Z",
};

/** The classes of the tile a row's mark draws. */
const tileClasses = ({ avatar }: Pick<ListRow, "avatar">) =>
  render(avatar).firstElementChild?.className.split(" ");

verifies("inbox.row-marks", () => {
  it("gives a setup item a mark on the same tile as the other rows, so its title lines up", () => {
    expect(isValidElement(itemMark(setup).avatar)).toBe(true);
  });

  it("draws every mark on the sidebar's 48px tile (HAL-20675)", () => {
    const ada = { from: { kind: "agent", agent: "acme:ada", name: "Ada" } } as Pick<
      AgentItem,
      "from"
    > as AgentItem;

    expect(tileClasses(itemMark(setup))).toContain("size-12");
    expect(tileClasses(agentMark(undefined))).toContain("size-12");
    expect(tileClasses(agentMark(ada))).toContain("size-12");
  });

  it("steps a mark's tile up to surface on a hovered or open row's muted fill (HAL-19751)", () => {
    expect(tileClasses(itemMark(setup))).toEqual(
      expect.arrayContaining(["bg-surface-muted", "on-muted:bg-surface"]),
    );
  });
});
