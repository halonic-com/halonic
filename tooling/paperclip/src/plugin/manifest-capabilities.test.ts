import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every plugin whose worker (or anything it imports) lists companies must ask for
// "companies.read", or Paperclip rejects each call at run time (halonic.seats, 24-26 Nov).
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USES_COMPANIES = /companies\.list\s*\(|\bcompaniesFor\s*\(/;

function pluginDirs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "node_modules") continue;
    const d = join(dir, e.name);
    if (existsSync(join(d, "manifest.ts")) && existsSync(join(d, "worker.ts"))) out.push(d);
    out.push(...pluginDirs(d));
  }
  return out;
}

function localImports(file: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const spec = resolve(dirname(file), m[1] as string);
    const hit = [spec, `${spec}.ts`, spec.replace(/\.js$/, ".ts"), join(spec, "index.ts")].find(
      (c) => existsSync(c) && c.endsWith(".ts") && !c.endsWith(".test.ts"),
    );
    if (hit) out.push(hit);
  }
  return out;
}

function workerUsesCompanies(entry: string): boolean {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    if (USES_COMPANIES.test(text)) return true;
    stack.push(...localImports(file, text));
  }
  return false;
}

describe("plugin manifests ask for the capabilities their workers use", () => {
  const dirs = pluginDirs(SRC);
  it("finds the plugins", () => {
    expect(dirs.length).toBeGreaterThanOrEqual(2);
  });
  for (const d of dirs) {
    it(`${d.slice(SRC.length + 1)}: companies.read when the worker lists companies`, async () => {
      if (!workerUsesCompanies(join(d, "worker.ts"))) return;
      const { manifest } = await import(join(d, "manifest.ts"));
      expect(manifest.capabilities).toContain("companies.read");
    });
  }
});
