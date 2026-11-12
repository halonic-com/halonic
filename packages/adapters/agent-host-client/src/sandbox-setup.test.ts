import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostSandboxSetup } from "./sandbox-setup.ts";

const finished = {
  verb: "setup",
  result: {
    ok: false,
    outcome: "failed",
    reason: "Windows didn't accept the sandbox's network rules",
    code: 12,
  },
  finishedAt: "2026-11-09T09:12:00.000Z",
};

describe("AgentHostSandboxSetup", () => {
  it("sets the sandbox up through the host, sending nothing about it", async () => {
    const host = new FakeHost().answer("POST /v1/sandbox/setup", ok(finished));
    expect(await new AgentHostSandboxSetup(host).setUp()).toEqual(finished);
    expect(host.calls).toContainEqual({ route: "POST /v1/sandbox/setup", body: {} });
  });

  it("answers what runs and what ended last", async () => {
    const status = { running: "setup", last: finished };
    const host = new FakeHost().answer("GET /v1/sandbox/setup", ok(status));
    expect(await new AgentHostSandboxSetup(host).status()).toEqual(status);
  });

  it("answers how many runs use the sandbox when the host refuses to remove it", async () => {
    const host = new FakeHost().answer("POST /v1/sandbox/remove", {
      status: 409,
      body: { error: { kind: "sandbox_in_use", message: "1 run is using the sandbox." }, runs: 1 },
    });
    expect(await new AgentHostSandboxSetup(host).remove()).toEqual({ inUse: 1 });
  });

  it("answers a removal that ended", async () => {
    const removed = {
      verb: "remove",
      result: { ok: true },
      finishedAt: "2026-11-09T09:12:00.000Z",
    };
    const host = new FakeHost().answer("POST /v1/sandbox/remove", ok(removed));
    expect(await new AgentHostSandboxSetup(host).remove()).toEqual(removed);
  });

  it("throws the host's refusal while the other one runs", async () => {
    const host = new FakeHost().answer(
      "POST /v1/sandbox/remove",
      refused(409, "sandbox_busy", "The sandbox is being set up. Wait until that ends."),
    );
    await expect(new AgentHostSandboxSetup(host).remove()).rejects.toMatchObject({
      kind: "sandbox_busy",
    });
  });

  it("refuses an answer of the wrong shape", async () => {
    const host = new FakeHost().answer(
      "POST /v1/sandbox/setup",
      ok({ verb: "setup", result: { ok: "yes" } }),
    );
    await expect(new AgentHostSandboxSetup(host).setUp()).rejects.toMatchObject({
      kind: "answer_invalid",
    });
  });
});
