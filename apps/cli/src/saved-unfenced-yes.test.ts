import type { SandboxSetting } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { studioYesReaches } from "./saved-unfenced-yes.ts";

const chosenAt = "2026-11-09T10:00:00.000Z";

/** A saved sandbox choice that reads as `setting`, or fails to read when it's an error. */
const saved = (setting: SandboxSetting | null | Error) => ({
  get: async () => {
    if (setting instanceof Error) throw setting;
    return setting;
  },
});

verifies("cli.local-integration-unfenced-yes", () => {
  describe("studioYesReaches", () => {
    it("doesn't reach the command on Windows with the WSL choice, or with none, the default", async () => {
      expect(await studioYesReaches("win32", saved({ backend: "srt-wsl", chosenAt }))).toBe(false);
      expect(await studioYesReaches("win32", saved(null))).toBe(false);
    });

    it("doesn't reach it on Windows when the choice can't be read", async () => {
      expect(await studioYesReaches("win32", saved(new Error("not a choice")))).toBe(false);
    });

    it("reaches it on Windows with another choice", async () => {
      expect(await studioYesReaches("win32", saved({ backend: "srt", chosenAt }))).toBe(true);
      expect(await studioYesReaches("win32", saved({ backend: "mxc", chosenAt }))).toBe(true);
    });

    it("reaches it everywhere else, without reading the choice", async () => {
      expect(await studioYesReaches("linux", saved(new Error("never read")))).toBe(true);
      expect(await studioYesReaches("darwin", saved(null))).toBe(true);
    });
  });
});
