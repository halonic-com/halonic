import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findHelper,
  HELPER,
  HELPER_MISSING,
  HelperError,
  helperFailure,
  helperScript,
  listsElevated,
  type RemovalSteps,
  removeThroughHelper,
  type Spawn,
  throughHelper,
} from "./elevate-helper.ts";
import type { Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";

/** A spawn that answers with `code` and `stderr`, and keeps what it was asked to run. */
function answering(code: number, stderr = "") {
  const calls: { file: string; args: string[] }[] = [];
  const spawn: Spawn = async (file, args) => {
    calls.push({ file, args });
    return { code, stderr };
  };
  return { spawn, calls };
}

verifies("sandbox-srt.setup", () => {
  describe("the signed helper", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("is found next to the program that runs, and only there", () => {
      const app = join("app", "halonic-agent-host.exe");
      const there = (path: string) => path === join("app", HELPER);
      expect(findHelper("setup", app, there, true)).toBe(join("app", HELPER));
      expect(findHelper("setup", join("node", "node.exe"), there, false)).toBeNull();
    });

    it("lets srt ask for administrator rights itself only under Node, as for the CLI from npm", () => {
      const nowhere = () => false;
      expect(findHelper("setup", join("node", "node.exe"), nowhere, false)).toBeNull();
      expect(findHelper("remove", join("node", "node.exe"), nowhere, false)).toBeNull();
    });

    it("fails in Halonic's own program when the helper is missing, rather than elevate srt-win from the app folder", () => {
      const app = join("app", "halonic-agent-host.exe");
      for (const verb of ["setup", "remove"] as const) {
        let error: unknown;
        try {
          findHelper(verb, app, () => false, true);
        } catch (thrown) {
          error = thrown;
        }
        expect(error).toBeInstanceOf(HelperError);
        expect(error).toMatchObject({
          message: "Halonic's sandbox helper is missing. Reinstall Halonic",
          code: HELPER_MISSING,
        });
      }
    });

    it("is started once with the administrator prompt, the verb and nothing else", async () => {
      vi.stubEnv("SystemRoot", "windows");
      const { spawn, calls } = answering(0);
      expect(await throughHelper(join("app", HELPER), "setup", spawn)).toBe("done");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.file).toBe(
        join("windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      );
      const script = calls[0]?.args.at(-1) ?? "";
      expect(script).toContain(
        `-FilePath '${join("app", HELPER)}' -ArgumentList 'setup' -Verb RunAs`,
      );
    });

    it("quotes a folder with an apostrophe so it stays one path", () => {
      expect(helperScript("O'Brien\\Halonic\\x.exe", "remove")).toContain(
        "-FilePath 'O''Brien\\Halonic\\x.exe' -ArgumentList 'remove'",
      );
      // PowerShell reads typographic quotes as ' too.
      expect(helperScript("O\u2019Brien\u2018s\\x.exe", "setup")).toContain(
        "-FilePath 'O\u2019\u2019Brien\u2018\u2018s\\x.exe' -ArgumentList 'setup'",
      );
    });

    it("says cancelled when the administrator prompt is turned down", async () => {
      vi.stubEnv("SystemRoot", "windows");
      expect(await throughHelper(HELPER, "setup", answering(10).spawn)).toBe("cancelled");
    });

    it("fails with a sentence and the helper's code, never the code alone", async () => {
      vi.stubEnv("SystemRoot", "windows");
      const failed = throughHelper(HELPER, "setup", answering(33).spawn);
      await expect(failed).rejects.toBeInstanceOf(HelperError);
      await expect(failed).rejects.toMatchObject({
        message:
          "Halonic's copy of the sandbox program has been changed, so it wasn't run. Reinstall Halonic",
        code: 33,
      });
    });

    it("words every code it knows, and an unknown one by what was being done", () => {
      for (const code of [12, 13, 14, 17, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40]) {
        expect(helperFailure("setup", code, "")).toMatch(/^[A-Za-z].*[a-z]$/);
      }
      expect(helperFailure("setup", 39, "")).toContain("runtime for the sandbox is missing");
      expect(helperFailure("setup", 40, "")).toContain("has been changed");
      expect(helperFailure("setup", 1, "")).toBe("the sandbox setup stopped with an error");
      expect(helperFailure("remove", 99, "")).toBe("the sandbox removal stopped with an error");
    });

    it("comes through SrtSandbox.setUp as a failed setup, with the sentence and the code", async () => {
      const windows = {
        platform: "win32",
        hasWindowsSandbox: async () => false,
        installWindowsSandbox: async () => {
          throw new HelperError("Windows didn't accept the sandbox's network rules", 12);
        },
      } as Partial<Machine> as Machine;
      expect(await new SrtSandbox(windows).setUp()).toEqual({
        ok: false,
        outcome: "failed",
        reason: "Windows didn't accept the sandbox's network rules",
        code: 12,
      });
    });

    it("says why Windows couldn't start the helper, from the first line it gave", () => {
      expect(helperFailure("setup", 37, "The file is not a valid application.\r\nmore")).toBe(
        "Windows couldn't start the sandbox helper: The file is not a valid application.",
      );
      expect(helperFailure("setup", 37, "")).toBe("Windows couldn't start the sandbox helper");
    });

    it("tells a process with administrator rights by its integrity level, and takes one it can't read for one", () => {
      const level = (sid: string) => `"Mandatory Label\\Level","Label","${sid}",""\r\n`;
      const users = '"BUILTIN\\Users","Alias","S-1-5-32-545","Mandatory group"\r\n';
      expect(listsElevated(users + level("S-1-16-8192"))).toBe(false);
      expect(listsElevated(users + level("S-1-16-12288"))).toBe(true);
      expect(listsElevated(users + level("S-1-16-16384"))).toBe(true);
      expect(listsElevated(users)).toBe(true);
      expect(listsElevated(null)).toBe(true);
    });
  });
});

verifies("sandbox-srt.remove", () => {
  describe("removeThroughHelper", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** Removal steps that log each one into `order`, for a process `elevated` or not, whose forget fails with `failed`. */
    function steps(order: string[], elevated: boolean, failed: string[] = []): RemovalSteps {
      return {
        elevated: async () => elevated,
        forgetAll: async () => {
          order.push("forget");
          return failed;
        },
      };
    }

    /** A spawn that logs the helper into `order` and answers with `code`. */
    function helperIn(order: string[], code: number): Spawn {
      return async () => {
        order.push("helper");
        return { code, stderr: "" };
      };
    }

    it("forgets the user's kept grants before the helper's machine-wide step", async () => {
      vi.stubEnv("SystemRoot", "windows");
      const order: string[] = [];
      expect(await removeThroughHelper(HELPER, helperIn(order, 0), steps(order, false))).toBe(
        "removed",
      );
      expect(order).toEqual(["forget", "helper"]);
    });

    it("stops before the administrator prompt when a grant can't be forgotten, so a retry asks once", async () => {
      vi.stubEnv("SystemRoot", "windows");
      const order: string[] = [];
      const busy = steps(order, false, ["the kept write grants: exit 22: kept_grants_in_use"]);
      await expect(removeThroughHelper(HELPER, helperIn(order, 0), busy)).rejects.toThrow(
        "not all the access it kept on your folders could be taken back (the kept write grants: exit 22: kept_grants_in_use); close what runs in the sandbox and remove it again",
      );
      expect(order).toEqual(["forget"]);
    });

    it("skips the forget step with administrator rights, and says it did", async () => {
      vi.stubEnv("SystemRoot", "windows");
      const order: string[] = [];
      expect(await removeThroughHelper(HELPER, helperIn(order, 0), steps(order, true))).toBe(
        "grants_kept",
      );
      expect(order).toEqual(["helper"]);
    });

    it("says cancelled when the administrator prompt is turned down", async () => {
      vi.stubEnv("SystemRoot", "windows");
      const order: string[] = [];
      expect(await removeThroughHelper(HELPER, helperIn(order, 10), steps(order, false))).toBe(
        "cancelled",
      );
    });

    it("comes through SrtSandbox.remove as done, with a log line for the skip", async () => {
      const windows = {
        platform: "win32",
        uninstallWindowsSandbox: async () => "grants_kept" as const,
      } as Partial<Machine> as Machine;
      const warned: string[] = [];
      const sandbox = new SrtSandbox(windows, undefined, undefined, {
        warn: (message) => warned.push(message),
      });
      expect(await sandbox.remove()).toEqual({ ok: true });
      expect(warned).toEqual([
        "Removed the Windows sandbox, but skipped forgetting its kept access grants: this removal ran with administrator rights. Remove it again without them to forget the grants.",
      ]);
    });
  });
});
