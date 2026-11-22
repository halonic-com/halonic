import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { manifest } from "./manifest.ts";
import { pluginNamespace } from "./namespace.ts";

const migrationsDir = new URL("./migrations/", import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(new URL(name, migrationsDir), "utf8") }));

verifies("paperclip.seats-settings", () => {
  test("starts with no seats and moving agents off", () => {
    const properties = manifest.instanceConfigSchema?.["properties"] as Record<
      string,
      { default?: unknown }
    >;
    expect(properties["movesEnabled"]?.default).toBe(false);
    expect(properties["seats"]?.default).toEqual([]);
  });

  test("migrations name only the schema Paperclip gives the plugin", () => {
    const schema = pluginNamespace(manifest.id, manifest.database?.namespaceSlug ?? manifest.id);
    expect(schema).toBe("plugin_seats_2a33967373");
    expect(migrations.length).toBeGreaterThan(0);
    for (const { sql } of migrations) {
      const code = sql.replace(/--.*$/gm, "");
      for (const statement of code.split(";").filter((text) => text.trim() !== "")) {
        expect(statement.trim()).toMatch(/^CREATE (TABLE|INDEX|UNIQUE INDEX) /);
        const named = [...statement.matchAll(/\b([a-z_][a-z0-9_]*)\.[a-z_]+\b/g)].map(
          (match) => match[1],
        );
        expect(named.length).toBeGreaterThan(0);
        expect(named.every((name) => name === schema)).toBe(true);
      }
    }
  });

  test("migration comments have no quote marks, which Paperclip's checks read as text", () => {
    for (const { sql } of migrations) {
      const comments = sql.match(/--.*$/gm) ?? [];
      expect(comments.filter((comment) => /['"]/.test(comment))).toEqual([]);
    }
  });
});
