import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { rewriteSpecifiers } from "./specifiers.ts";
import { requireDeclaredImports, stagePackage } from "./stage.ts";

const scratch = mkdtempSync(join(tmpdir(), "stage-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

verifies("publish.staged-package", () => {
  it("stages the kit with no unpublished package inside", () => {
    const staged = stagePackage(
      root,
      join(root, "packages/adapters/integration-kit"),
      join(scratch, "kit"),
    );
    const manifest = JSON.parse(readFileSync(join(staged.directory, "package.json"), "utf8"));
    expect(manifest.name).toBe("@halonicjs/integration-kit");
    expect(Object.keys(manifest.dependencies)).toEqual(["zod"]);

    const imported = new Set<string>();
    for (const file of readdirSync(join(staged.directory, "dist"), {
      recursive: true,
      encoding: "utf8",
    })) {
      if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
      rewriteSpecifiers(readFileSync(join(staged.directory, "dist", file), "utf8"), (specifier) => {
        if (!specifier.startsWith(".") && !specifier.startsWith("node:")) imported.add(specifier);
        return undefined;
      });
    }
    expect([...imported].filter((name) => name.startsWith("@halonicjs/"))).toEqual([]);
  }, 120_000);

  it("names the published kit in the conformance suite, which depends on it", () => {
    const staged = stagePackage(
      root,
      join(root, "packages/testing/integration"),
      join(scratch, "suite"),
    );
    const manifest = JSON.parse(readFileSync(join(staged.directory, "package.json"), "utf8"));
    expect(manifest.dependencies["@halonicjs/integration-kit"]).toBe("^0.1.0");
    const entry = readFileSync(
      join(staged.directory, "dist/testing/integration/src/checks.js"),
      "utf8",
    );
    expect(entry).toContain('"@halonicjs/integration-kit"');
    expect(entry).not.toContain("adapter-integration-kit");
  }, 120_000);
});

verifies("publish.staged-package", () => {
  it("fails on an import the package does not declare", () => {
    const distribution = mkdtempSync(join(tmpdir(), "stage-test-"));
    try {
      writeFileSync(join(distribution, "a.js"), 'import { pad } from "left-pad";\n');
      const config = { name: "@acme/thing", aliases: {}, dependencies: {}, peerDependencies: {} };
      expect(() => requireDeclaredImports(distribution, config)).toThrow(
        /a\.js imports "left-pad"/,
      );
    } finally {
      rmSync(distribution, { recursive: true, force: true });
    }
  });
});

verifies("publish.staged-package", () => {
  it("takes the outside dependency ranges from the catalog", () => {
    const catalog = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    for (const folder of ["adapters/integration-kit", "testing/integration"]) {
      const manifest = JSON.parse(
        readFileSync(join(root, "packages", folder, "package.json"), "utf8"),
      );
      for (const [name, range] of Object.entries(manifest.halonic.publish.dependencies)) {
        if (name.startsWith("@halonicjs/")) continue;
        const pinned = new RegExp(`^  ${name}: (\\S+)$`, "m").exec(catalog)?.[1];
        expect(range, `${folder}: ${name}`).toBe(`^${pinned}`);
      }
    }
  });
});
