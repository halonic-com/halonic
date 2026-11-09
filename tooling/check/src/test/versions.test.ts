import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { runChecks } from "./fixture-repo.ts";

const fixtures = join(import.meta.dirname, "fixtures", "app-version");
const fixture = (name: string): string => readFileSync(join(fixtures, name), "utf8");

/** A fixture repo's Studio shell files, with the app at `version`. */
function shellFiles(version: string): Record<string, string> {
  return {
    "apps/studio/package.json": JSON.stringify({ name: "@halonicjs/app-studio", version }),
    "apps/studio/src-tauri/tauri.conf.json": fixture("tauri.conf.json"),
    "apps/studio/src-tauri/Cargo.toml": fixture("Cargo.toml"),
    "apps/studio/src-tauri/Cargo.lock": fixture("Cargo.lock"),
    "apps/studio/src-tauri/crates/connect/Cargo.toml": fixture("connect.Cargo.toml"),
  };
}

verifies("check.versions-agree", () => {
  test("pnpm check runs the versions rule on the repo's own files", () => {
    const versions = (version: string) =>
      runChecks([], { extraFiles: shellFiles(version), rules: ["versions"] }).map(
        ({ file, line }) => `${file}:${line ?? ""}`,
      );
    expect(versions("0.1.0")).toEqual([]);
    expect(versions("0.2.0")).toEqual([
      "apps/studio/src-tauri/tauri.conf.json:",
      "apps/studio/src-tauri/Cargo.toml:17",
      "apps/studio/src-tauri/Cargo.lock:7",
      "apps/studio/src-tauri/Cargo.lock:11",
    ]);
  });
});
