import type { Clock, SandboxSetting, SandboxSettingStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NoSandboxService } from "./no-sandbox.ts";

const clock: Clock = { now: () => new Date("2026-11-15T09:00:00.000Z") };

class FakeSettings implements SandboxSettingStore {
  saved: SandboxSetting | null;
  writes = 0;

  constructor(saved: SandboxSetting | null = null) {
    this.saved = saved;
  }

  async get(): Promise<SandboxSetting | null> {
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

  it("has no command line flag: the service offers only choose and takeBack", () => {
    const methods = Object.getOwnPropertyNames(NoSandboxService.prototype).filter(
      (name) => name !== "constructor",
    );
    expect(methods.sort()).toEqual(["choose", "takeBack"]);
  });
});
