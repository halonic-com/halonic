import { describe, expect, it } from "vitest";
import { IntegrationRefusedError } from "./integration/index.ts";
import type { IntegrationPolicy } from "./policy.ts";
import { type BodyGuard, guardBody, untilAborted } from "./response-body.ts";
import type { SecretForms } from "./secret-filter.ts";

const policy = { name: "weather" } as IntegrationPolicy;
const url = new URL("https://api.example.com/data");
const noSecrets: SecretForms = { texts: [], bytes: [], longest: 0 };

/** A guard with generous limits; `done` counts how often the kit is told the body is over. */
function guardWith(overrides: Partial<BodyGuard> = {}): BodyGuard & { finished: () => number } {
  let finished = 0;
  return {
    signal: new AbortController().signal,
    idleMs: 1_000,
    maxBytes: 1_000,
    onIdle: () => {},
    done: () => {
      finished += 1;
    },
    secrets: noSecrets,
    finished: () => finished,
    ...overrides,
  };
}

describe("untilAborted", () => {
  it("settles like the promise while the signal stays quiet", async () => {
    const signal = new AbortController().signal;
    await expect(untilAborted(Promise.resolve(7), signal)).resolves.toBe(7);
    await expect(untilAborted(Promise.reject(new Error("no")), signal)).rejects.toThrow("no");
  });

  it("rejects with the signal's reason when it is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    await expect(untilAborted(new Promise<never>(() => {}), controller.signal)).rejects.toThrow(
      "stopped",
    );
  });

  it("rejects as soon as the signal aborts, even if the promise never settles", async () => {
    const controller = new AbortController();
    const waiting = untilAborted(new Promise<never>(() => {}), controller.signal);
    controller.abort(new Error("late stop"));
    await expect(waiting).rejects.toThrow("late stop");
  });
});

describe("guardBody", () => {
  it("passes a body through and tells the kit when it is read", async () => {
    const guard = guardWith();
    const guarded = guardBody(policy, new Response("hello"), url, guard);
    expect(await guarded.text()).toBe("hello");
    expect(guard.finished()).toBe(1);
  });

  it("refuses a declared length over the limit before reading", () => {
    const guard = guardWith({ maxBytes: 4 });
    const response = new Response("hello", { headers: { "content-length": "5" } });
    expect(() => guardBody(policy, response, url, guard)).toThrow(IntegrationRefusedError);
    expect(guard.finished()).toBe(1);
  });

  it("fails the stream when the body grows over the limit without declaring it", async () => {
    const guard = guardWith({ maxBytes: 4 });
    const guarded = guardBody(policy, new Response("hello"), url, guard);
    await expect(guarded.text()).rejects.toMatchObject({ code: "response-too-large" });
    expect(guard.finished()).toBe(1);
  });

  it("gives the response the URL of the hop that answered", () => {
    const guarded = guardBody(policy, new Response(null), url, guardWith());
    expect(guarded.url).toBe("https://api.example.com/data");
  });
});
