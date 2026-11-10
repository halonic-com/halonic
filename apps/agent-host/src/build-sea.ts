import { stripTypeScriptTypes } from "node:module";

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
 * puts the version in front of it. Node removes the types itself.
 */
export function bundleEntry(source: string, version: string): string {
  return `const HALONIC_AGENT_HOST_VERSION = ${JSON.stringify(version)};\n${stripTypeScriptTypes(source)}`;
}

/** The settings file `node --build-sea` reads. */
export function seaConfig(bundlePath: string, outputPath: string): string {
  return `${JSON.stringify(
    {
      main: bundlePath,
      mainFormat: "module",
      output: outputPath,
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  )}\n`;
}
