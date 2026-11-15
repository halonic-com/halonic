import type { Clock, SandboxSetting, SandboxSettingStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NoSandboxService } from "./no-sandbox.ts";

const clock: Clock = { now: () => new Date("2026-11-15T09:00:00.000Z") };

class FakeSettings implements SandboxSettingStore {
  saved: SandboxSetting | null;
  writes = 0;
  failToRead = false;

  constructor(saved: SandboxSetting | null = null) {
    this.saved = saved;
  }

  async get(): Promise<SandboxSetting | null> {
    if (this.failToRead) throw new Error("The setting can't be read.");
    return this.saved;
  }

  async save(setting: SandboxSetting): Promise<void> {
    this.writes += 1;
    this.saved = setting;
  }

  async remove(): Promise<void> {
    this.writes += 1;
    this.saved = null;
  }
}

const noSandbox = (settings: FakeSettings) =>
  new NoSandboxService({ settings, clock, appVersion: "0.1.0" });

verifies("app.no-sandbox", () => {
  describe("choosing", () => {
    it("saves none with the time and the app version", async () => {
      const settings = new FakeSettings();
      const setting = await noSandbox(settings).choose();
      const expected: SandboxSetting = {
        backend: "none",
        chosenAt: "2026-11-15T09:00:00.000Z",
        appVersion: "0.1.0",
      };
      expect(setting).toEqual(expected);
      expect(settings.saved).toEqual(expected);
    });

    it("replaces a backend the person chose before", async () => {
      const settings = new FakeSettings({ backend: "srt", chosenAt: "2026-11-01T09:00:00.000Z" });
      await noSandbox(settings).choose();
      expect(settings.saved?.backend).toBe("none");
    });
  });

  it("deletes the setting when the person takes it back", async () => {
    const settings = new FakeSettings({
      backend: "none",
      chosenAt: "2026-11-01T09:00:00.000Z",
      appVersion: "0.1.0",
    });
    await noSandbox(settings).takeBack();
    expect(settings.saved).toBeNull();
  });

  it("keeps a saved backend when taking the choice back", async () => {
    const settings = new FakeSettings({
      backend: "srt",
      chosenAt: "2026-11-01T09:00:00.000Z",
    });
    await noSandbox(settings).takeBack();
    expect(settings.saved?.backend).toBe("srt");
    expect(settings.writes).toBe(0);
  });

  describe("a CLI --no-sandbox", () => {
    it("is refused with no saved setting, and saves nothing", async () => {
      const settings = new FakeSettings();
      expect(await noSandbox(settings).cliFlag()).toEqual({ allowed: false, reason: "not-chosen" });
      expect(settings.writes).toBe(0);
    });

    it("is refused when the person chose a backend", async () => {
      const settings = new FakeSettings({ backend: "srt", chosenAt: "2026-11-01T09:00:00.000Z" });
      expect(await noSandbox(settings).cliFlag()).toEqual({ allowed: false, reason: "not-chosen" });
      expect(settings.writes).toBe(0);
    });

    it("is allowed when the setting already says none, and changes nothing", async () => {
      const settings = new FakeSettings({
        backend: "none",
        chosenAt: "2026-11-01T09:00:00.000Z",
        appVersion: "0.1.0",
      });
      expect(await noSandbox(settings).cliFlag()).toEqual({ allowed: true });
      expect(settings.writes).toBe(0);
    });

    it("throws when the setting can't be read, so a damaged setting never allows it", async () => {
      const settings = new FakeSettings();
      settings.failToRead = true;
      await expect(noSandbox(settings).cliFlag()).rejects.toThrow("can't be read");
    });
  });
});
