import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as root from "./index.ts";
import * as entry from "./trust-url.ts";

// `@halonicjs/workspace/trust-url` is the one part of this package the engine
// reaches (HAL-16764), so it must stay a leaf that loads no `yaml`.
verifies("workspace.trust-content", () => {
  it("imports only std", () => {
    const source = readFileSync(join(import.meta.dirname, "trust-url.ts"), "utf8");
    const specifiers = [...source.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map(
      ([, specifier]) => specifier,
    );
    expect(specifiers).toEqual(["@halonicjs/std"]);
  });

  it("is the main entry point's own function", () => {
    expect(entry.trustUrl).toBe(root.trustUrl);
  });
});
