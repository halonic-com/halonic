import { MemoryUnfencedRunConsentStore } from "@halonicjs/adapter-memory";
import { RunnerStartGate, UnfencedRuns } from "@halonicjs/app";
import type { Sandbox, SandboxCheck, UnfencedRunConsent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { unfencedRunsRoutes } from "./unfenced-runs-routes.ts";

const token = randomLaunchToken();
const allowedAt = "2026-11-18T09:00:00.000Z";
const clock = { now: () => new Date(allowedAt) };
/** These tests take the yes back through the route, so the saved yes is never read again on a timer. */
const noSavedYesChecks = { set: () => undefined, clear: () => undefined };
const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const inContainer: SandboxCheck = { ok: false, reason: "container", missing: [] };

/** The memory store, counting every save, and able to fail like a file the host can't read. */
class SpyStore extends MemoryUnfencedRunConsentStore {
  saves = 0;
  unreadable = false;

  override async get(): Promise<UnfencedRunConsent | null> {
    if (this.unreadable) {
      throw Object.assign(
        new Error("EACCES: permission denied, open 'profile/unfenced-runs/yes.json'"),
        {
          code: "EACCES",
        },
      );
    }
    return await super.get();
  }

  override async save(consent: UnfencedRunConsent): Promise<void> {
    this.saves += 1;
    await super.save(consent);
  }
}

function sandbox(check: SandboxCheck): Sandbox {
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error("the routes never open a session");
    },
  };
}

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function setup(options: { check?: SandboxCheck; platform?: string } = {}) {
  const store = new SpyStore();
  const runs = new UnfencedRuns({ store, clock, timers: noSavedYesChecks });
  const gate = new RunnerStartGate({
    platform: options.platform ?? "linux",
    fenced: sandbox(options.check ?? inContainer),
    launcher: sandbox(passes),
    runs,
    timers: noSavedYesChecks,
  });
  const logged: string[] = [];
  server = await startHostServer(
    token,
    unfencedRunsRoutes({ gate, runs }, (text) => logged.push(text)),
  );
  const url = server.url;
  const call = async (
    path: string,
    body?: unknown,
    headers = { authorization: `Bearer ${token}` },
  ) => {
    const response = await fetch(`${url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...headers, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: (await response.json()) as unknown,
      headers: response.headers,
    };
  };
  return { store, runs, logged, call };
}

verifies("agent-host.unfenced-runs-routes", () => {
  describe("the unfenced-runs routes", () => {
    it("answer the status as codes, and save the yes for the current reason", async () => {
      const { call, store } = await setup();
      expect((await call("/v1/unfenced-runs")).body).toEqual({
        run: "needs-yes",
        reason: "container",
      });
      const allowed = await call("/v1/unfenced-runs/allow", { reason: "container" });
      expect(allowed).toMatchObject({
        status: 200,
        body: { run: "allowed", reason: "container", allowedAt },
      });
      expect(store.saves).toBe(1);
      expect((await call("/v1/unfenced-runs")).body).toEqual({
        run: "allowed",
        reason: "container",
        allowedAt,
      });
    });

    it("answer windows on Windows even when the sandbox check passes", async () => {
      const { call } = await setup({ platform: "win32", check: passes });
      expect((await call("/v1/unfenced-runs")).body).toEqual({
        run: "needs-yes",
        reason: "windows",
      });
    });

    it("remove the saved yes on a GET once the computer is in the sandbox", async () => {
      const { call, runs, store } = await setup({ check: passes });
      await runs.allow("container");
      expect((await call("/v1/unfenced-runs")).body).toEqual({ run: "fenced" });
      expect(await store.get()).toBeNull();
    });

    it("save nothing for a stale reason, and answer reason_changed", async () => {
      const { call, store } = await setup();
      const answer = await call("/v1/unfenced-runs/allow", { reason: "bubblewrap-missing" });
      expect(answer).toMatchObject({ status: 409, body: { error: { kind: "reason_changed" } } });
      expect(store.saves).toBe(0);
    });

    it.each([
      ["an unknown reason", { reason: "trust-me" }],
      ["an extra field", { reason: "container", allowedAt: "2020-01-01T00:00:00.000Z" }],
      ["no reason", {}],
    ])("save nothing for %s, and answer 400", async (_name, body) => {
      const { call, store } = await setup();
      expect((await call("/v1/unfenced-runs/allow", body)).status).toBe(400);
      expect(store.saves).toBe(0);
    });

    it("keep a store error in the host: the answer has the reason only, the log the code only", async () => {
      const { call, store, logged } = await setup();
      store.unreadable = true;
      expect((await call("/v1/unfenced-runs")).body).toEqual({
        run: "needs-yes",
        reason: "container",
      });
      expect(logged.join("")).toContain("EACCES");
      expect(logged.join("")).not.toContain("yes.json");
    });

    it("stop a plugin running without the sandbox on Take back, and remove the yes", async () => {
      const { call, runs, store } = await setup();
      const yes = await runs.allow("container");
      let stops = 0;
      runs.registerUnfencedRun(yes, async () => {
        stops += 1;
      });
      expect(await call("/v1/unfenced-runs/take-back", {})).toMatchObject({
        status: 200,
        body: { takenBack: true },
      });
      expect(stops).toBe(1);
      expect(await store.get()).toBeNull();
    });

    it("answer take_back_incomplete when a plugin didn't stop, with the yes gone", async () => {
      const { call, runs, store } = await setup();
      const yes = await runs.allow("container");
      runs.registerUnfencedRun(yes, async () => {
        throw new Error("the runner hung");
      });
      const answer = await call("/v1/unfenced-runs/take-back", {});
      expect(answer).toMatchObject({
        status: 500,
        body: { error: { kind: "take_back_incomplete" } },
      });
      expect(await store.get()).toBeNull();
    });

    it("refuse a Take back with a body that isn't empty", async () => {
      const { call } = await setup();
      expect((await call("/v1/unfenced-runs/take-back", { reason: "container" })).status).toBe(400);
    });

    it.each([
      ["GET", "/v1/unfenced-runs", undefined],
      ["POST", "/v1/unfenced-runs/allow", { reason: "container" }],
      ["POST", "/v1/unfenced-runs/take-back", {}],
    ])("refuse %s %s without the launch token or with a wrong one", async (_method, path, body) => {
      const { call, store, runs } = await setup();
      await runs.allow("container");
      const saves = store.saves;
      for (const headers of [
        { authorization: "" },
        { authorization: `Bearer ${randomLaunchToken()}` },
      ]) {
        const answer = await call(path, body, headers);
        expect(answer.status).toBe(401);
        expect(answer.headers.get("access-control-allow-origin")).toBeNull();
      }
      expect(store.saves).toBe(saves);
      expect(await store.get()).toEqual({ reason: "container", allowedAt });
    });
  });
});
