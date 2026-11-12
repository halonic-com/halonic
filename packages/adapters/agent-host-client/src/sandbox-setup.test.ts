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

const running = { running: "setup", last: null };

/** No real waiting between looks. */
const noPause = { pause: async () => {} };

describe("AgentHostSandboxSetup", () => {
  it("starts the setup through the host, sending nothing about it", async () => {
    const host = new FakeHost().answer("POST /v1/sandbox/setup", { status: 202, body: running });
    expect(await new AgentHostSandboxSetup(host).startSetUp()).toEqual(running);
    expect(host.calls).toContainEqual({ route: "POST /v1/sandbox/setup", body: {} });
  });

  it("follows the setup until it ends, however many looks that takes", async () => {
    const answers = [running, running, { running: null, last: finished }];
    const host = new FakeHost().answer("GET /v1/sandbox/setup", () => ok(answers.shift()));
    expect(await new AgentHostSandboxSetup(host, noPause).ended("setup")).toEqual(finished);
    expect(host.calls).toHaveLength(3);
  });

  it("answers nothing once the caller stops following, or when the host forgot", async () => {
    const host = new FakeHost().answer("GET /v1/sandbox/setup", ok(running));
    const stop = new AbortController();
    stop.abort();
    const setup = new AgentHostSandboxSetup(host, noPause);
    expect(await setup.ended("setup", { signal: stop.signal })).toBeUndefined();
    const restarted = new FakeHost().answer(
      "GET /v1/sandbox/setup",
      ok({ running: null, last: null }),
    );
    expect(await new AgentHostSandboxSetup(restarted, noPause).ended("setup")).toBeUndefined();
  });

  it("answers how many runs use the sandbox when the host refuses to remove it", async () => {
    const host = new FakeHost().answer("POST /v1/sandbox/remove", {
      status: 409,
      body: { error: { kind: "sandbox_in_use", message: "1 run is using the sandbox." }, runs: 1 },
    });
    expect(await new AgentHostSandboxSetup(host).startRemove()).toEqual({ inUse: 1 });
  });

  it("throws the host's refusal while the other one runs", async () => {
    const host = new FakeHost().answer(
      "POST /v1/sandbox/remove",
      refused(409, "sandbox_busy", "The sandbox is being set up. Wait until that ends."),
    );
    await expect(new AgentHostSandboxSetup(host).startRemove()).rejects.toMatchObject({
      kind: "sandbox_busy",
    });
  });

  it("refuses an answer of the wrong shape", async () => {
    const host = new FakeHost().answer("GET /v1/sandbox/setup", ok({ running: "always" }));
    await expect(new AgentHostSandboxSetup(host).status()).rejects.toMatchObject({
      kind: "answer_invalid",
    });
  });
});
