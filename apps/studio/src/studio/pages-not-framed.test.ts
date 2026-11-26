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

  it("keeps that rule on Android, whose config sets the connect page's own policy", () => {
    // A merged config that sets a policy of its own replaces the desktop one (studio.connect.no-network).
    const csp = tauriConfig("tauri.android.conf.json").app?.security?.csp ?? "";
    expect(directives(csp).get("frame-ancestors")).toBe("'none'");
  });
});

verifies("studio.page-policy-closed", () => {
  it.each(["object-src", "base-uri", "form-action", "frame-src"])(
    "gives the desktop pages a policy that says %s 'none', as Android's does",
    (name) => {
      const csp = tauriConfig("tauri.conf.json").app?.security?.csp ?? "";
      const android = tauriConfig("tauri.android.conf.json").app?.security?.csp ?? "";
      expect(directives(csp).get(name)).toBe("'none'");
      expect(directives(android).get(name)).toBe("'none'");
    },
  );
});
