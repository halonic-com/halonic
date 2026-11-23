import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The agent host has no console on Windows, so srt's CLI must start srt-win
// hidden or every sandboxed command opens a console window (HAL-13197). Our
// srt patch adds the option; this fails when an srt upgrade drops it.
describe("srt's CLI on Windows", () => {
  it("starts srt-win with windowsHide", () => {
    const cli = readFileSync(
      createRequire(import.meta.url).resolve("@anthropic-ai/sandbox-runtime/dist/cli.js"),
      "utf8",
    );
    const start = cli.indexOf("const spawned = spawn(argv[0], argv.slice(1), {");
    expect(start).toBeGreaterThan(-1);
    const options = cli.slice(start, cli.indexOf("});", start));
    expect(options).toContain("windowsHide: true");
  });
});
