import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import type { SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { removeThroughShellRoutes, type ShellRemoval } from "./remove-through-shell-routes.ts";
import { SessionTable } from "./session-table.ts";
import { type SandboxSetter, SetupJobs } from "./setup-routes.ts";

const token = randomLaunchToken();

/** A setter whose setup waits until the test ends it. */
function heldSetter() {
  let endSetUp: (result: SandboxSetup) => void = () => {};
  const setter: SandboxSetter = {
    setUp: () =>
      new Promise((resolve) => {
        endSetUp = resolve;
      }),
    remove: async () => ({ ok: true }),
  };
  return { setter, endSetUp: (result: SandboxSetup) => endSetUp(result) };
}

/** The removal's two halves, with what each was asked kept. */
function removal(before: SandboxRemoval = { ok: true }) {
  const asked = { before: 0, after: [] as number[] };
  const given: ShellRemoval = {
    before: async () => {
      asked.before++;
      return before;
    },
    after: (exitCode) => {
      asked.after.push(exitCode);
      return exitCode === 0
        ? { ok: true }
        : { ok: false, outcome: "failed", reason: "no", code: 36 };
    },
  };
  return { given, asked };
}

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function started(
  given: ShellRemoval,
  jobs = new SetupJobs(heldSetter().setter),
  sessions = new SessionTable(),
): Promise<string> {
  server = await startHostServer(token, removeThroughShellRoutes(jobs, sessions, given));
  return server.url;
}

function post(url: string, path: string, body: unknown = {}): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Lets a job's end settle: it only waits on promises. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

verifies("agent-host.remove-through-shell-routes", () => {
  it("does the host's half before the prompt, and answers how it went", async () => {
    const { given, asked } = removal();
    const url = await started(given);
    const answer = await post(url, "/v1/sandbox/remove/before");
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: true });
    expect(asked.before).toBe(1);
  });

  it("answers why when the host's half failed", async () => {
    const failed = { ok: false, outcome: "failed", reason: "a grant stays" } as const;
    const url = await started(removal(failed).given);
    expect(await (await post(url, "/v1/sandbox/remove/before")).json()).toEqual(failed);
  });

  it("refuses before any prompt while a sandboxed run goes on, and says how many", async () => {
    const { given, asked } = removal();
    const sessions = new SessionTable();
    const session = {
      fence: { state: "fenced" },
      profile: { timeLimitMs: 60_000 },
      close: async () => {},
      onBlocked: () => () => {},
    };
    await sessions.add(session as unknown as SandboxSession);
    const url = await started(given, undefined, sessions);
    const answer = await post(url, "/v1/sandbox/remove/before");
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({
      error: { kind: "sandbox_in_use", message: "1 run is using the sandbox." },
      runs: 1,
    });
    expect(asked.before).toBe(0);
    await sessions.closeAll();
  });

  it("answers how the removal ended from the helper's exit code", async () => {
    const { given, asked } = removal();
    const url = await started(given);
    const answer = await post(url, "/v1/sandbox/remove/elevated", { exitCode: 36 });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ ok: false, outcome: "failed", code: 36 });
    expect(asked.after).toEqual([36]);
  });

  it("takes nothing from the caller but a whole exit code Windows can give", async () => {
    const { given, asked } = removal();
    const url = await started(given);
    expect((await post(url, "/v1/sandbox/remove/before", { path: "a" })).status).toBe(400);
    for (const body of [{}, { exitCode: -1 }, { exitCode: 1.5 }, { exitCode: 0, verb: "x" }]) {
      expect((await post(url, "/v1/sandbox/remove/elevated", body)).status).toBe(400);
    }
    expect(asked).toEqual({ before: 0, after: [] });
  });

  it("answers 409 busy to both while the host runs a setup itself", async () => {
    const held = heldSetter();
    const jobs = new SetupJobs(held.setter);
    const { given, asked } = removal();
    const url = await started(given, jobs);
    jobs.run("setup");
    for (const [path, body] of [
      ["/v1/sandbox/remove/before", {}],
      ["/v1/sandbox/remove/elevated", { exitCode: 0 }],
    ] as const) {
      const answer = await post(url, path, body);
      expect(answer.status).toBe(409);
      expect(await answer.json()).toMatchObject({ error: { kind: "sandbox_busy" } });
    }
    expect(asked).toEqual({ before: 0, after: [] });
    held.endSetUp({ ok: true });
    await settle();
  });
});
