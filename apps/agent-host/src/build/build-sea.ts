import { stripTypeScriptTypes } from "node:module";
import type { Payload } from "./payload.ts";

/**
 * Builds the agent host as one executable with Node's own single-executable
 * support (`node --build-sea`), so no extra library is needed. The running
 * Node is the base of the executable: build with the Node the repo pins.
 *
 * `pnpm build:sea` (scripts/build.ts) uses these to write `dist/halonic-agent-host`
 * (`.exe` on Windows).
 */

/** The file name of the executable on a platform. */
export function executableName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "halonic-agent-host.exe" : "halonic-agent-host";
}

/**
 * Turns the TypeScript entry point into the plain JavaScript Node embeds, and
 * puts each constant in front of it as `const NAME = <JSON>;`, such as the
 * version. Node removes the types itself.
 */
export function bundleEntry(source: string, constants: Readonly<Record<string, unknown>>): string {
  const declarations = Object.entries(constants).map(
    ([name, value]) => `const ${name} = ${JSON.stringify(value)};\n`,
  );
  return `${declarations.join("")}${stripTypeScriptTypes(source)}`;
}

/**
 * The settings file `node --build-sea` reads. Each payload file becomes an
 * asset whose key is its payload path.
 */
export function seaConfig(bundlePath: string, outputPath: string, payload: Payload): string {
  const assets = Object.fromEntries(payload.files.map(({ path, source }) => [path, source]));
  return `${JSON.stringify(
    {
      main: bundlePath,
      mainFormat: "module",
      output: outputPath,
      disableExperimentalSEAWarning: true,
      assets,
    },
    null,
    2,
  )}\n`;
}
