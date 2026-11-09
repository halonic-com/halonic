import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  checkPackageRunnerLaunch,
  isPackageRunner,
  programName,
  type StdioTransport,
} from "./package-runner.ts";

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

function stdio(overrides: Partial<StdioTransport> = {}): StdioTransport {
  return {
    kind: "stdio",
    command: "npx",
    args: ["-y", "@acme/mail-mcp@2.3.1"],
    env: {},
    ...overrides,
  };
}

/** The reason the launch was refused, or a failed test when it passed. */
function refused(transport: StdioTransport): string {
  const check = checkPackageRunnerLaunch(transport);
  if (check.ok) {
    throw new Error(`expected a refusal, but it passed with ${JSON.stringify(check.value)}`);
  }
  return check.error;
}

verifies("app.package-runner-launch", () => {
  it("refuses a package runner without a pin", () => {
    expect(refused(stdio({ command: "NPX.CMD", args: ["-y", "@acme/mail-mcp"] }))).toBe(
      '"npx" fetches a package and runs it, so it needs a pin to one exact version, which this connector doesn\'t have',
    );
  });

  it("knows every package runner, with any folder, case and ending", () => {
    const runners: [string, string[]][] = [
      ["C:/tools/uvx.exe", ["mail-mcp"]],
      ["/usr/local/bin/bunx", ["@acme/mail-mcp"]],
      ["pnpx", ["@acme/mail-mcp"]],
      ["UVX.PS1", ["mail-mcp"]],
      ["npm", ["--yes", "exec", "@acme/mail-mcp"]],
      ["npm.cmd", ["x", "@acme/mail-mcp"]],
      ["pnpm", ["dlx", "@acme/mail-mcp"]],
      ["yarn.bat", ["DLX", "@acme/mail-mcp"]],
      ["bun", ["x", "@acme/mail-mcp"]],
      ["pipx", ["run", "mail-mcp"]],
      ["uv", ["tool", "run", "mail-mcp"]],
    ];
    for (const [command, args] of runners) {
      expect(isPackageRunner(command, args), `${command} ${args.join(" ")}`).toBe(true);
      expect(refused(stdio({ command, args })), command).toContain("needs a pin");
    }
  });

  it("lets a command that isn't a package runner pass without a pin", () => {
    const others: [string, string[]][] = [
      ["node", ["server.js"]],
      ["python", ["-m", "mail_mcp"]],
      ["npm", ["start"]],
      ["uv", ["run", "server.py"]],
    ];
    for (const [command, args] of others) {
      expect(isPackageRunner(command, args), command).toBe(false);
      expect(checkPackageRunnerLaunch(stdio({ command, args }))).toEqual({ ok: true, value: null });
    }
  });

  it("refuses a pin whose version is a tag or a range", () => {
    expect(refused(stdio({ pin: { ...pin, version: "latest" } }))).toContain("is a tag");
    expect(refused(stdio({ pin: { ...pin, version: "^2.3.1" } }))).toContain("is a range");
  });

  it("refuses an environment that could move the registry or run code first", () => {
    expect(refused(stdio({ pin, env: { node_options: "--require ./evil.js" } }))).toBe(
      "the connector's environment sets node_options, which could move the registry or run code before the pinned package",
    );
    expect(
      refused(stdio({ pin, env: { NPM_CONFIG_REGISTRY: "https://registry.example.com" } })),
    ).toContain("sets NPM_CONFIG_REGISTRY");
    for (const name of [
      "NODE_PATH",
      "PythonPath",
      "PYTHONSTARTUP",
      "PYTHONHOME",
      "Yarn_Registry",
      "PNPM_HOME",
    ]) {
      expect(refused(stdio({ pin, env: { [name]: "x" } })), name).toContain(`sets ${name}`);
    }
    for (const name of [
      "BUN_INSTALL",
      "COREPACK_HOME",
      "UV_INDEX_URL",
      "PIP_INDEX_URL",
      "PIPX_HOME",
    ]) {
      expect(refused(stdio({ pin, env: { [name]: "x" } })), name).toContain(`sets ${name}`);
    }
  });

  it("passes a pinned runner with a clean environment, and returns the pin", () => {
    const check = checkPackageRunnerLaunch(stdio({ pin, env: { MAIL_ACCOUNT: "work" } }));
    expect(check).toEqual({ ok: true, value: pin });
  });
});

describe("checkPackageRunnerLaunch", () => {
  it("names every blocked variable in one refusal", () => {
    const env = { NODE_OPTIONS: "x", MAIL_ACCOUNT: "work", UV_INDEX_URL: "y" };
    expect(refused(stdio({ pin, env }))).toContain("sets NODE_OPTIONS, UV_INDEX_URL,");
  });

  it("reads the program name the way the rule compares it", () => {
    const windowsPath = "C:\\Program Files\\nodejs\\NPX.CMD"; // leak-guard: allow absolute-path a made-up Windows install path
    expect(programName(windowsPath)).toBe("npx");
    expect(programName("./bin/uvx.bat")).toBe("uvx");
    expect(programName("")).toBe("");
  });
});
