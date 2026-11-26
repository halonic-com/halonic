import type { TauriCallbacks, TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  DeploymentCallRefused,
  type DeploymentJsonRoute,
  type DeploymentStreamMessage,
  tauriDeploymentCalls,
} from "./deployment-calls.ts";

const ORIGIN = "https://acme.example";

/** A shell that records every command and answers with `answer`. */
function fakeShell(answer: (command: string, args: Record<string, unknown>) => unknown) {
  const invoked: { command: string; args: Record<string, unknown> }[] = [];
  const callbacks = new Map<number, (message: unknown) => void>();
  let nextId = 1;
  const ipc: TauriIpc & TauriCallbacks = {
    invoke: async (command, args = {}) => {
      invoked.push({ command, args });
      return answer(command, args);
    },
    transformCallback: (callback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback: (id) => callbacks.delete(id),
  };
  /** Sends the stream's channel its messages, numbered from 0. */
  const send = (channel: unknown, messages: readonly unknown[]) => {
    const callback = callbacks.get(Number(String(channel).replace("__CHANNEL__:", "")));
    for (const [index, message] of messages.entries()) callback?.({ index, message });
  };
  return { ipc, invoked, send, callbacks };
}

verifies("studio.deployment-calls", () => {
  it("names only the pinned origin and a route of the list", async () => {
    const shell = fakeShell((command, args) =>
      command === "deployment_stream"
        ? { stream: args["stream"] }
        : { status: 200, body: { runs: [] } },
    );
    const calls = tauriDeploymentCalls(shell.ipc, ORIGIN);
    await expect(calls.request("GET /api/waiting-runs")).resolves.toEqual({
      status: 200,
      body: { runs: [] },
    });
    await calls.request("GET /api/runs/{run}", "run_1");
    const opening = await calls.openEvents("run_1", 4, () => {});
    expect(opening.kind).toBe("opened");
    expect(shell.invoked.map(({ command, args }) => ({ command, ...args }))).toEqual([
      {
        command: "deployment_request",
        origin: ORIGIN,
        route: "GET /api/waiting-runs",
        run: undefined,
      },
      { command: "deployment_request", origin: ORIGIN, route: "GET /api/runs/{run}", run: "run_1" },
      {
        command: "deployment_stream",
        origin: ORIGIN,
        route: "GET /api/runs/{run}/events",
        run: "run_1",
        after: 4,
        stream: expect.any(Number),
        channel: expect.stringMatching(/^__CHANNEL__:\d+$/),
      },
    ]);
  });

  it("refuses a route off the list without calling the shell", async () => {
    const shell = fakeShell(() => ({ status: 200, body: null }));
    const calls = tauriDeploymentCalls(shell.ipc, ORIGIN);
    for (const route of [
      "POST /api/runs/{run}/events",
      "GET /api/workspace",
      "https://other.example/api/runs",
    ]) {
      const refused = calls.request(route as DeploymentJsonRoute);
      await expect(refused).rejects.toEqual(new DeploymentCallRefused("unknownRoute"));
    }
    expect(shell.invoked).toEqual([]);
  });
});

describe("tauriDeploymentCalls", () => {
  it("passes the shell's refusal on by its code only", async () => {
    const shell = fakeShell(() => {
      throw { code: "notSignedIn" };
    });
    const refused = tauriDeploymentCalls(shell.ipc, ORIGIN).request("GET /api/waiting-runs");
    await expect(refused).rejects.toMatchObject({
      name: "DeploymentCallRefused",
      code: "notSignedIn",
    });
  });

  it("passes a stream's events on, then its end, and hangs up when asked", async () => {
    const shell = fakeShell((command, args) =>
      command === "deployment_stream" ? { stream: args["stream"] } : undefined,
    );
    const heard: DeploymentStreamMessage[] = [];
    const opening = await tauriDeploymentCalls(shell.ipc, ORIGIN).openEvents(
      "run_1",
      undefined,
      (message) => heard.push(message),
    );
    const { channel, stream } = shell.invoked[0]?.args ?? {};
    shell.send(channel, [
      { type: "event", event: "run", data: "{}", id: "1" },
      { type: "event", event: "end", data: "" },
      { type: "end" },
    ]);
    expect(heard).toEqual([
      { type: "event", event: "run", data: "{}", id: "1" },
      { type: "event", event: "end", data: "" },
      { type: "end" },
    ]);
    expect(shell.callbacks.size).toBe(0);
    if (opening.kind === "opened") opening.end();
    expect(shell.invoked.at(-1)).toEqual({ command: "deployment_stream_end", args: { stream } });
  });

  it("gives the server's refusal of a stream as its answer", async () => {
    const shell = fakeShell(() => ({ answer: { status: 404, body: { error: "run_not_found" } } }));
    const opening = await tauriDeploymentCalls(shell.ipc, ORIGIN).openEvents(
      "run_1",
      undefined,
      () => {},
    );
    expect(opening).toEqual({
      kind: "refused",
      answer: { status: 404, body: { error: "run_not_found" } },
    });
    expect(shell.callbacks.size).toBe(0);
  });
});
