import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { removeWslSetup } from "./remove.ts";
import { memoryWslSetupStore } from "./state.ts";
import { type Run, systemWslRemoveHost } from "./system-host.ts";

const LIST = "  NAME      STATE     VERSION\n* halonic   Stopped   2\n";
const BACKUP = "Z:\\backup\\halonic.tar"; // leak-guard: allow absolute-path example

/** A fake `wsl.exe`: records every call, answers the list, and fails what it is told to. */
function fakeWslExe(opts: { failExport?: boolean; failUnregister?: boolean } = {}) {
  const calls: string[] = [];
  const run: Run = async (file, args) => {
    expect(file.toLowerCase()).toMatch(/wsl\.exe$/);
    calls.push(args.join(" "));
    if (args[0] === "--list") return { code: 0, output: LIST };
    if (args[0] === "--export") return { code: opts.failExport ? 1 : 0, output: "" };
    if (args[0] === "--unregister") return { code: opts.failUnregister ? 1 : 0, output: "" };
    return { code: 1, output: "" };
  };
  return { run, calls };
}

async function ours() {
  const store = memoryWslSetupStore();
  await store.save({
    step: "done",
    importedDistro: { name: "halonic", location: "Z:\\data" }, // leak-guard: allow absolute-path example
  });
  return store;
}

verifies("sandbox-srt.wsl-remove", () => {
  describe("the real remove host with a fake wsl.exe", () => {
    it("exports, then unregisters, when the export worked", async () => {
      const { run, calls } = fakeWslExe();
      const host = systemWslRemoveHost(run, async () => 2048);
      const result = await removeWslSetup(host, await ours(), "halonic", {
        choice: "export-then-remove",
        file: BACKUP,
      });
      expect(result).toEqual({ outcome: "removed", exportedTo: BACKUP });
      expect(calls).toEqual([
        "--list --verbose",
        `--export halonic ${BACKUP}`,
        "--unregister halonic",
      ]);
    });

    it("never unregisters when the export fails", async () => {
      const { run, calls } = fakeWslExe({ failExport: true });
      const host = systemWslRemoveHost(run, async () => 2048);
      const result = await removeWslSetup(host, await ours(), "halonic", {
        choice: "export-then-remove",
        file: BACKUP,
      });
      expect(result).toMatchObject({ outcome: "failed", reason: "export-failed" });
      expect(calls.some((call) => call.startsWith("--unregister"))).toBe(false);
    });

    it("never unregisters when the export left no file", async () => {
      const { run, calls } = fakeWslExe();
      const host = systemWslRemoveHost(run, async () => null);
      const result = await removeWslSetup(host, await ours(), "halonic", {
        choice: "export-then-remove",
        file: BACKUP,
      });
      expect(result).toMatchObject({ outcome: "failed", reason: "export-failed" });
      expect(calls.some((call) => call.startsWith("--unregister"))).toBe(false);
    });

    it("runs nothing without an explicit choice to remove", async () => {
      const { run, calls } = fakeWslExe();
      const host = systemWslRemoveHost(run);
      const result = await removeWslSetup(host, await ours(), "halonic", { choice: "keep" });
      expect(result).toEqual({ outcome: "kept" });
      expect(calls).toEqual([]);
    });
  });
});
