import { type Fetch, RunCredentials } from "@halonicjs/adapter-harness-bridge/web";
import { type HarnessBridgeOptions, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type CredentialStorage,
  DurableRunCredentialStore,
  type TransactionalCredentialStorage,
} from "./run-credential-storage.ts";
import { WorkerBridgeServer, workerBridgeName } from "./worker-bridge-server.ts";

const startMs = Date.UTC(2026, 10, 25, 9);
const lifetimeMs = 10 * 60_000;

/** A run object's storage in memory; its transaction works on the same map. */
class MemoryStorage implements TransactionalCredentialStorage {
  readonly values = new Map<string, unknown>();

  async get<Value>(key: string): Promise<Value | undefined> {
    return this.values.get(key) as Value | undefined;
  }

  async put<Value>(key: string, value: Value): Promise<void> {
    this.values.set(key, value);
  }

  transaction<Result>(work: (transaction: CredentialStorage) => Promise<Result>): Promise<Result> {
    return work(this);
  }
}

/** Fails the test if the bridge reaches it: these tests never get past the credential. */
async function notUsed(): Promise<never> {
  throw new Error("Not used in this test.");
}

/** What the engine gives the bridge of `run_1`'s `writer`. */
function runOptions(runId = "run_1"): HarnessBridgeOptions {
  return {
    runId,
    agentId: "writer",
    providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
    price: () => null,
    recorder: { record: notUsed },
    tools: { list: notUsed, check: notUsed, call: notUsed },
    approvals: { request: notUsed },
  };
}

/** A Worker bridge server on storage in memory, with a clock the test moves. */
function bridgeServer(fetch: Fetch = notUsed) {
  const storage = new MemoryStorage();
  let nowMs = startMs;
  const clock = { now: () => new Date(nowMs) };
  const credentials = new RunCredentials({ store: new DurableRunCredentialStore(storage), clock });
  const server = new WorkerBridgeServer({
    credentials,
    clock,
    lifetimeMs,
    secrets: { get: async () => "anthropic-test-value" },
    fetch,
  });
  const ask = (runId: string, token: string) =>
    server.serve(
      new Request(`http://${workerBridgeName}/no-such-path`, {
        method: "POST",
        headers: { [harnessBridgeTokenHeader]: token },
      }),
      { runId, waitUntil: () => undefined },
    );
  return { server, storage, ask, advance: (ms: number) => (nowMs += ms) };
}

/** A provider that never answers: it keeps each call's signal and ends the call when it aborts. */
function heldFetch(calls: AbortSignal[]): Fetch {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal ?? new AbortController().signal;
      calls.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
}

/** A program's model call to Anthropic through the bridge. */
function modelCall(token: string): Request {
  return new Request(`http://${workerBridgeName}/v1/messages`, {
    method: "POST",
    headers: { [harnessBridgeTokenHeader]: token, "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Hello" }],
    }),
  });
}

verifies("runtime.worker-bridge", () => {
  it("lets in a request with its run's credential, and keeps only the credential's hash", async () => {
    const { server, storage, ask } = bridgeServer();
    const bridge = await server.open(runOptions());

    expect(bridge.url).toBe("http://bridge.halonic.invalid");
    expect(bridge.keyProviders).toEqual(["anthropic"]);
    // Past the credential, the bridge answers for itself: this path isn't one it serves.
    expect((await ask("run_1", bridge.token)).status).toBe(404);
    expect(JSON.stringify([...storage.values])).not.toContain(bridge.token);
  });

  it("refuses a wrong credential, and a run whose bridge isn't open", async () => {
    const { server, ask } = bridgeServer();
    const bridge = await server.open(runOptions());

    expect((await ask("run_1", "not-the-credential")).status).toBe(401);
    expect((await ask("run_2", bridge.token)).status).toBe(401);
  });

  it("drops the credential when the engine closes the bridge, and never gives the run another", async () => {
    const { server, ask } = bridgeServer();
    const bridge = await server.open(runOptions());

    await bridge.close();
    await bridge.close();

    expect((await ask("run_1", bridge.token)).status).toBe(401);
    await expect(server.open(runOptions())).rejects.toThrow(/only once/);
  });

  it("drops the credential when the container's alarm stops the run, and stops its requests", async () => {
    const calls: AbortSignal[] = [];
    const { server, ask } = bridgeServer(heldFetch(calls));
    const first = await server.open(runOptions());
    const second = await server.open({
      ...runOptions("run_2"),
      recorder: { record: async () => {} },
    });
    const inFlight = server.serve(modelCall(second.token), {
      runId: "run_2",
      waitUntil: () => undefined,
    });
    await expect.poll(() => calls.length).toBe(1);

    await server.revoke("run_2");
    await inFlight;

    expect(calls[0]?.aborted).toBe(true);
    expect((await ask("run_2", second.token)).status).toBe(401);
    // The other run's bridge is untouched.
    expect((await ask("run_1", first.token)).status).toBe(404);
  });

  it("refuses the credential once the container's time cap is over", async () => {
    const { server, ask, advance } = bridgeServer();
    const bridge = await server.open(runOptions());

    advance(lifetimeMs);

    expect((await ask("run_1", bridge.token)).status).toBe(401);
  });

  it("refuses a second open for a run whose bridge is open", async () => {
    const { server } = bridgeServer();
    await server.open(runOptions());

    await expect(server.open(runOptions())).rejects.toThrow(/already open/);
  });
});
