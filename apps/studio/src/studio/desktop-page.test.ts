import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

/** The parts of a Tauri config these tests read. */
interface TauriConfig {
  build?: {
    beforeDevCommand?: string | { script: string; wait?: boolean };
    beforeBuildCommand?: string;
    frontendDist?: string;
  };
  app?: { windows?: { url?: string }[] };
}

// Vitest runs each package's tests from the package folder.
const appFolder = process.cwd();
const shellFolder = join(appFolder, "src-tauri");

function tauriConfig(file: string): TauriConfig {
  return JSON.parse(readFileSync(join(shellFolder, file), "utf8")) as TauriConfig;
}

/** Where Vite builds the page for a mode, from the app folder. */
function viteOutDir(mode: string): string {
  if (typeof viteConfig !== "function") {
    throw new Error("vite.config.ts no longer picks its page by mode");
  }
  const config = viteConfig({ command: "build", mode });
  if (config instanceof Promise) {
    throw new Error("vite.config.ts no longer returns its config straight away");
  }
  return resolve(appFolder, config.build?.outDir ?? "dist");
}

verifies("studio.desktop-page", () => {
  it("opens the desktop window on studio.html from the folder Vite builds the Studio into", () => {
    const desktop = tauriConfig("tauri.conf.json");

    expect(resolve(shellFolder, desktop.build?.frontendDist ?? "")).toBe(viteOutDir("studio"));
    expect(desktop.app?.windows?.map((window) => window.url)).toEqual(["studio.html"]);
  });

  it("builds both pages before tauri build and tauri dev", () => {
    const desktop = tauriConfig("tauri.conf.json");

    expect(desktop.build?.beforeBuildCommand).toBe("pnpm run build");
    expect(desktop.build?.beforeDevCommand).toEqual({ script: "pnpm run build", wait: true });
  });

  it("keeps the Android window on connect.html from the folder Vite builds the connect page into", () => {
    const android = tauriConfig("tauri.android.conf.json");

    expect(resolve(shellFolder, android.build?.frontendDist ?? "")).toBe(viteOutDir("production"));
    expect(android.app?.windows?.map((window) => window.url)).toEqual(["connect.html"]);
  });
});
