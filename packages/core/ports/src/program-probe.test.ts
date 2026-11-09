import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { HarnessDetection } from "./harness.ts";
import type { ProgramProbe, ProgramProbeResult } from "./program-probe.ts";

/** A probe that answers from a fixed list, as a harness's tests use it until `sandbox-host` lands. */
function fixedProbe(answers: Record<string, ProgramProbeResult>): ProgramProbe {
  return { ask: async (program) => answers[program] ?? { status: "missing" } };
}

/** A cut-down `detect()`, to show every answer becomes a `HarnessDetection`. */
async function detectCodex(probe: ProgramProbe): Promise<HarnessDetection> {
  const answer = await probe.ask("codex", ["--version"]);
  if (answer.status === "missing") return { status: "missing" };
  if (answer.status === "failed") return { status: "failed", error: answer.error };
  return { status: "ready", version: answer.stdout.trim().replace(/^codex-cli /, "") };
}

verifies("ports.program-probe", () => {
  it("reports a program that isn't installed as missing", async () => {
    expect(await detectCodex(fixedProbe({}))).toEqual({ status: "missing" });
  });

  it("gives the path, the exit code and the output of a program that ran", async () => {
    const ran: ProgramProbeResult = {
      status: "ran",
      path: "/usr/local/bin/codex",
      code: 0,
      stdout: "codex-cli 0.58.0\n",
      stderr: "",
    };
    expect(await detectCodex(fixedProbe({ codex: ran }))).toEqual({
      status: "ready",
      version: "0.58.0",
    });
  });

  it("needs a reason on a program that couldn't run", () => {
    const failed: ProgramProbeResult = {
      status: "failed",
      path: "/usr/local/bin/codex",
      error: "It didn't answer within 5 seconds.",
    };
    // @ts-expect-error: a failed answer says why
    const unexplained: ProgramProbeResult = { status: "failed", path: "/usr/local/bin/codex" };
    expect([failed, unexplained]).toHaveLength(2);
  });
});
