import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.\/[^"']+)["']/g;
const SCREEN_IMPORT =
  /(?:from|import)\s*\(?\s*["'](?:react|@halonicjs\/studio-kit)(?:\/[^"']*)?["']/;

/** Every file under `src/phone/` that `entry` reaches through relative imports, `entry` included. */
function reachableFrom(dir: string, entry: string): string[] {
  const seen = new Set<string>();
  const toVisit = [entry];
  for (let name = toVisit.pop(); name !== undefined; name = toVisit.pop()) {
    if (seen.has(name)) continue;
    seen.add(name);
    for (const match of readFileSync(join(dir, name), "utf8").matchAll(RELATIVE_IMPORT)) {
      toVisit.push((match[1] ?? "").slice("./".length));
    }
  }
  return [...seen].sort();
}

// `./phone-client` is for code that draws nothing, which typechecks without JSX or the DOM.
it("nothing reachable from the client entry is a screen or imports React or the kit", () => {
  const dir = import.meta.dirname;
  const offenders = reachableFrom(dir, "client.ts").filter(
    (name) => name.endsWith(".tsx") || SCREEN_IMPORT.test(readFileSync(join(dir, name), "utf8")),
  );
  expect(offenders).toEqual([]);
});
