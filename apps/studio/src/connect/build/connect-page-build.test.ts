import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { build } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { connectPageMaxBytes, folderBytes } from "./connect-page-guard.ts";
import { connectPagePolicy, metaPolicies, policyProblems } from "./page-policy.ts";

// Vitest runs each package's tests from the package folder.
const appFolder = process.cwd();

let folder = "";

// The connect page as `tauri android build` builds it, with the app's own Vite config (and so its
// guard), into a folder of its own so `dist/connect` stays as it is. Vitest sets NODE_ENV to
// `test`, which Vite keeps, so the define puts React's production build in, as the app ships it.
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "halonic-connect-page-"));
  await build({
    root: appFolder,
    configFile: join(appFolder, "vite.config.ts"),
    mode: "production",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: { outDir: folder, emptyOutDir: true },
  });
}, 60_000);

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

verifies("studio.connect.bundle", () => {
  it("builds the connect page as it is today, within its limit", () => {
    expect(folderBytes(folder)).toBeGreaterThan(0);
    expect(folderBytes(folder)).toBeLessThanOrEqual(connectPageMaxBytes);
  });
});

verifies("studio.connect.no-network", () => {
  it("puts exactly the connect page's policy in the built connect.html's one policy tag", () => {
    const html = readFileSync(join(folder, "connect.html"), "utf8");

    expect(metaPolicies(html)).toEqual([connectPagePolicy]);
    expect(policyProblems(metaPolicies(html)[0] ?? "", { scriptHashes: false })).toEqual([]);
  });
});
