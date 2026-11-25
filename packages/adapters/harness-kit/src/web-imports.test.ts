import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ModuleSource, nonWebImports, valueImports } from "./web-imports.test-helper.ts";

/** The three Web entries, by their place next to this package. */
const webEntries = [
  "src/web.ts",
  "../harness-claude-code/src/web.ts",
  "../harness-codex/src/web.ts",
].map((path) => fileURLToPath(new URL(path, new URL("..", import.meta.url))));

/** Modules held in memory, for checking the walker itself. */
function memoryModules(files: Readonly<Record<string, string>>): ModuleSource {
  return {
    read: (file) => {
      const text = files[file];
      if (text === undefined) throw new Error(`No module ${file}`);
      return text;
    },
    resolve: (specifier) => {
      if (files[specifier] === undefined) throw new Error(`Can't resolve ${specifier}`);
      return specifier;
    },
  };
}

verifies("harness-kit.web-entries", () => {
  it("reaches no node: or third-party module from the three Web entries", () => {
    expect(nonWebImports(webEntries)).toEqual([]);
  });

  describe("the walker", () => {
    it("follows a re-export into node:", () => {
      const modules = memoryModules({
        "./entry.ts": 'export { join } from "./paths.ts";\n',
        "./paths.ts": 'export { join } from "node:path";\n',
      });
      expect(nonWebImports(["./entry.ts"], modules)).toEqual(["./paths.ts -> node:path"]);
    });

    it("fails on an import it can't resolve", () => {
      const modules = memoryModules({ "./entry.ts": 'import { a } from "./missing.ts";\n' });
      expect(nonWebImports(["./entry.ts"], modules)).toEqual([
        "./entry.ts -> ./missing.ts (unresolved)",
      ]);
    });

    it("lists a third-party package", () => {
      const modules = memoryModules({ "./entry.ts": 'import "left-pad";\n' });
      expect(nonWebImports(["./entry.ts"], modules)).toEqual(["./entry.ts -> left-pad"]);
    });

    it("skips only imports and re-exports of types", () => {
      const text = [
        'import type { A } from "node:path";',
        'export type { B } from "node:fs";',
        "import {",
        "  type C,",
        "  d,",
        '} from "node:os";',
        'const e = await import("node:url");',
      ].join("\n");
      expect(valueImports(text)).toEqual(["node:os", "node:url"]);
    });
  });
});
