import type { ItemRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openPluginOf } from "./open-plugin.ts";

verifies("runs.run-view.step-failed-call", () => {
  it("opens the plugin's own page on this computer", () => {
    const opened: ItemRef[] = [];
    const openPlugin = openPluginOf({ openItem: (item) => opened.push(item) });

    openPlugin?.("files");

    expect(opened).toEqual([{ kind: "plugin", hub: "this-computer", id: "files" }]);
  });

  it("gives no way to open a plugin where the window can't open tabs", () => {
    expect(openPluginOf({})).toBeUndefined();
  });
});
