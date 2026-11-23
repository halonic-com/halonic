import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { readForecastSettings } from "./forecast-settings.ts";
import { manifest } from "./manifest.ts";

// Made-up agents and models only.
verifies("paperclip.seats-forecast-settings", () => {
  test("has no model windows and no scenarios when nothing is set", () => {
    expect(readForecastSettings({})).toEqual({ modelWindows: {}, scenarios: [] });
    const properties = manifest.instanceConfigSchema?.["properties"] as Record<
      string,
      { default?: unknown }
    >;
    expect(properties["modelWindows"]?.default).toEqual([]);
    expect(properties["scenarios"]?.default).toEqual([]);
  });

  test("turns each scenario's agents into a cap change and a model per agent", () => {
    const settings = readForecastSettings({
      modelWindows: [{ modelPrefix: "claude-small", window: "Small" }],
      scenarios: [
        { id: "caps-minus-one", label: "Caps -1", agents: ["agent-1", "agent-2"], capDelta: -1 },
        { id: "small-group", agents: ["agent-3"], model: "claude-small-1" },
        { id: "leaner", label: "Leaner prompts", demandFactor: 0.82 },
      ],
    });
    expect(settings.modelWindows).toEqual({ "claude-small": "Small" });
    expect(settings.scenarios).toEqual([
      {
        id: "caps-minus-one",
        label: "Caps -1",
        capDelta: { "agent-1": -1, "agent-2": -1 },
        modelOverride: {},
        demandFactor: 1,
      },
      {
        id: "small-group",
        label: "small-group",
        capDelta: {},
        modelOverride: { "agent-3": "claude-small-1" },
        demandFactor: 1,
      },
      {
        id: "leaner",
        label: "Leaner prompts",
        capDelta: {},
        modelOverride: {},
        demandFactor: 0.82,
      },
    ]);
  });

  test("leaves out a scenario that is bad, taken, named current or changes nothing", () => {
    const settings = readForecastSettings({
      modelWindows: [{ modelPrefix: "claude-small" }, "Small"],
      scenarios: [
        { id: "a", demandFactor: 0.9 },
        { id: "a", demandFactor: 0.5 },
        { id: "current", demandFactor: 0.5 },
        { id: "Caps Minus", agents: ["agent-1"], capDelta: -1 },
        { id: "no-agents", capDelta: -1 },
        { id: "half-step", agents: ["agent-1"], capDelta: -0.5 },
        { id: "too-big", demandFactor: 3 },
        "b",
      ],
    });
    expect(settings.modelWindows).toEqual({});
    expect(settings.scenarios.map((scenario) => [scenario.id, scenario.demandFactor])).toEqual([
      ["a", 0.9],
    ]);
  });
});
