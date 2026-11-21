import type {
  SandboxRemoval,
  SandboxSetup,
  WslRemoveChoice,
  WslRemoveResult,
} from "@halonicjs/adapter-sandbox-srt";
import type { SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { SessionTable } from "./session-table.ts";
import { type SandboxSetter, SetupJobs, setupRoutes } from "./setup-routes.ts";

const BACKUP = "Z:\\backup\\halonic.tar"; // leak-guard: allow absolute-path example

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

/**
 * Lets the job's end settle: it only waits on promises, so once the next
 * macrotask runs, every one of them has finished. No timing is involved.
 */
const settle = () => new Promise((resolve) => setImmediate(resolve));

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

/** A WSL removal that records its choices and answers what the test says. */
function wslRemover(answer: WslRemoveResult = { outcome: "removed" }) {
  const choices: WslRemoveChoice[] = [];
  return {
    choices,
    remove: async (choice: WslRemoveChoice) => {
      choices.push(choice);
      return answer;
    },
  };
}

async function startedWsl(
  wsl: ReturnType<typeof wslRemover>,
  setter: SandboxSetter = heldSetter().setter,
  sessions = new SessionTable(),
): Promise<string> {
  server = await startHostServer(
    token,
    setupRoutes(new SetupJobs(setter, () => at, wsl.remove), sessions),
  );
  return server.url;
}

const backup = { choice: "export-then-remove", file: BACKUP };

verifies("agent-host.wsl-remove-route", () => {
  describe("POST /v1/sandbox/remove-wsl", () => {
    it("removes after an export to the file the user chose, and keeps how it ended", async () => {
      const wsl = wslRemover({ outcome: "removed", exportedTo: BACKUP });
      const url = await startedWsl(wsl);
      const response = await post(url, "/v1/sandbox/remove-wsl", backup);
      expect(response.status).toBe(202);
      await settle();
      expect(wsl.choices).toEqual([backup]);
      expect(await status(url)).toEqual({
        running: null,
        last: {
          verb: "remove-wsl",
          result: { outcome: "removed", exportedTo: BACKUP },
          finishedAt: at.toISOString(),
        },
      });
    });

    it("maps remove-only to a removal without an export", async () => {
      const wsl = wslRemover();
      const url = await startedWsl(wsl);
      expect((await post(url, "/v1/sandbox/remove-wsl", { choice: "remove-only" })).status).toBe(
        202,
      );
      await settle();
      expect(wsl.choices).toEqual([{ choice: "remove-without-export" }]);
    });

    it("keeps a failed export as the end, so nothing was removed", async () => {
      const failed: WslRemoveResult = {
        outcome: "failed",
        reason: "export-failed",
        detail: "wsl --export ended with 1",
      };
      const url = await startedWsl(wslRemover(failed));
      await post(url, "/v1/sandbox/remove-wsl", backup);
      await settle();
      expect(await status(url)).toMatchObject({ last: { verb: "remove-wsl", result: failed } });
    });

    it.each([
      ["no body", {}],
      ["no choice", { file: BACKUP }],
      ["export without a file", { choice: "export-then-remove" }],
      ["a file with remove-only", { choice: "remove-only", file: BACKUP }],
      ["a choice that isn't one", { choice: "keep" }],
      ["a distro name", { ...backup, distro: "Ubuntu" }],
    ])("refuses %s before anything runs", async (_name, body) => {
      const wsl = wslRemover();
      const url = await startedWsl(wsl);
      expect((await post(url, "/v1/sandbox/remove-wsl", body)).status).toBe(400);
      expect(wsl.choices).toEqual([]);
    });

    it("answers 409 busy while a setup runs, and runs nothing", async () => {
      const held = heldSetter();
      const wsl = wslRemover();
      const url = await startedWsl(wsl, held.setter);
      await post(url, "/v1/sandbox/setup");
      const response = await post(url, "/v1/sandbox/remove-wsl", backup);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { kind: "sandbox_busy" } });
      expect(wsl.choices).toEqual([]);
      held.endSetUp({ ok: true });
    });

    it("answers 409 in use while a sandboxed run goes on", async () => {
      const sessions = new SessionTable();
      await sessions.add({
        fence: { state: "fenced" },
        profile: { timeLimitMs: 60_000 },
        close: async () => {},
        onBlocked: () => () => {},
      } as unknown as SandboxSession);
      const wsl = wslRemover();
      const url = await startedWsl(wsl, heldSetter().setter, sessions);
      const response = await post(url, "/v1/sandbox/remove-wsl", { choice: "remove-only" });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { kind: "sandbox_in_use" }, runs: 1 });
      expect(wsl.choices).toEqual([]);
      await sessions.closeAll();
    });

    it("joins a removal that runs", async () => {
      let end: (result: WslRemoveResult) => void = () => {};
      const calls: WslRemoveChoice[] = [];
      const wsl = {
        choices: calls,
        remove: (choice: WslRemoveChoice) => {
          calls.push(choice);
          return new Promise<WslRemoveResult>((resolve) => {
            end = resolve;
          });
        },
      };
      const url = await startedWsl(wsl);
      await post(url, "/v1/sandbox/remove-wsl", backup);
      const second = await post(url, "/v1/sandbox/remove-wsl", backup);
      expect(await second.json()).toEqual({ running: "remove-wsl", last: null });
      end({ outcome: "removed" });
      await settle();
      expect(calls).toHaveLength(1);
    });

    it("ends a throwing removal as a failure and frees the slot", async () => {
      const url = await startedWsl({
        choices: [],
        remove: async () => {
          throw new Error("The saved WSL setup state can't be read.");
        },
      });
      await post(url, "/v1/sandbox/remove-wsl", { choice: "remove-only" });
      await settle();
      expect(await status(url)).toMatchObject({
        running: null,
        last: { result: { ok: false, outcome: "failed" } },
      });
    });

    it("is not served by a host that can't remove the setup", async () => {
      const url = await started(heldSetter().setter);
      expect((await post(url, "/v1/sandbox/remove-wsl", backup)).status).toBe(404);
    });
  });
});

