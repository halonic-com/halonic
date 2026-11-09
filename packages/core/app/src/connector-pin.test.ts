import type { ConnectorPin } from "@halonicjs/ports";
import type { Result } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkPinVersion, checkResolvedVersion } from "./connector-pin.ts";

const npmPin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

const pypiPin: ConnectorPin = {
  registry: "pypi",
  registryUrl: "https://pypi.org/simple",
  package: "mail-mcp",
  version: "2.3.1",
};

/** The reason a check refused, or a failed test when it accepted. */
function reason<T>(result: Result<T, string>): string {
  if (result.ok) {
    throw new Error(`expected a refusal, but it accepted ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

function refusedVersion(pin: ConnectorPin, version: string): string {
  return reason(checkPinVersion({ ...pin, version }));
}

verifies("app.connector-pin-version", () => {
  it("accepts one exact version", () => {
    for (const pin of [
      npmPin,
      { ...npmPin, version: "2.4.0-beta.1" },
      { ...npmPin, package: "mail-mcp", version: "0.0.0" },
      pypiPin,
      { ...pypiPin, version: "1!2.0rc1.post1" },
      { ...pypiPin, package: "Mail_MCP", version: "2024.1.dev3" },
    ]) {
      expect(checkPinVersion(pin), pin.version).toEqual({ ok: true, value: pin });
    }
  });

  it("refuses a tag", () => {
    expect(refusedVersion(npmPin, "latest")).toBe(
      'the version "latest" is a tag, which can move to another version; pin an exact version, such as 2.3.1',
    );
    expect(refusedVersion(npmPin, "next")).toContain("is a tag");
    expect(refusedVersion(pypiPin, "latest")).toContain("is a tag");
  });

  it("refuses a range", () => {
    for (const range of [
      "^2.3.1",
      "~2.3",
      ">=2",
      "2.x",
      "*",
      "2.3",
      "2",
      "2.3.1 - 2.4.0",
      "1 || 2",
    ]) {
      expect(refusedVersion(npmPin, range), range).toBe(
        `the version "${range}" is a range, which can match more than one version; pin an exact version, such as 2.3.1`,
      );
    }
    for (const range of ["2.*", "~=2.3", ">=2,<3", "!=2.3.0"]) {
      expect(refusedVersion(pypiPin, range), range).toContain("is a range");
    }
  });

  it("refuses a version not written as the registry lists it", () => {
    for (const version of ["v2.3.1", "2.3.1+build.5", "02.3.1", ""]) {
      expect(refusedVersion(npmPin, version), version).toContain(
        "isn't one exact version as the registry lists it",
      );
    }
    for (const version of ["2.3.1RC1", "v2.3.1", "2.3.1+local"]) {
      expect(refusedVersion(pypiPin, version), version).toContain(
        "isn't one exact version as the registry lists it",
      );
    }
  });

  it("refuses any resolved version but the pinned one, even a newer one", () => {
    for (const version of ["2.3.2", "2.3.0", "2.3.1-beta.1"]) {
      expect(reason(checkResolvedVersion(npmPin, { package: "@acme/mail-mcp", version }))).toBe(
        `the registry resolved @acme/mail-mcp ${version}, but the pin is 2.3.1`,
      );
    }
    const other = { package: "@acme/other-mcp", version: "2.3.1" };
    expect(reason(checkResolvedVersion(npmPin, other))).toBe(
      'the registry resolved the package "@acme/other-mcp", but the pin is for "@acme/mail-mcp"',
    );
    const exact = { package: "@acme/mail-mcp", version: "2.3.1" };
    expect(checkResolvedVersion(npmPin, exact)).toEqual({ ok: true, value: exact });
  });

  it("compares PyPI names the way PyPI does", () => {
    const resolved = { package: "Mail_MCP", version: "2.3.1" };
    expect(checkResolvedVersion(pypiPin, resolved)).toEqual({ ok: true, value: resolved });
    // npm names are case-sensitive, so the same spelling change is another package.
    const npmLowercase = { ...npmPin, package: "mail-mcp" };
    expect(reason(checkResolvedVersion(npmLowercase, resolved))).toContain(
      'the package "Mail_MCP"',
    );
  });
});

describe("checkPinVersion", () => {
  it("refuses a pin with an unknown registry or a bad name", () => {
    const unknown = { ...npmPin, registry: "cargo" } as unknown as ConnectorPin;
    expect(reason(checkPinVersion(unknown))).toBe('the registry "cargo" isn\'t npm or pypi');
    expect(reason(checkPinVersion({ ...npmPin, package: "Mail-MCP" }))).toBe(
      '"Mail-MCP" isn\'t a valid npm package name',
    );
    expect(reason(checkPinVersion({ ...pypiPin, package: "mail-mcp-" }))).toContain(
      "isn't a valid pypi package name",
    );
  });

  it("refuses a resolved version against a pin that is itself refused", () => {
    const tagged = { ...npmPin, version: "latest" };
    expect(
      reason(checkResolvedVersion(tagged, { package: "@acme/mail-mcp", version: "latest" })),
    ).toContain("is a tag");
  });
});
