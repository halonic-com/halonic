import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { studioWatchedFileLimit } from "./studio-watch-limit.ts";

/**
 * The shell's folder watch, which sets its own limit. Its path is also a
 * test input in this package's `turbo.json`, so a change to it re-runs
 * this test.
 */
const shellWatch = new URL(
  "../../studio/src-tauri/crates/workspace-files/src/watch.rs",
  import.meta.url,
);

/** `MAX_WATCHED_FILES` as the Rust source sets it, such as `50_000`, as a number. */
function shellLimit(): number {
  const source = readFileSync(shellWatch, "utf8");
  const match = /pub const MAX_WATCHED_FILES: usize = ([\d_]+);/u.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("watch.rs no longer sets MAX_WATCHED_FILES as this test reads it.");
  }
  return Number(match[1].replaceAll("_", ""));
}

verifies("cli.doctor-watch-limit", () => {
  it("warns at the same limit as the shell's folder watch", () => {
    expect(studioWatchedFileLimit).toBe(shellLimit());
  });
});
