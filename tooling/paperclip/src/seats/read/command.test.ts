import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { runCommand } from "./command.ts";

const node = process.execPath;

verifies("paperclip.seats-read", () => {
  test("the program gets only the variables it is given", async () => {
    const result = await runCommand({
      program: node,
      args: ["-e", "process.stdout.write(Object.keys(process.env).sort().join(','))"],
      env: { CLAUDE_CONFIG_DIR: "/seats/seat-a" },
      timeoutMs: 10_000,
    });

    expect(result).toMatchObject({ kind: "exited", code: 0 });
    const names = result.kind === "exited" ? result.stdout.split(",") : [];
    expect(names).toContain("CLAUDE_CONFIG_DIR");
    expect(names).not.toContain("PATH");
  });

  test("a program past its time limit is stopped", async () => {
    const result = await runCommand({
      program: node,
      args: ["-e", "setTimeout(() => {}, 60000)"],
      env: {},
      timeoutMs: 200,
    });

    expect(result).toEqual({ kind: "timed-out" });
  });

  test("a failed or missing program ends with a non-zero code", async () => {
    const failed = await runCommand({
      program: node,
      args: ["-e", "process.exit(3)"],
      env: {},
      timeoutMs: 10_000,
    });
    const missing = await runCommand({
      program: "/nonexistent/claude",
      args: [],
      env: {},
      timeoutMs: 10_000,
    });

    expect(failed).toMatchObject({ kind: "exited", code: 3 });
    expect(missing).toMatchObject({ kind: "exited", code: 127 });
  });
});
