import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type PrivateFile, privateFileAt } from "./private-file.ts";
import { RemoteSettings, remoteSettingsOff } from "./remote-settings.ts";

/** A file in memory that counts its writes, and can be told to fail them. */
class MemoryFile implements PrivateFile {
  text: string | undefined;
  writes = 0;
  failing = false;

  constructor(text?: string) {
    this.text = text;
  }

  async read(): Promise<string | undefined> {
    return this.text;
  }

  async write(text: string): Promise<void> {
    if (this.failing) throw new Error("the disk is full");
    this.writes += 1;
    this.text = text;
  }
}

async function settingsOn(file: PrivateFile) {
  const logged: string[] = [];
  const settings = await RemoteSettings.open({ file, log: (text) => logged.push(text) });
  return { settings, logged };
}

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

verifies("agent-host.remote-settings", () => {
  describe("RemoteSettings", () => {
    it("starts with both switches off without a file", async () => {
      const { settings } = await settingsOn(new MemoryFile());
      expect(settings.values).toEqual(remoteSettingsOff);
      expect(settings.allowRiskyRemotely()).toBe(false);
    });

    it("keeps a change, and reads it again on the next start", async () => {
      const file = new MemoryFile();
      const { settings } = await settingsOn(file);
      await settings.change({ allowRiskyRemotely: true });
      expect(settings.allowRiskyRemotely()).toBe(true);
      await settings.change({ on: true });
      const again = await settingsOn(file);
      expect(again.settings.values).toEqual({ on: true, allowRiskyRemotely: true });
    });

    it("writes nothing when nothing changes", async () => {
      const file = new MemoryFile();
      const { settings } = await settingsOn(file);
      await settings.change({ on: false });
      expect(file.writes).toBe(0);
    });

    it("counts a file it can't read as both switches off, and says so", async () => {
      for (const text of ["{", '{"version":2,"on":true}', '{"version":1,"on":"yes"}']) {
        const { settings, logged } = await settingsOn(new MemoryFile(text));
        expect(settings.values).toEqual(remoteSettingsOff);
        expect(logged).toEqual([
          "The remote settings file can't be read, so remote and risky answers are off.\n",
        ]);
      }
    });

    it("turns the risky switch off at once even when the write fails", async () => {
      const file = new MemoryFile('{"version":1,"on":true,"allowRiskyRemotely":true}');
      const { settings } = await settingsOn(file);
      file.failing = true;
      await expect(settings.change({ allowRiskyRemotely: false })).rejects.toThrow("disk is full");
      expect(settings.allowRiskyRemotely()).toBe(false);
    });

    it("keeps its file readable by the person only", async () => {
      const folder = await mkdtemp(join(tmpdir(), "remote-settings-"));
      folders.push(folder);
      const path = join(folder, "remote", "settings.json");
      const { settings } = await settingsOn(privateFileAt(path));
      await settings.change({ on: true });
      if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await settingsOn(privateFileAt(path))).settings.values.on).toBe(true);
    });
  });
});
