import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readRunnerArgs } from "../runner-args.ts";
import { runnerCommand } from "./runner-command.ts";
import type { RunnerFiles } from "./runner-profile.ts";

const files: RunnerFiles = {
  node: "/fake-home/.nvm/versions/node/v26.0.0/bin/node",
  nodeFolder: "/fake-home/.nvm/versions/node/v26.0.0",
  runnerFile: "/opt/halonic/runner.js",
  integrationFolder: "/fake-home/code/weather",
};

verifies("integration-runner.start", () => {
  describe("runnerCommand", () => {
    it("starts Node with its permission model reading only the runner and the integration", () => {
      const args = {
        nonce: "n-1",
        folder: "/fake-home/code/weather",
        entryFile: "/fake-home/code/weather/index.js",
        exportName: "weather",
      };
      const command = runnerCommand(files, args, { platform: "darwin" });
      expect(command.program).toBe(files.node);
      expect(command.args).toEqual([
        "--permission",
        "--allow-fs-read=/opt/halonic/runner.js",
        "--allow-fs-read=/fake-home/code/weather",
        "--max-old-space-size=256",
        "/opt/halonic/runner.js",
        "n-1",
        "/fake-home/code/weather",
        "/fake-home/code/weather/index.js",
        "weather",
      ]);
      expect(readRunnerArgs(command.args.slice(5))).toEqual(args);
    });

    it("starts Node through prlimit on Linux, with a limit on the whole data segment (A24)", () => {
      const args = {
        nonce: "n-1",
        folder: "/fake-home/code/weather",
        entryFile: "/fake-home/code/weather/index.js",
        exportName: "weather",
      };
      const plain = runnerCommand(files, args, { platform: "darwin" });
      const command = runnerCommand(files, args, { platform: "linux" });
      expect(command.program).toBe("/usr/bin/prlimit");
      // 640 MiB for Node's start, 256 for the heap and 256 for buffers.
      expect(command.args).toEqual([`--data=${1152 * 1024 * 1024}`, plain.program, ...plain.args]);
    });

    it("starts plain Node on Linux when prlimit isn't there", () => {
      const args = {
        nonce: "n-1",
        folder: "/fake-home/code/weather",
        entryFile: "/fake-home/code/weather/index.js",
        exportName: "weather",
      };
      const plain = runnerCommand(files, args, { platform: "darwin" });
      expect(runnerCommand(files, args, { platform: "linux", prlimitAvailable: false })).toEqual(
        plain,
      );
    });

    it("refuses runner arguments that are missing or extra", () => {
      expect(() => readRunnerArgs(["n-1", "/a", "/a/b.js"])).toThrow(/four arguments/);
      expect(() => readRunnerArgs(["n-1", "/a", "/a/b.js", "x", "y"])).toThrow(/four arguments/);
      expect(() => readRunnerArgs(["", "/a", "/a/b.js", "x"])).toThrow(/four arguments/);
      expect(() => readRunnerArgs(["n-1", "", "/a/b.js", "x"])).toThrow(/four arguments/);
    });
  });
});
