import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { PinnedPackage, PinRegistry } from "./connector-pin.ts";
import { readPackageSpec } from "./package-spec.ts";

/** The reason the spec was refused, or a failed test when it was accepted. */
function refused(registry: PinRegistry, spec: string): string {
  const result = readPackageSpec(registry, spec);
  if (result.ok) {
    throw new Error(
      `expected "${spec}" to be refused, but it read ${JSON.stringify(result.value)}`,
    );
  }
  return result.error;
}

verifies("app.connector-pin-spec", () => {
  it("accepts one exact version, and keeps the name and version", () => {
    const accepted: [PinRegistry, string, PinnedPackage][] = [
      ["npm", "@acme/mail-mcp@2.3.1", { package: "@acme/mail-mcp", version: "2.3.1" }],
      [
        "npm",
        "@acme/mail-mcp@2.4.0-beta.1",
        { package: "@acme/mail-mcp", version: "2.4.0-beta.1" },
      ],
      ["npm", "mail-mcp@0.0.0", { package: "mail-mcp", version: "0.0.0" }],
      ["pypi", "mail-mcp==2.3.1", { package: "mail-mcp", version: "2.3.1" }],
      ["pypi", "mail-mcp==1!2.0rc1.post1", { package: "mail-mcp", version: "1!2.0rc1.post1" }],
      ["pypi", "Mail_MCP == 2024.1.dev3", { package: "Mail_MCP", version: "2024.1.dev3" }],
    ];
    for (const [registry, spec, expected] of accepted) {
      expect(readPackageSpec(registry, spec), spec).toEqual({ ok: true, value: expected });
    }
  });

  it("refuses a spec with no version", () => {
    expect(refused("npm", "@acme/mail-mcp")).toBe(
      '"@acme/mail-mcp" names no version, so it would start whatever is newest; pin one, such as @acme/mail-mcp@2.3.1',
    );
    expect(refused("pypi", "mail-mcp")).toBe(
      '"mail-mcp" names no version, so it would start whatever is newest; pin one, such as mail-mcp==2.3.1',
    );
  });

  it("refuses a tag", () => {
    expect(refused("npm", "@acme/mail-mcp@latest")).toBe(
      'the version "latest" is a tag, which can move to another version; pin an exact version, such as 2.3.1',
    );
    expect(refused("npm", "@acme/mail-mcp@next")).toContain("is a tag");
    expect(refused("pypi", "mail-mcp==latest")).toContain("is a tag");
  });

  it("refuses a range", () => {
    for (const spec of ["@acme/mail-mcp@^2.3.1", "@acme/mail-mcp@2.x"]) {
      expect(refused("npm", spec), spec).toContain("is a range");
    }
    for (const spec of ["mail-mcp>=2", "mail-mcp~=2.3", "mail-mcp!=2.3.0", "mail-mcp==2.3.1,<3"]) {
      expect(refused("pypi", spec), spec).toBe(
        `"${spec}" names a range, which can match more than one version; use ==`,
      );
    }
    expect(refused("pypi", "mail-mcp==2.*")).toContain("is a range");
  });

  it("refuses a URL", () => {
    for (const [registry, spec] of [
      ["npm", "https://example.com/mail-mcp.tgz"],
      ["npm", "@acme/mail-mcp@https://example.com/mail-mcp.tgz"],
      ["pypi", "mail-mcp @ https://example.com/mail_mcp-2.3.1.whl"],
    ] as const) {
      expect(refused(registry, spec), spec).toBe(
        `"${spec}" is a URL, not a package from the registry at an exact version`,
      );
    }
  });

  it("refuses a git source", () => {
    for (const [registry, spec] of [
      ["npm", "git+https://example.com/acme/mail-mcp.git"],
      ["npm", "github:acme/mail-mcp"],
      ["npm", "acme/mail-mcp"],
      ["npm", "@acme/mail-mcp@git+ssh://example.com/acme/mail-mcp"],
      ["pypi", "mail-mcp @ git+https://example.com/acme/mail-mcp"],
    ] as const) {
      expect(refused(registry, spec), spec).toBe(
        `"${spec}" is a git source, not a package from the registry at an exact version`,
      );
    }
  });

  it("refuses a local path and an npm alias", () => {
    for (const spec of [
      "./mail-mcp",
      "../mail-mcp",
      "/opt/mail-mcp",
      "file:mail-mcp",
      "C:\\mail-mcp", // leak-guard: allow absolute-path a made-up Windows path the check must refuse
    ]) {
      expect(refused("npm", spec), spec).toContain("is a local path");
    }
    expect(refused("pypi", "./mail_mcp-2.3.1.whl")).toContain("is a local path");
    for (const spec of ["mail@npm:@acme/mail-mcp@2.3.1", "npm:@acme/mail-mcp@2.3.1"]) {
      expect(refused("npm", spec), spec).toContain("is an alias for another package");
    }
  });
});

describe("readPackageSpec", () => {
  it("refuses a PyPI spec in another form", () => {
    expect(refused("pypi", "mail-mcp@2.3.1")).toBe(
      '"mail-mcp@2.3.1" isn\'t written as name==version, such as mail-mcp==2.3.1',
    );
    expect(refused("pypi", "mail-mcp 2.3.1")).toContain("isn't written as name==version");
    expect(refused("pypi", "mail-mcp; python_version>'3'")).toContain(
      "isn't written as name==version",
    );
    expect(refused("pypi", "mail-mcp[smtp]==2.3.1")).toBe(
      '"mail-mcp[smtp]==2.3.1" names extras, which a pin can\'t hold',
    );
    expect(refused("pypi", "mail-mcp===2.3.1")).toContain("uses ===");
  });

  it("refuses a name the registry wouldn't accept", () => {
    expect(refused("npm", "Mail-MCP@2.3.1")).toBe('"Mail-MCP" isn\'t a valid npm package name');
    expect(refused("pypi", "mail-mcp-==2.3.1")).toContain("isn't a valid pypi package name");
  });
});
