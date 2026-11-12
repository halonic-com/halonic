import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

verifies("password-pbkdf2.runtime-neutral", () => {
  it("uses no Node APIs outside its tests, so it runs in workerd", () => {
    const sources = readdirSync(new URL(".", import.meta.url)).filter(
      (file) => file.endsWith(".ts") && !file.includes(".test"),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(text, file).not.toMatch(/from\s+["']node:|\bBuffer\.\w|\bprocess\./);
    }
  });
});
