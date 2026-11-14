import { delimiter, dirname } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProcessCall, ProcessResult } from "./node/run-process.ts";
import { installRunCheckout } from "./run-checkout-install.ts";

const pnpm = process.execPath;
const folder = process.cwd();

/** A stand-in for the program start: keeps the call it got, and answers with `code`. */
function fakeRun(code: number): {
  run: (call: ProcessCall) => Promise<ProcessResult>;
  calls: ProcessCall[];
} {
  const calls: ProcessCall[] = [];
  const run = async (call: ProcessCall): Promise<ProcessResult> => {
    calls.push(call);
    return {
      code,
      stdout: Buffer.alloc(0),
      stderr: code === 0 ? "" : "ERR_PNPM_OUTDATED_LOCKFILE the lockfile is old",
    };
  };
  return { run, calls };
}

verifies("git.run-checkout-install", () => {
  describe("installRunCheckout", () => {
    it("installs from the lockfile in the checkout, without scripts", async () => {
      const { run, calls } = fakeRun(0);
      await installRunCheckout(folder, { pnpm, run, environment: {} });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.program).toBe(pnpm);
      expect(calls[0]?.cwd).toBe(folder);
      expect(calls[0]?.args).toEqual([
        "install",
        "--frozen-lockfile",
        "--prefer-offline",
        "--ignore-scripts",
        "--ignore-pnpmfile",
        "--config.manage-package-manager-versions=false",
        "--pm-on-fail=ignore",
        "--registry=https://registry.npmjs.org/",
      ]);
    });

    it("pins the registry on the host's side, and keeps corepack from switching pnpm", async () => {
      const { run, calls } = fakeRun(0);
      await installRunCheckout(folder, {
        pnpm,
        run,
        environment: {},
        registry: "https://mirror.example.com/",
      });
      expect(calls[0]?.args).toContain("--registry=https://mirror.example.com/");
      expect(calls[0]?.env["COREPACK_ENABLE_PROJECT_SPEC"]).toBe("0");
    });

    it("passes proxy names in any letter case", async () => {
      const { run, calls } = fakeRun(0);
      await installRunCheckout(folder, {
        pnpm,
        run,
        environment: { https_proxy: "http://proxy.example.com:8080", no_proxy: "localhost" },
      });
      expect(calls[0]?.env["https_proxy"]).toBe("http://proxy.example.com:8080");
      expect(calls[0]?.env["no_proxy"]).toBe("localhost");
    });

    it("gives pnpm only the names it needs, and the given temp folder", async () => {
      const { run, calls } = fakeRun(0);
      const tempFolder = `${folder}/scratch-tmp`;
      const absolute = dirname(process.execPath);
      await installRunCheckout(folder, {
        pnpm,
        run,
        tempFolder,
        environment: {
          PATH: `${absolute}${delimiter}relative`,
          HOME: "/users/acme",
          npm_config_registry: "https://registry.example.com/",
          PNPM_HOME: "/elsewhere",
          ACME_SECRET: "x",
        },
      });
      const env = calls[0]?.env ?? {};
      expect(env["PATH"]).toBe(absolute);
      expect(env["HOME"]).toBe("/users/acme");
      expect(env["TMPDIR"]).toBe(tempFolder);
      expect(env["npm_config_registry"]).toBeUndefined();
      expect(env["PNPM_HOME"]).toBeUndefined();
      expect(env["ACME_SECRET"]).toBeUndefined();
    });

    it("fails with the end of pnpm's output when the install fails", async () => {
      const { run } = fakeRun(1);
      await expect(installRunCheckout(folder, { pnpm, run, environment: {} })).rejects.toThrow(
        "ERR_PNPM_OUTDATED_LOCKFILE",
      );
    });

    it("shows pnpm's errors when it writes them to stdout", async () => {
      const run = async (): Promise<ProcessResult> => ({
        code: 1,
        stdout: Buffer.from("ERR_PNPM_FETCH_404 no such package"),
        stderr: "a warning",
      });
      await expect(installRunCheckout(folder, { pnpm, run, environment: {} })).rejects.toThrow(
        "ERR_PNPM_FETCH_404",
      );
    });

    it("refuses a folder that isn't absolute", async () => {
      await expect(installRunCheckout("run")).rejects.toThrow("absolute");
    });

    it("refuses a pnpm that isn't an absolute path", async () => {
      await expect(installRunCheckout(folder, { pnpm: "pnpm" })).rejects.toThrow("absolute");
    });

    it("says so when no folder of the PATH has pnpm", async () => {
      await expect(installRunCheckout(folder, { environment: { PATH: "" } })).rejects.toThrow(
        "pnpm was not found",
      );
    });
  });
});