verifies("agent-host.setup-elevated-route", () => {
  describe("POST /v1/sandbox/setup/elevated", () => {
    async function startedWith(
      afterHelper: (exitCode: number) => Promise<SandboxSetup>,
      setter = heldSetter().setter,
    ): Promise<string> {
      const jobs = new SetupJobs(setter, () => at, undefined, afterHelper);
      server = await startHostServer(token, setupRoutes(jobs, new SessionTable()));
      return server.url;
    }

    it("answers how the setup ended from the helper's exit code", async () => {
      const codes: number[] = [];
      const url = await startedWith(async (exitCode) => {
        codes.push(exitCode);
        return { ok: true };
      });
      const answer = await post(url, "/v1/sandbox/setup/elevated", { exitCode: 0 });
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ ok: true });
      expect(codes).toEqual([0]);
    });

    it("takes only a whole exit code Windows can give", async () => {
      const url = await startedWith(async () => ({ ok: true }));
      for (const body of [{}, { exitCode: -1 }, { exitCode: 1.5 }, { exitCode: 0, path: "a" }]) {
        expect((await post(url, "/v1/sandbox/setup/elevated", body)).status).toBe(400);
      }
    });

    it("answers 409 busy while the host runs a setup itself", async () => {
      const held = heldSetter();
      let asked = false;
      const url = await startedWith(async () => {
        asked = true;
        return { ok: true };
      }, held.setter);
      await post(url, "/v1/sandbox/setup");
      const answer = await post(url, "/v1/sandbox/setup/elevated", { exitCode: 0 });
      expect(answer.status).toBe(409);
      expect(asked).toBe(false);
      held.endSetUp({ ok: true });
      await settle();
    });

    it("is not served by a host that can't say", async () => {
      const url = await started(heldSetter().setter);
      expect((await post(url, "/v1/sandbox/setup/elevated", { exitCode: 0 })).status).toBe(404);
    });
  });
});
