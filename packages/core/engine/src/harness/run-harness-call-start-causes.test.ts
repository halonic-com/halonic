import type { SandboxCheck } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runFailureReasonOf } from "../run/run-failure-reason-of.ts";
import { runCallOn as runOn } from "./harness-call-test-kit.test-helper.ts";
import { harnessPorts } from "./harness-test-kit.test-helper.ts";

/** A sandbox check that passes the first time it is asked, and gives `later` after that. */
function checkPassingOnce(later: SandboxCheck): () => Promise<SandboxCheck> {
  let asked = 0;
  return async () => {
    asked += 1;
    return asked === 1 ? { ok: true, reason: null, missing: [] } : later;
  };
}

verifies("engine.run-harness-failures", () => {
  it("gives the check's reason code when the sandbox doesn't open and the check now fails", async () => {
    const ports = harnessPorts();
    ports.sandbox.openError = new Error("bwrap: setting up uid map: Permission denied");
    ports.sandbox.check = checkPassingOnce({
      ok: false,
      reason: "user-namespaces-restricted",
      missing: ["user namespaces are restricted"],
    });

    const { error } = await runOn(ports);

    expect(runFailureReasonOf(error)).toEqual({
      reason: "sandbox-start-failed",
      sandboxReason: "user-namespaces-restricted",
    });
  });

  it("gives no reason code when the sandbox doesn't open and the check still passes", async () => {
    const ports = harnessPorts();
    ports.sandbox.openError = new Error("bwrap: setting up uid map: Permission denied");

    const { error } = await runOn(ports);

    expect(runFailureReasonOf(error)).toEqual({ reason: "sandbox-start-failed" });
  });

  it.each([
    [{ status: "missing" }, "not-installed"],
    [{ status: "signed-out", version: "2.1.0" }, "signed-out"],
  ] as const)(
    "names the cause of a harness that didn't start when detect() says %j",
    async (detection, harnessCause) => {
      const ports = harnessPorts();
      ports.harness.error = new Error("claude: command not found");
      ports.harness.detection = detection;

      const { error } = await runOn(ports);

      expect(runFailureReasonOf(error)).toEqual({ reason: "harness-start-failed", harnessCause });
      expect(ports.harness.detectedFor).toHaveLength(1);
    },
  );

  it("names no cause of a harness that didn't start when detect() finds nothing wrong", async () => {
    const ports = harnessPorts();
    ports.harness.error = new Error("claude: exited with 1");
    ports.harness.detection = { status: "failed", error: "It didn't answer." };

    const { error } = await runOn(ports);

    expect(runFailureReasonOf(error)).toEqual({ reason: "harness-start-failed" });
  });

  it("names no cause of a harness that didn't start when detect() throws", async () => {
    const ports = harnessPorts();
    ports.harness.error = new Error("claude: exited with 1");
    ports.harness.detect = async () => {
      throw new Error("detect broke");
    };

    const { error } = await runOn(ports);

    expect(runFailureReasonOf(error)).toEqual({ reason: "harness-start-failed" });
  });
});

verifies("engine.this-computer-start-failed", () => {
  it("fails with this-computer-start-failed and the launcher's reason when the launcher doesn't open", async () => {
    const ports = harnessPorts();
    ports.placeOnThisComputer();
    ports.thisComputer.openError = new Error(
      "a program started without a fence can't reach a bridge on a Unix socket\nat checkBridge",
    );

    const { error, written } = await runOn(ports);

    expect(runFailureReasonOf(error)).toEqual({ reason: "this-computer-start-failed" });
    expect(error).toMatchObject({
      message: "a program started without a fence can't reach a bridge on a Unix socket",
    });
    // Nothing asks a sandbox why: there is none in this run.
    expect(written.map((event) => event.type)).toEqual(["sandbox.started"]);
    expect(ports.steps).toEqual(["bridge.open", "bridge.close"]);
  });

  it("logs a fixed text, not the launcher's message, when that holds something shaped like a key", async () => {
    const ports = harnessPorts();
    ports.placeOnThisComputer();
    ports.thisComputer.openError = new Error(`can't start with the key sk-${"aB3".repeat(8)}`);

    const { error } = await runOn(ports);

    expect(runFailureReasonOf(error)).toEqual({ reason: "this-computer-start-failed" });
    expect(error).toMatchObject({ message: "Halonic can't tell why" });
  });
});
