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
  it("lets a package runner without a pin pass, still known as a package runner", () => {
    const transport = stdio({ command: "NPX.CMD", args: ["-y", "@acme/mail-mcp"] });
    expect(checkPackageRunnerLaunch(transport)).toEqual({ ok: true, value: null });
    expect(isPackageRunner(transport.command, transport.args)).toBe(true);
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

  it("refuses a proxy, certificate or preload variable, each with its own reason", () => {
    expect(refused(stdio({ pin, env: { HTTPS_PROXY: "http://proxy.example.com" } }))).toBe(
      "the connector's environment sets HTTPS_PROXY, which could send the registry's answers through another server",
    );
    for (const name of ["http_proxy", "All_Proxy"]) {
      expect(refused(stdio({ pin, env: { [name]: "x" } })), name).toContain("another server");
    }
    for (const name of ["NODE_EXTRA_CA_CERTS", "ssl_cert_file", "REQUESTS_CA_BUNDLE"]) {
      expect(refused(stdio({ pin, env: { [name]: "x" } })), name).toBe(
        `the connector's environment sets ${name}, which could make the runner trust a server that only claims to be the registry`,
      );
    }
    for (const name of ["LD_PRELOAD", "dyld_insert_libraries"]) {
      expect(refused(stdio({ pin, env: { [name]: "x" } })), name).toBe(
        `the connector's environment sets ${name}, which could load other code into the runner before the pinned package`,
      );
    }
  });

  it("refuses a blocked variable taken from the app's environment as if the connector set it", () => {
    expect(refused(stdio({ pin, inheritEnv: ["AWS_PROFILE", "npm_config_registry"] }))).toContain(
      "sets npm_config_registry",
    );
    expect(refused(stdio({ pin, inheritEnv: ["HTTPS_PROXY"] }))).toContain("another server");
    expect(checkPackageRunnerLaunch(stdio({ pin, inheritEnv: ["AWS_PROFILE"] })).ok).toBe(true);
  });

  it("refuses a pinned runner with an option that fetches from another registry", () => {
    expect(
      refused(stdio({ pin, args: ["--registry=https://evil.test", "-y", "@acme/mail-mcp"] })),
    ).toBe(
      "the command sets --registry=https://evil.test, which could fetch the pinned package from somewhere other than https://registry.npmjs.org",
    );
    const refusedArgs: [string, string[]][] = [
      ["npx", ["--userconfig", "./evil.npmrc", "-y", "@acme/mail-mcp"]],
      ["npx", ["--@acme:registry=https://evil.test", "@acme/mail-mcp"]],
      ["npm", ["exec", "--Registry", "https://evil.test", "@acme/mail-mcp"]],
      ["uvx", ["--index-url", "https://evil.test/simple", "@acme/mail-mcp"]],
      ["uvx", ["--extra-index-url=https://evil.test/simple", "@acme/mail-mcp"]],
      ["uvx", ["--default-index", "https://evil.test/simple", "@acme/mail-mcp"]],
      ["uvx", ["--find-links", "./wheels", "@acme/mail-mcp"]],
      ["uvx", ["-i", "https://evil.test/simple", "@acme/mail-mcp"]],
      ["pipx", ["run", "--pip-args=--index-url=https://evil.test", "@acme/mail-mcp"]],
    ];
    for (const [command, args] of refusedArgs) {
      expect(refused(stdio({ pin, command, args })), `${command} ${args.join(" ")}`).toContain(
        "could fetch the pinned package from somewhere other than",
      );
    }
  });

  it("finds a runner that a shell starts", () => {
    const wrapped: [string, string[]][] = [
      ["cmd", ["/c", "npx", "-y", "@acme/mail-mcp"]],
      ["CMD.EXE", ["/C", "npx -y @acme/mail-mcp"]],
      ["sh", ["-c", "exec uvx mail-mcp"]],
      ["/bin/bash", ["-lc", "cd /srv && npm exec @acme/mail-mcp"]],
      ["zsh", ["-c", "bunx @acme/mail-mcp"]],
      ["powershell.exe", ["-Command", "& 'npx.cmd' -y @acme/mail-mcp"]],
      ["pwsh", ["-c", "uv tool run mail-mcp"]],
    ];
    for (const [command, args] of wrapped) {
      expect(isPackageRunner(command, args), `${command} ${args.join(" ")}`).toBe(true);
      expect(checkPackageRunnerLaunch(stdio({ command, args })), command).toEqual({
        ok: true,
        value: null,
      });
    }
    expect(isPackageRunner("cmd", ["/c", "node", "server.js"])).toBe(false);
  });

  it("refuses a pinned runner whose arguments name another version", () => {
    expect(refused(stdio({ pin, args: ["-y", "@acme/mail-mcp@3.0.0"] }))).toBe(
      "the command asks for @acme/mail-mcp 3.0.0, but the pin is 2.3.1",
    );
    expect(refused(stdio({ pin, args: ["-y", "@acme/mail-mcp@latest"] }))).toContain("is a tag");
    expect(refused(stdio({ pin, args: ["-y", "@acme/mail-mcp@^2.3.1"] }))).toContain("is a range");
  });

  it("refuses a pinned runner whose arguments name another package", () => {
    expect(refused(stdio({ pin, args: ["-p", "other-pkg", "mail-mcp"] }))).toBe(
      'the command asks for the package "other-pkg", but the pin is for "@acme/mail-mcp"',
    );
    expect(refused(stdio({ pin, args: ["--package=other-pkg@1.0.0", "mail-mcp"] }))).toContain(
      '"other-pkg"',
    );
    expect(refused(stdio({ pin, args: ["-y", "other-pkg"] }))).toBe(
      "the command doesn't name the pinned package \"@acme/mail-mcp\", so the launcher can't start it at 2.3.1",
    );
  });

  it("passes a pinned runner whose arguments name the pin's package at no version or the pin's version", () => {
    for (const args of [
      ["-y", "@acme/mail-mcp"],
      ["-y", "@acme/mail-mcp@2.3.1", "--account", "work"],
      ["-p", "@acme/mail-mcp@2.3.1", "mail-mcp"],
    ]) {
      expect(checkPackageRunnerLaunch(stdio({ pin, args })), args.join(" ")).toEqual({
        ok: true,
        value: pin,
      });
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

  it("names every registry option in one refusal, and lets a registry variable without a pin pass", () => {
    const args = ["--registry", "https://evil.test", "--cache=./cache", "@acme/mail-mcp"];
    expect(refused(stdio({ pin, args }))).toContain("sets --registry, --cache=./cache,");
    const unpinned = stdio({ args, env: { HTTPS_PROXY: "http://proxy.example.com" } });
    expect(checkPackageRunnerLaunch(unpinned)).toEqual({ ok: true, value: null });
  });

  it("lets a pinned runner pass with options that don't move the registry", () => {
    const args = ["-y", "@acme/mail-mcp", "--inbox", "work", "--format=json"];
    expect(checkPackageRunnerLaunch(stdio({ pin, args, env: { NO_PROXY: "x" } }))).toEqual({
      ok: true,
      value: pin,
    });
  });

  it("checks a PyPI runner's packages the way PyPI names them", () => {
    const pypiPin: ConnectorPin = {
      registry: "pypi",
      registryUrl: "https://pypi.org/simple",
      package: "mail-mcp",
      version: "2.3.1",
    };
    const uvx = (args: string[]) => stdio({ command: "uvx", args, pin: pypiPin });
    for (const args of [
      ["Mail_MCP"],
      ["mail-mcp==2.3.1"],
      ["mail-mcp@2.3.1"],
      ["--from", "mail-mcp==2.3.1", "mail-mcp"],
    ]) {
      expect(checkPackageRunnerLaunch(uvx(args)), args.join(" ")).toEqual({
        ok: true,
        value: pypiPin,
      });
    }
    expect(refused(uvx(["mail-mcp@3.0.0"]))).toBe(
      "the command asks for mail-mcp 3.0.0, but the pin is 2.3.1",
    );
    expect(refused(uvx(["--from", "git+https://example.com/mail-mcp.git", "mail-mcp"]))).toContain(
      "is a git source",
    );
    expect(refused(uvx(["--with", "mail-mcp,requests", "mail-mcp"]))).toContain('"requests"');
  });

  it("reads the program name the way the rule compares it", () => {
    const windowsPath = "C:\\Program Files\\nodejs\\NPX.CMD"; // leak-guard: allow absolute-path a made-up Windows install path
    expect(programName(windowsPath)).toBe("npx");
    expect(programName("./bin/uvx.bat")).toBe("uvx");
    expect(programName("")).toBe("");
  });
});
