import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { homeFeature } from "./feature.ts";

verifies("home.list-column", () => {
  it("sets Home's view, so Home shows its list column and content pane", () => {
    const shell = createShell({ features: [homeFeature] });
    expect(shell.contributions.home.view()).toMatchObject({
      listColumn: { view: "HomeListColumn" },
      contentPane: { view: "HomeContentPane" },
      featureId: "home",
    });
  });
});
