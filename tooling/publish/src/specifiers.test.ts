import { describe, expect, it } from "vitest";
import { packageOf, rewriteSpecifiers } from "./specifiers.ts";

describe("rewriteSpecifiers", () => {
  const swap = (specifier: string) =>
    specifier === "@halonicjs/ports" ? "./ports/index.js" : undefined;

  it("rewrites static, dynamic and type imports and leaves others alone", () => {
    const code = [
      'import { a } from "@halonicjs/ports";',
      'export { b } from "@halonicjs/ports";',
      'import "@halonicjs/ports";',
      'const c = await import("@halonicjs/ports");',
      'type D = typeof import("@halonicjs/ports");',
      'import { e } from "zod";',
    ].join("\n");
    const result = rewriteSpecifiers(code, swap);
    expect(result.match(/\.\/ports\/index\.js/g)).toHaveLength(5);
    expect(result).toContain('from "zod"');
  });

  it("keeps the quote style", () => {
    expect(rewriteSpecifiers("import x from '@halonicjs/ports'", swap)).toBe(
      "import x from './ports/index.js'",
    );
  });
});

describe("packageOf", () => {
  it("names the package of a bare specifier", () => {
    expect(packageOf("zod")).toBe("zod");
    expect(packageOf("zod/v4/core")).toBe("zod");
    expect(packageOf("@halonicjs/format/integration")).toBe("@halonicjs/format");
  });

  it("has no package for relative paths and node modules", () => {
    expect(packageOf("./a.js")).toBeUndefined();
    expect(packageOf("../a.js")).toBeUndefined();
    expect(packageOf("node:fs")).toBeUndefined();
  });
});
