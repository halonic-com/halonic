import { readFileSync } from "node:fs";
import { compatibilityDate } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

/**
 * The adapter's list of class names, read from its own file: the package's entry
 * point imports `cloudflare:workers`, which Node doesn't have, and the file is
 * plain data.
 */
async function fixedClassNames(): Promise<readonly string[]> {
  const entry = import.meta.resolve("@halonicjs/adapter-cloudflare-durable");
  const module: { durableObjectClassNames: readonly string[] } = await import(
    new URL("class-names.ts", entry).href
  );
  return module.durableObjectClassNames;
}

/** The quoted names in a list such as `new_sqlite_classes = ["A", "B"]`. */
function quotedNames(list: string): string[] {
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

function valuesOf(key: string): string[] {
  return [...config.matchAll(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "gm"))].map(
    (match) => match[1] ?? "",
  );
}

verifies("runtime.durable-object-migrations", () => {
  describe("wrangler.toml", () => {
    it("migrates exactly the fixed Durable Object classes, with SQLite storage", async () => {
      const migrated = [...config.matchAll(/^new_sqlite_classes\s*=\s*\[([^\]]*)\]/gm)].flatMap(
        (match) => quotedNames(match[1] ?? ""),
      );
      expect(migrated.sort()).toEqual([...(await fixedClassNames())].sort());
      expect(config).not.toMatch(/^new_classes\s*=/m);
    });

    it("binds each class once, and nothing else", async () => {
      expect(valuesOf("class_name").sort()).toEqual([...(await fixedClassNames())].sort());
    });

    it("never deletes or renames a class", () => {
      expect(config).not.toMatch(/^(deleted_classes|renamed_classes)\s*=/m);
    });

    it("triggers the cron every minute, so the routine tick and the watchdog run", () => {
      expect(config).toMatch(/^\[triggers\]\s*\ncrons\s*=\s*\["\* \* \* \* \*"\]/m);
    });

    it("runs with the compatibility date the harness tests with", () => {
      expect(valuesOf("compatibility_date")).toEqual([compatibilityDate]);
    });
  });
});
