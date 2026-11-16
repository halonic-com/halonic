import { describe, expect, it } from "vitest";
import type { WslDistro } from "./host.ts";
import { removeWslSetup, type WslRemoveHost } from "./remove.ts";
import { memoryWslSetupStore } from "./state.ts";

const distro = (name: string): WslDistro => ({
  name,
  state: "Stopped",
  version: 2,
  isDefault: false,
});
const DATA = "Z:\\data"; // leak-guard: allow absolute-path example
const BACKUP = "Z:\\backup\\halonic.tar"; // leak-guard: allow absolute-path example
const BAD_FILES = [
  "backup.tar",
  "\\\\server\\share\\a.tar",
  "Z:\\", // leak-guard: allow absolute-path example
  "Z:\\a|b.tar", // leak-guard: allow absolute-path example
  "\\\\.\\pipe\\x",
];
const ours = { step: "done", importedDistro: { name: "halonic", location: DATA } } as const;

function fakeHost(opts: { names?: string[]; exportCode?: number; unregisterCode?: number } = {}) {
  const calls: string[] = [];
  const host: WslRemoveHost = {
    distros: async () => (opts.names ?? ["halonic"]).map(distro),
    exportDistro: async (name, file) => {
      calls.push(`export ${name} ${file}`);
      return { code: opts.exportCode ?? 0, output: "" };
    },
    unregisterDistro: async (name) => {
      calls.push(`unregister ${name}`);
      return { code: opts.unregisterCode ?? 0, output: "" };
    },
  };
  return { host, calls };
}

describe("removeWslSetup", () => {
  it("changes nothing when the user keeps the setup", async () => {
    const { host, calls } = fakeHost();
    const result = await removeWslSetup(host, memoryWslSetupStore({ ...ours }), "halonic", {
      choice: "keep",
    });
    expect(result).toEqual({ outcome: "kept" });
    expect(calls).toEqual([]);
  });

  it("exports first, then unregisters, then resets the saved state", async () => {
    const { host, calls } = fakeHost();
    const store = memoryWslSetupStore({ ...ours });
    const file = BACKUP;
    const result = await removeWslSetup(host, store, "halonic", {
      choice: "export-then-remove",
      file,
    });
    expect(result).toEqual({ outcome: "removed", exportedTo: file });
    expect(calls).toEqual([`export halonic ${file}`, "unregister halonic"]);
    expect(await store.load()).toEqual({ step: "not-started" });
  });

  it("unregisters without an export only when the user declined it", async () => {
    const { host, calls } = fakeHost();
    const result = await removeWslSetup(host, memoryWslSetupStore({ ...ours }), "halonic", {
      choice: "remove-without-export",
    });
    expect(result).toEqual({ outcome: "removed" });
    expect(calls).toEqual(["unregister halonic"]);
  });

  it("keeps the distro when the export fails", async () => {
    const { host, calls } = fakeHost({ exportCode: 1 });
    const store = memoryWslSetupStore({ ...ours });
    const result = await removeWslSetup(host, store, "halonic", {
      choice: "export-then-remove",
      file: BACKUP,
    });
    expect(result).toMatchObject({ outcome: "failed", reason: "export-failed" });
    expect(calls).toEqual([`export halonic ${BACKUP}`]);
    expect((await store.load()).step).toBe("done");
  });

  it("keeps the saved state when the unregister fails", async () => {
    const { host } = fakeHost({ unregisterCode: 1 });
    const store = memoryWslSetupStore({ ...ours });
    const result = await removeWslSetup(host, store, "halonic", {
      choice: "remove-without-export",
    });
    expect(result).toMatchObject({ outcome: "failed", reason: "unregister-failed" });
    expect((await store.load()).step).toBe("done");
  });

  it("refuses a distro Halonic didn't import (W8)", async () => {
    const { host, calls } = fakeHost();
    const result = await removeWslSetup(host, memoryWslSetupStore(), "halonic", {
      choice: "remove-without-export",
    });
    expect(result).toEqual({ outcome: "refused", reason: "distro-not-ours" });
    expect(calls).toEqual([]);
  });

  it("refuses when the distro isn't registered", async () => {
    const { host, calls } = fakeHost({ names: [] });
    const result = await removeWslSetup(host, memoryWslSetupStore({ ...ours }), "halonic", {
      choice: "remove-without-export",
    });
    expect(result).toEqual({ outcome: "refused", reason: "distro-missing" });
    expect(calls).toEqual([]);
  });

  it.each(BAD_FILES)("refuses the export file %s", async (file) => {
    const { host, calls } = fakeHost();
    const result = await removeWslSetup(host, memoryWslSetupStore({ ...ours }), "halonic", {
      choice: "export-then-remove",
      file,
    });
    expect(result).toEqual({ outcome: "refused", reason: "bad-export-file" });
    expect(calls).toEqual([]);
  });
});
