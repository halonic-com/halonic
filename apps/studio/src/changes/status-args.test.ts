import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { statusArgs } from "./status-args.ts";

describe("statusArgs", () => {
  it("asks git only for what the shell's allow-list takes for status", () => {
    const rust = readFileSync(
      new URL("../../src-tauri/crates/git-guard/src/allow_list.rs", import.meta.url),
      "utf8",
    );
    const block = rust.slice(rust.indexOf('name: "status"'), rust.indexOf('name: "diff"'));
    const [subcommand, ...options] = statusArgs;
    expect(subcommand).toBe("status");
    for (const option of options) {
      const [flag, value] = option.split("=");
      const listed = value === undefined ? `Flag("${flag}")` : `Joined("${flag}"`;
      expect(block, option).toContain(listed);
    }
  });
});
