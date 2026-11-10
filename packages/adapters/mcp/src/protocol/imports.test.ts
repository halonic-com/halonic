import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const protocolFolder = new URL("./", import.meta.url);

/** The only package the protocol may import besides its own files. */
const allowedPackages = new Set(["@halonicjs/schema-kit"]);

/** The protocol's own source files, without tests. */
function protocolSources(): string[] {
  return readdirSync(protocolFolder, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();
}

/**
 * Every module a source file loads: `import … from "x"` and `export … from "x"`,
 * a side-effect `import "x"`, and a dynamic `import("x")`.
 */
function importedModules(source: string): string[] {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

/** Whether a relative import from `file` still points inside the protocol folder. */
function staysInProtocol(file: string, specifier: string): boolean {
  const target = new URL(specifier, new URL(file, protocolFolder));
  return target.href.startsWith(protocolFolder.href);
}

/** The imports of `file` that leave the protocol folder or reach a package it may not use. */
function foreignImports(file: string, source: string): string[] {
  return importedModules(source).filter((specifier) =>
    specifier.startsWith(".") ? !staysInProtocol(file, specifier) : !allowedPackages.has(specifier),
  );
}

verifies("mcp.protocol-portable", () => {
  it.each(protocolSources())(
    "%s imports only the protocol, schema-kit and nothing from Node",
    (file) => {
      const source = readFileSync(new URL(file, protocolFolder), "utf8");
      expect(foreignImports(file, source)).toEqual([]);
    },
  );

  describe("the type check without Node", () => {
    it("gives the protocol folder no Node types", () => {
      const config = JSON.parse(readFileSync(new URL("tsconfig.json", protocolFolder), "utf8"));
      expect(config.extends).toBe("@halonicjs/tooling-config/tsconfig/base.json");
      expect(config.compilerOptions?.types ?? []).toEqual([]);
    });

    it("runs as part of the package's typecheck", () => {
      const packageJson = JSON.parse(
        readFileSync(new URL("../../package.json", protocolFolder), "utf8"),
      );
      expect(packageJson.scripts.typecheck).toContain("tsc --noEmit -p src/protocol");
    });
  });

  describe("the import check itself", () => {
    it("finds an import that leaves the protocol folder", () => {
      const source = 'import { launch } from "../node/launcher.ts";';
      expect(foreignImports("session.ts", source)).toEqual(["../node/launcher.ts"]);
    });

    it("finds side-effect and dynamic imports", () => {
      const source = 'import "node:child_process";\nconst fs = await import("node:fs");';
      expect(foreignImports("session.ts", source)).toEqual(["node:child_process", "node:fs"]);
    });

    it("allows a test helper to import the protocol one folder up", () => {
      const source = 'import type { McpTransport } from "../transport.ts";';
      expect(foreignImports("test/fake-transport.ts", source)).toEqual([]);
    });
  });
});
