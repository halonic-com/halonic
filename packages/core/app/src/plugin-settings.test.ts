import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { PluginSettings, pluginSettingsCollection } from "./plugin-settings.ts";
import { pluginFrom, weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestRecordStore } from "./testing/test-record-store.ts";

/** The weather plugin, with a choice, a number and a secret setting beside its `root`. */
function weather(choices = "[metric, imperial]") {
  return pluginFrom(
    weatherManifest.replace(
      "    root: { label: Folder, type: text, required: true }\n",
      `    root: { label: Folder, type: text, required: true }
    units: { label: Units, type: choice, choices: ${choices}, default: metric }
    days: { label: Days, type: number }
    key: { label: API key, type: secret, secret: example-key }
`,
    ),
  );
}

function setup() {
  const clock: Clock = { now: () => new Date("2026-11-10T09:00:00.000Z") };
  const records = new TestRecordStore();
  return { records, settings: new PluginSettings(records, clock) };
}

verifies("app.plugin-settings", () => {
  it("gives the saved values, with each other setting's default", async () => {
    const { settings } = setup();
    expect(await settings.values(weather())).toEqual({ units: "metric" });
    expect((await settings.save(weather(), { root: "~/Documents", days: 3 })).ok).toBe(true);
    expect(await settings.values(weather())).toEqual({
      root: "~/Documents",
      units: "metric",
      days: 3,
    });
  });

  it("gives the default again when a saved value no longer fits the setting", async () => {
    const { settings } = setup();
    await settings.save(weather(), { root: "~/Documents", units: "imperial" });
    expect(await settings.values(weather())).toMatchObject({ units: "imperial" });
    expect(await settings.values(weather("[metric, kelvin]"))).toMatchObject({ units: "metric" });
  });

  it("saves nothing and gives every problem when a value doesn't fit", async () => {
    const { records, settings } = setup();
    const saved = await settings.save(weather(), {
      colour: "blue",
      days: "3",
      key: "a value typed into the wrong place",
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.error.map((problem) => problem.setting)).toEqual([
      "colour",
      "days",
      "key",
      "root",
    ]);
    expect(saved.error[0]?.message).toBe("Weather has no setting called 'colour'");
    expect(await records.changes(pluginSettingsCollection)).toEqual([]);
  });

  it("forgets one plugin's values and compacts them out, keeping the others", async () => {
    const { records, settings } = setup();
    const rain = pluginFrom(weatherManifest.replace("id: weather", "id: rain"));
    await settings.save(weather(), { root: "~/Weather" });
    await settings.save(weather(), { root: "~/Documents" });
    await settings.save(rain, { root: "~/Rain" });

    await settings.forget("weather");
    expect(await settings.values(weather())).toEqual({ units: "metric" });
    expect(await records.changes(pluginSettingsCollection)).toEqual([
      expect.objectContaining({ id: "rain", op: "seed", values: { root: "~/Rain" } }),
    ]);
    await settings.forget("hail");
    expect(await records.changes(pluginSettingsCollection)).toHaveLength(1);
  });
});
