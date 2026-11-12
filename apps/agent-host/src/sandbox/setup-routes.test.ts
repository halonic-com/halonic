import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import type { SandboxSession } from "@halonicjs/ports";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { SessionTable } from "./session-table.ts";
import { type SandboxSetter, SetupJobs, setupRoutes } from "./setup-routes.ts";

const token = randomLaunchToken();
const authorization = { authorization: `Bearer ${token}` };
const at = new Date("2026-11-09T09:12:00.000Z");

/** A setter whose setup and removal wait until the test ends them, counting the calls. */
function heldSetter() {
  const calls = { setUp: 0, remove: 0 };
  let endSetUp: (result: SandboxSetup) => void = () => {};
  let endRemove: (result: SandboxRemoval) => void = () => {};
  const setter: SandboxSetter = {
    setUp: () => {
      calls.setUp++;
      return new Promise((resolve) => {
        endSetUp = resolve;
      });
    },
    remove: () => {
      calls.remove++;
      return new Promise((resolve) => {
        endRemove = resolve;
      });
    },
  };
  return {
    setter,
    calls,
    endSetUp: (result: SandboxSetup) => endSetUp(result),
    endRemove: (result: SandboxRemoval) => endRemove(result),
  };
}

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function started(setter: SandboxSetter, sessions = new SessionTable()): Promise<string> {
  server = await startHostServer(token, setupRoutes(new SetupJobs(setter, () => at), sessions));
  return server.url;
}

function post(url: string, path: string, body: unknown = {}): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function status(url: string): Promise<unknown> {
  return (await fetch(`${url}/v1/sandbox/setup`, { headers: authorization })).json();
}

/** Lets the job's end settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("setupRoutes", () => {
  it("starts the setup, answers at once, and keeps how it ended", async () => {
    const held = heldSetter();
    const url = await started(held.setter);
    const response = await post(url, "/v1/sandbox/setup");
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ running: "setup", last: null });
    held.endSetUp({ ok: true });
    await settle();
    const finished = { verb: "setup", result: { ok: true }, finishedAt: at.toISOString() };
    expect(await status(url)).toEqual({ running: null, last: finished });
  });

  it("joins a setup that runs rather than ask Windows again", async () => {
    const held = heldSetter();
    const url = await started(held.setter);
    await post(url, "/v1/sandbox/setup");
    const second = await post(url, "/v1/sandbox/setup");
    expect(await second.json()).toEqual({ running: "setup", last: null });
    const cancelled = {
      ok: false,
      outcome: "cancelled",
      reason: "the administrator prompt was cancelled; nothing changed",
    } as const;
    held.endSetUp(cancelled);
    await settle();
    expect(await status(url)).toMatchObject({ running: null, last: { result: cancelled } });
    expect(held.calls.setUp).toBe(1);
  });

  it("refuses a removal while the setup runs", async () => {
    const held = heldSetter();
    const url = await started(held.setter);
    await post(url, "/v1/sandbox/setup");
    const response = await post(url, "/v1/sandbox/remove");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { kind: "sandbox_busy" } });
    expect(held.calls.remove).toBe(0);
    held.endSetUp({ ok: true });
  });

  it("removes the sandbox when nothing sandboxed runs", async () => {
    const held = heldSetter();
    const url = await started(held.setter);
    expect((await post(url, "/v1/sandbox/remove")).status).toBe(202);
    held.endRemove({ ok: true });
    await settle();
    expect(await status(url)).toMatchObject({
      running: null,
      last: { verb: "remove", result: { ok: true } },
    });
  });

  it("refuses a removal before any prompt while a sandboxed run goes on, and says how many", async () => {
    const held = heldSetter();
    const sessions = new SessionTable();
    const session = {
      fence: { state: "fenced" },
      profile: { timeLimitMs: 60_000 },
      close: async () => {},
      onBlocked: () => () => {},
    };
    await sessions.add(session as unknown as SandboxSession);
    const url = await started(held.setter, sessions);
    const response = await post(url, "/v1/sandbox/remove");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { kind: "sandbox_in_use", message: "1 run is using the sandbox." },
      runs: 1,
    });
    expect(held.calls.remove).toBe(0);
    await sessions.closeAll();
  });

  it("takes nothing from the caller about the setup", async () => {
    const held = heldSetter();
    const url = await started(held.setter);
    const response = await post(url, "/v1/sandbox/setup", { allowLoopback: true });
    expect(response.status).toBe(400);
    expect(held.calls.setUp).toBe(0);
  });

  it("frees the slot when a setup throws, which it never should", async () => {
    const setter: SandboxSetter = {
      setUp: async () => {
        throw new Error("broken");
      },
      remove: async () => ({ ok: true }),
    };
    const url = await started(setter);
    await post(url, "/v1/sandbox/setup");
    await settle();
    expect(await status(url)).toMatchObject({
      running: null,
      last: { result: { ok: false, outcome: "failed", reason: "broken" } },
    });
  });
});
