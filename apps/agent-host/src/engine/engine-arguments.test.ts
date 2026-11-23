import { resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { engineArgumentsOf } from "./engine-arguments.ts";

// Absolute on every system, without naming a folder of this computer.
const profile = resolve("acme-profile");
const workspace = resolve("acme");

verifies("agent-host.engine-role-arguments", () => {
  describe("engineArgumentsOf", () => {
    it("reads the profile folder and the workspace, in any order", () => {
      expect(
        engineArgumentsOf(["--workspace", workspace, "--engine", "--profile-folder", profile]),
      ).toEqual({ profileFolder: profile, workspace });
    });

    it.each([
      ["a relative workspace", ["--engine", "--profile-folder", profile, "--workspace", "acme"]],
      ["a missing workspace", ["--engine", "--profile-folder", profile]],
      ["a missing value", ["--engine", "--profile-folder", profile, "--workspace"]],
      ["no --engine", ["--profile-folder", profile, "--workspace", workspace]],
      [
        "a repeated folder",
        [
          "--engine",
          "--profile-folder",
          profile,
          "--profile-folder",
          profile,
          "--workspace",
          workspace,
        ],
      ],
      [
        "--engine twice",
        ["--engine", "--engine", "--profile-folder", profile, "--workspace", workspace],
      ],
      [
        "another argument",
        ["--engine", "--profile-folder", profile, "--workspace", workspace, "--stdio"],
      ],
    ])("refuses %s", (_case, args) => {
      expect(engineArgumentsOf(args)).toEqual({ error: expect.stringContaining("--engine") });
    });
  });
});
