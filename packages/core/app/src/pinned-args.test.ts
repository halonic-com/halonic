import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pinnedRunnerArgs } from "./pinned-args.ts";

const npmPin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

const pypiPin: ConnectorPin = { ...npmPin, registry: "pypi", package: "mail-mcp" };

verifies("app.pinned-runner-args", () => {
  it("names the command word's package at the pin's version, and passes the server's arguments on", () => {
    expect(
      pinnedRunnerArgs(npmPin, "npx", ["-y", "@acme/mail-mcp", "--inbox", "@acme/mail-mcp"]),
    ).toEqual(["-y", "@acme/mail-mcp@2.3.1", "--inbox", "@acme/mail-mcp"]);
    expect(pinnedRunnerArgs(npmPin, "npx", ["-y", "@acme/mail-mcp@2.3.1"])).toEqual([
      "-y",
      "@acme/mail-mcp@2.3.1",
    ]);
    expect(pinnedRunnerArgs(npmPin, "pnpm", ["dlx", "@acme/mail-mcp"])).toEqual([
      "dlx",
      "@acme/mail-mcp@2.3.1",
    ]);
  });

  it("writes a PyPI command word as uvx documents it, and pipx run with --spec", () => {
    expect(pinnedRunnerArgs(pypiPin, "uvx", ["Mail_MCP", "--port", "0"])).toEqual([
      "mail-mcp@2.3.1",
      "--port",
      "0",
    ]);
    expect(pinnedRunnerArgs(pypiPin, "uv", ["tool", "run", "mail-mcp==2.3.1"])).toEqual([
      "tool",
      "run",
      "mail-mcp@2.3.1",
    ]);
    expect(pinnedRunnerArgs(pypiPin, "pipx", ["run", "mail-mcp", "--port", "0"])).toEqual([
      "run",
      "--spec",
      "mail-mcp==2.3.1",
      "mail-mcp",
      "--port",
      "0",
    ]);
  });

  it("adds the pin's version to a package option's value, written with a space or an =", () => {
    expect(
      pinnedRunnerArgs(npmPin, "npm", ["exec", "--package=@acme/mail-mcp", "--", "mail-mcp"]),
    ).toEqual(["exec", "--package=@acme/mail-mcp@2.3.1", "--", "mail-mcp"]);
    expect(
      pinnedRunnerArgs(npmPin, "npx", ["-y", "-p", "@acme/mail-mcp", "@acme/mail-mcp"]),
    ).toEqual(["-y", "-p", "@acme/mail-mcp@2.3.1", "@acme/mail-mcp"]);
    expect(pinnedRunnerArgs(pypiPin, "pipx", ["run", "--spec", "mail-mcp", "mail-mcp"])).toEqual([
      "run",
      "--spec",
      "mail-mcp==2.3.1",
      "mail-mcp",
    ]);
  });

  it("keeps the command word after a package option a program name, as PyPI compares names", () => {
    expect(pinnedRunnerArgs(pypiPin, "uvx", ["--from", "Mail_MCP", "mail-mcp"])).toEqual([
      "--from",
      "mail-mcp==2.3.1",
      "mail-mcp",
    ]);
    expect(
      pinnedRunnerArgs(pypiPin, "uvx", ["--with=mail-mcp,mail_mcp==2.3.1", "mail-mcp"]),
    ).toEqual(["--with=mail-mcp==2.3.1,mail-mcp==2.3.1", "mail-mcp"]);
  });

  it("reads no package option after the command word, which the runner passes on", () => {
    expect(
      pinnedRunnerArgs(npmPin, "npx", ["-y", "@acme/mail-mcp", "-p", "@acme/mail-mcp"]),
    ).toEqual(["-y", "@acme/mail-mcp@2.3.1", "-p", "@acme/mail-mcp"]);
    expect(pinnedRunnerArgs(pypiPin, "uvx", ["mail-mcp", "--from", "mail-mcp"])).toEqual([
      "mail-mcp@2.3.1",
      "--from",
      "mail-mcp",
    ]);
  });
});
