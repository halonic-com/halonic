import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPY_LIMIT, copySandboxSetting, removeSandboxSettingCopy } from "./setting-copy.ts";

const wslChoice = '{\n  "backend": "srt-wsl",\n  "chosenAt": "2026-11-19T09:00:00.000Z"\n}\n';

verifies("agent-host.sandbox-setting-copy", () => {
  describe("the copy of the sandbox choice", () => {
    let profileFolder = "";
    const savedChoice = () =>
      readFile(join(profileFolder, "sandbox", "sandbox-setting.json"), "utf8");

    beforeEach(async () => {
      profileFolder = await mkdtemp(join(tmpdir(), "halonic-setting-copy-"));
    });

    afterEach(async () => {
      await rm(profileFolder, { recursive: true, force: true });
    });

    it("saves the choice on its input as the Windows shell wrote it, readable by its owner only", async () => {
      expect(await copySandboxSetting(Readable.from([wslChoice]), profileFolder)).toEqual({
        ok: true,
      });
      expect(await savedChoice()).toBe(wslChoice);
      if (process.platform !== "win32") {
        expect((await stat(join(profileFolder, "sandbox"))).mode & 0o777).toBe(0o700);
      }
    });

    it("refuses anything but exactly a choice, and keeps the copy it had", async () => {
      await copySandboxSetting(Readable.from([wslChoice]), profileFolder);
      for (const text of [
        "",
        "{",
        '{"backend":"docker","chosenAt":"x"}',
        '{"backend":"srt","chosenAt":"x","command":"sh"}',
      ]) {
        const copied = await copySandboxSetting(Readable.from([text]), profileFolder);
        expect(copied.ok, text).toBe(false);
      }
      expect(await savedChoice()).toBe(wslChoice);
    });

    it("refuses a choice longer than the limit before reading it to the end", async () => {
      const long = `{"backend":"srt","chosenAt":"${"x".repeat(COPY_LIMIT)}"}`;
      expect(await copySandboxSetting(Readable.from([long]), profileFolder)).toEqual({
        ok: false,
        reason: `The choice is longer than ${COPY_LIMIT} bytes.`,
      });
    });

    it("removes the copy, and no copy is fine", async () => {
      expect(await removeSandboxSettingCopy(profileFolder)).toEqual({ ok: true });
      await copySandboxSetting(Readable.from([wslChoice]), profileFolder);
      expect(await removeSandboxSettingCopy(profileFolder)).toEqual({ ok: true });
      await expect(savedChoice()).rejects.toThrow();
    });
  });
});
