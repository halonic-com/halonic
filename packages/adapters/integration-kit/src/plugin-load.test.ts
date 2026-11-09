import { Plugin } from "@halonicjs/format/integration";
import type { Integration, IntegrationTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginLoadProblems } from "./plugin-load.ts";

/** The weather plugin as the plugin service reads it, with the defaults filled in. */
function plugin(overrides: Record<string, unknown> = {}): Plugin {
  return Plugin.parse({
    id: "weather",
    version: "1.0.0",
    sdk: 1,
    name: "Weather",
    backend: {
      hosts: ["api.example.com"],
      tools: [
        {
          name: "forecast",
          description: "Today's forecast for a city.",
          arguments: { city: "The city." },
          risk: "read",
          untrusted: true,
        },
      ],
    },
    ...overrides,
  });
}

/** A plugin with only a local tool. */
function localOnly(sdk: number): Plugin {
  return plugin({
    sdk,
    backend: undefined,
    localTools: [
      {
        id: "files",
        start: { script: { program: "node", path: "tools/server.js" } },
        tools: [{ name: "list-files", description: "Lists.", risk: "read", untrusted: false }],
      },
    ],
  });
}

function tool(overrides: Partial<IntegrationTool> = {}): IntegrationTool {
  return {
    name: "forecast",
    description: "Today's forecast for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "The city." } },
    },
    risk: "read",
    untrusted: true,
    ...overrides,
  };
}

function code(overrides: Partial<Integration> = {}): Integration {
  return {
    name: "weather",
    version: "1.0.0",
    tools: [tool()],
    connect: () => ({ callTool: async () => "", close: async () => {} }),
    ...overrides,
  };
}

function found(checked: Plugin, integration?: Integration) {
  return pluginLoadProblems(checked, integration).map(({ code, path }) => ({ code, path }));
}

verifies("integration-kit.plugin-load", () => {
  it("passes a plugin built for this SDK whose backend code matches its backend", () => {
    expect(pluginLoadProblems(plugin(), code())).toEqual([]);
  });

  it("reports another SDK once, at sdk, with or without a backend", () => {
    expect(pluginLoadProblems(plugin({ sdk: 2 }), code())).toEqual([
      {
        code: "sdk-version",
        path: ["sdk"],
        message: "weather: built against SDK 2, but this Halonic offers SDK 1",
      },
    ]);
    expect(found(localOnly(2))).toEqual([{ code: "sdk-version", path: ["sdk"] }]);
    expect(found(localOnly(1))).toEqual([]);
  });

  it("reports another name or version at the plugin's own fields", () => {
    expect(found(plugin(), code({ name: "other", version: "2.0.0" }))).toEqual([
      { code: "name-differs", path: ["id"] },
      { code: "version-differs", path: ["version"] },
    ]);
  });

  it("reports a tool that differs, or one the backend doesn't list, under backend", () => {
    const tools = [tool({ risk: "write" }), tool({ name: "alerts" })];
    expect(found(plugin(), code({ tools }))).toEqual([
      { code: "tool-differs", path: ["backend", "tools", 0, "risk"] },
      { code: "tool-not-declared", path: ["backend", "tools"] },
    ]);
  });

  it("refuses backend code for a plugin without a backend", () => {
    expect(pluginLoadProblems(localOnly(1), code())).toEqual([
      {
        code: "backend-not-declared",
        path: [],
        message: "weather: the plugin has backend code, but plugin.yaml has no backend",
      },
    ]);
  });
});
