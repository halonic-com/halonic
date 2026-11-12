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
      for (const code of [12, 13, 14, 17, 30, 31, 32, 33, 34, 35, 36, 38]) {
        expect(helperFailure("setup", code, "")).toMatch(/^[A-Za-z].*[a-z]$/);
      }
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
  });
});
