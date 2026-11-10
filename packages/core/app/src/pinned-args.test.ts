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
  it("names the package at the pin's version, once, and passes the server's arguments on", () => {
    expect(pinnedRunnerArgs(npmPin, ["-y", "@acme/mail-mcp", "--inbox", "@acme/mail-mcp"])).toEqual(
      ["-y", "@acme/mail-mcp@2.3.1", "--inbox", "@acme/mail-mcp"],
    );
    expect(pinnedRunnerArgs(npmPin, ["-y", "@acme/mail-mcp@2.3.1"])).toEqual([
      "-y",
      "@acme/mail-mcp@2.3.1",
    ]);
    expect(pinnedRunnerArgs(pypiPin, ["mail-mcp@2.3.1", "--port", "0"])).toEqual([
      "mail-mcp==2.3.1",
      "--port",
      "0",
    ]);
  });

  it("adds the pin's version to a package option's value, written with a space or an =", () => {
    expect(
      pinnedRunnerArgs(npmPin, ["exec", "--package=@acme/mail-mcp", "--", "mail-mcp"]),
    ).toEqual(["exec", "--package=@acme/mail-mcp@2.3.1", "--", "mail-mcp"]);
    expect(pinnedRunnerArgs(npmPin, ["-y", "-p", "@acme/mail-mcp", "@acme/mail-mcp"])).toEqual([
      "-y",
      "-p",
      "@acme/mail-mcp@2.3.1",
      "@acme/mail-mcp",
    ]);
    expect(pinnedRunnerArgs(pypiPin, ["run", "--spec", "mail-mcp", "mail-mcp"])).toEqual([
      "run",
      "--spec",
      "mail-mcp==2.3.1",
      "mail-mcp",
    ]);
  });

  it("keeps the command word after a package option a program name, as PyPI compares names", () => {
    expect(pinnedRunnerArgs(pypiPin, ["--from", "Mail_MCP", "mail-mcp"])).toEqual([
      "--from",
      "mail-mcp==2.3.1",
      "mail-mcp",
    ]);
    expect(pinnedRunnerArgs(pypiPin, ["--with=mail-mcp,mail_mcp==2.3.1", "mail-mcp"])).toEqual([
      "--with=mail-mcp==2.3.1,mail-mcp==2.3.1",
      "mail-mcp",
    ]);
  });
});
