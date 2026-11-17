import { createShell } from "@halonicjs/studio-shell";
import { describe, expect, it } from "vitest";
import { PluginsHostService } from "./api.ts";
import { pluginsFeature } from "./feature.ts";

describe("pluginsFeature", () => {
  it("is registered under its folder name", () => {
    expect(pluginsFeature.id).toBe("plugins");
  });

  it("gives its Settings section the plugins icon", () => {
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    expect(section?.icon).toBe("plugins");
  });
});
