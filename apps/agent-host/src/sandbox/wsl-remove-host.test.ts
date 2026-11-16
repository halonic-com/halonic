import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WslRemoveHost } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileWslSetupStore, hostWslRemover } from "./wsl-remove-host.ts";

const BACKUP = "Z:\\backup\\halonic.tar"; // leak-guard: allow absolute-path example
const LOCATION = "Z:\\halonic"; // leak-guard: allow absolute-path example

let profile = "";

beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "halonic-wsl-"));
});

afterEach(async () => {
  await rm(profile, { recursive: true, force: true });
});

function fakeHost(exportCode = 0) {
  const calls: string[] = [];
  const host: WslRemoveHost = {
    distros: async () => [{ name: "halonic", state: "Stopped", version: 2, isDefault: false }],
    exportDistro: async (name, file) => {
      calls.push(`export ${name} ${file}`);
      return { code: exportCode, output: "" };
    },
    unregisterDistro: async (name) => {
      calls.push(`unregister ${name}`);
      return { code: 0, output: "" };
    },
    exportedSize: async () => 10,
  };
  return { host, calls };
}

const ours = {
  step: "done",
  importedDistro: { name: "halonic", location: LOCATION },
} as const;

verifies("agent-host.wsl-remove-route", () => {
  describe("fileWslSetupStore", () => {
    it("is not started without a file, and reads back what it saved", async () => {
      const store = fileWslSetupStore(profile);
      expect(await store.load()).toEqual({ step: "not-started" });
      await store.save(ours);
      expect(await fileWslSetupStore(profile).load()).toEqual(ours);
    });

    it("refuses a file that isn't a state instead of taking it for an empty one", async () => {
      await mkdir(join(profile, "sandbox"));
      await writeFile(join(profile, "sandbox", "wsl-setup.json"), '{"step":"nonsense"}');
      await expect(fileWslSetupStore(profile).load()).rejects.toThrow("isn't a valid state");
      await writeFile(join(profile, "sandbox", "wsl-setup.json"), "{");
      await expect(fileWslSetupStore(profile).load()).rejects.toThrow("can't be read");
    });

    it("refuses a link in place of the file", async () => {
      await mkdir(join(profile, "sandbox"));
      await writeFile(join(profile, "elsewhere.json"), JSON.stringify(ours));
      await symlink(join(profile, "elsewhere.json"), join(profile, "sandbox", "wsl-setup.json"));
      await expect(fileWslSetupStore(profile).load()).rejects.toThrow("can't be read");
    });
  });

  describe("hostWslRemover", () => {
    it("exports, unregisters Halonic's own distro and resets the saved state", async () => {
      const { host, calls } = fakeHost();
      await fileWslSetupStore(profile).save(ours);
      const result = await hostWslRemover(
        profile,
        host,
      )({
        choice: "export-then-remove",
        file: BACKUP,
      });
      expect(result).toEqual({ outcome: "removed", exportedTo: BACKUP });
      expect(calls).toEqual([`export halonic ${BACKUP}`, "unregister halonic"]);
      expect(await fileWslSetupStore(profile).load()).toEqual({ step: "not-started" });
    });

    it("unregisters nothing after a failed export", async () => {
      const { host, calls } = fakeHost(1);
      await fileWslSetupStore(profile).save(ours);
      const result = await hostWslRemover(
        profile,
        host,
      )({
        choice: "export-then-remove",
        file: BACKUP,
      });
      expect(result).toMatchObject({ outcome: "failed", reason: "export-failed" });
      expect(calls).toEqual([`export halonic ${BACKUP}`]);
    });

    it("refuses a distro Halonic didn't import", async () => {
      const { host, calls } = fakeHost();
      const result = await hostWslRemover(profile, host)({ choice: "remove-without-export" });
      expect(result).toEqual({ outcome: "refused", reason: "distro-not-ours" });
      expect(calls).toEqual([]);
    });
  });
});
