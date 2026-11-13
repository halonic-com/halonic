import { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { assistantPrefs } from "./assistant-prefs.ts";

async function settingsWith(saved: Record<string, unknown> = {}): Promise<HostSettings> {
  const store = new MemoryHostSettingsStore();
  for (const [key, value] of Object.entries(saved)) {
    await store.set(key, value as never);
  }
  const settings = new HostSettings(store);
  await settings.load();
  return settings;
}

verifies("settings.ai-agent-prefs", () => {
  it("starts Not set up, turn limit 16 and connector tools on when nothing is saved", async () => {
    const settings = await settingsWith();
    expect(settings.get(assistantPrefs.provider)).toBe("not-set-up");
    expect(settings.get(assistantPrefs.model)).toBe("");
    expect(settings.get(assistantPrefs.baseUrl)).toBe("");
    expect(settings.get(assistantPrefs.secretName)).toBe("");
    expect(settings.get(assistantPrefs.local)).toBe(false);
    expect(settings.get(assistantPrefs.turnLimit)).toBe(16);
    expect(settings.get(assistantPrefs.connectorTools)).toBe(true);
    expect(settings.get(assistantPrefs.instructions)).toBe("");
  });

  it("reads a saved value that doesn't fit as its default, without an error", async () => {
    const settings = await settingsWith({
      "assistant.provider": "mystery",
      "assistant.model": 7,
      "assistant.local": "yes",
      "assistant.turn-limit": 200,
      "assistant.connector-tools": null,
    });
    expect(settings.get(assistantPrefs.provider)).toBe("not-set-up");
    expect(settings.get(assistantPrefs.model)).toBe("");
    expect(settings.get(assistantPrefs.local)).toBe(false);
    expect(settings.get(assistantPrefs.turnLimit)).toBe(16);
    expect(settings.get(assistantPrefs.connectorTools)).toBe(true);
  });

  it.each([1, 16, 64])("accepts the turn limit %i and refuses 0, 65 and 2.5", async (limit) => {
    const settings = await settingsWith();
    await settings.set(assistantPrefs.turnLimit, limit);
    expect(settings.get(assistantPrefs.turnLimit)).toBe(limit);
    for (const bad of [0, 65, 2.5]) {
      await expect(settings.set(assistantPrefs.turnLimit, bad)).rejects.toBeInstanceOf(RangeError);
    }
  });
});
