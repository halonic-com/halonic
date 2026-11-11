import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** The part of a Tauri config this test reads. */
interface TauriConfig {
  app?: { security?: { csp?: string } };
}

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");

function tauriConfig(file: string): TauriConfig {
  return JSON.parse(readFileSync(join(shellFolder, file), "utf8")) as TauriConfig;
}

/** The policy's directives, by name. */
function directives(csp: string): Map<string, string> {
  return new Map(
    csp
      .split(";")
      .map((directive) => directive.trim())
      .filter((directive) => directive !== "")
      .map((directive) => {
        const [name = "", ...values] = directive.split(/\s+/u);
        return [name, values.join(" ")];
      }),
  );
}

verifies("studio.pages-not-framed", () => {
  it("gives the app's pages a policy that no page may frame them", () => {
    const csp = tauriConfig("tauri.conf.json").app?.security?.csp ?? "";
    expect(directives(csp).get("frame-ancestors")).toBe("'none'");
  });

  it("keeps that policy on Android, which merges its config over the desktop one", () => {
    // A merged config that sets a policy of its own replaces the desktop one.
    expect(tauriConfig("tauri.android.conf.json").app?.security?.csp).toBeUndefined();
  });
});
