import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { programTrustFields } from "./program-trust-fields.ts";

const program = (settings: Record<string, unknown>): ConnectorTrustContent => ({
  id: "files",
  transport: "stdio",
  settings: { args: [], cwd: ".", env: {}, secretEnv: {}, ...settings },
  tools: { approve: [] },
});

verifies("app.program-trust-fields", () => {
  it("reads the command, path, working folder and every env entry in name order", () => {
    const fields = programTrustFields(
      program({
        command: "node",
        args: ["tools/files.js"],
        path: "/usr/local/bin/node",
        cwd: "tools",
        env: { NODE_OPTIONS: "--require ./setup.js", LOG_LEVEL: "debug" },
        inheritEnv: ["AWS_PROFILE"],
        sites: ["pypi.org"],
      }),
    );

    expect(fields).toEqual({
      command: "node tools/files.js",
      inherited: ["AWS_PROFILE"],
      path: "/usr/local/bin/node",
      workingFolder: "tools",
      environment: ["LOG_LEVEL=debug", "NODE_OPTIONS=--require ./setup.js"],
      sites: ["pypi.org"],
      registry: "npm",
    });
  });

  it("gives no path and no working folder for a program in the workspace's own folder", () => {
    const fields = programTrustFields(program({ command: "npx" }));

    expect(fields.path).toBeUndefined();
    expect(fields.workingFolder).toBeUndefined();
    expect(fields.environment).toEqual([]);
  });

  it("names PyPI for a Python package runner", () => {
    expect(programTrustFields(program({ command: "uvx", args: ["notes-server"] })).registry).toBe(
      "PyPI",
    );
  });

  it("leaves the text as written, for the screen to escape", () => {
    const fields = programTrustFields(program({ command: "node", env: { NOTE: "a\u001bb" } }));

    expect(fields.environment).toEqual(["NOTE=a\u001bb"]);
  });
});
