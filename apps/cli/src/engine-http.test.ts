import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { engineHttp } from "./engine-http.ts";

const sourceFolder = dirname(fileURLToPath(import.meta.url));

/** The non-test source files under `folder`, with their text. */
function sources(folder: string): { path: string; text: string }[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sources(path);
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) return [];
    return [{ path, text: readFileSync(path, "utf8") }];
  });
}

describe("the engine's HTTP client", () => {
  it("is never the global fetch in the CLI's setup", () => {
    const wiring = sources(sourceFolder).filter(({ text }) =>
      /\(url, init\) => fetch\(url, init\)/.test(text),
    );
    expect(wiring.map(({ path }) => path)).toEqual([]);
  });

  it("refuses an address the host class doesn't allow, without a request", async () => {
    await expect(engineHttp().fetch("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
  });
});
