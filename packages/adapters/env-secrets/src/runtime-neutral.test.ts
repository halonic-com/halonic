import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

verifies("env-secrets.runtime-neutral", () => {
  it("uses no Node APIs outside its tests, so the environment always comes in as a parameter", () => {
    const sources = readdirSync(new URL(".", import.meta.url)).filter(
      (file) => file.endsWith(".ts") && !file.includes(".test"),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      // Doc comments may name `process.env` as what the CLI passes in; only code counts.
      const code = readFileSync(new URL(file, import.meta.url), "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(code, file).not.toMatch(/from\s+["']node:|\bBuffer\.\w|\bprocess\./);
    }
  });
});
