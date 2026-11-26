import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { IntegrationPolicy } from "./policy.ts";
import { type BodyGuard, guardBody } from "./response-body.ts";

const policy = { name: "weather" } as IntegrationPolicy;
const url = new URL("https://api.example.com/data");

const guard: BodyGuard = {
  signal: new AbortController().signal,
  idleMs: 1_000,
  maxBytes: 1_000,
  onIdle: () => {},
  done: () => {},
  secrets: { texts: [], bytes: [], longest: 0 },
};

/**
 * A reply as the global `fetch` gives it for an odd status line. `new
 * Response()` takes neither, so the test builds a plain one and sets them.
 */
function oddReply(status: number, statusText: string, body: string | null): Response {
  const reply = new Response(body, { status: 500 });
  Object.defineProperty(reply, "status", { value: status });
  Object.defineProperty(reply, "statusText", { value: statusText });
  return reply;
}

verifies("integration-kit.odd-status", () => {
  it("passes a status outside 200–599 on, with `ok` false", async () => {
    const guarded = guardBody(policy, oddReply(600, "Busy", "no"), url, guard);
    expect(guarded.status).toBe(600);
    expect(guarded.ok).toBe(false);
    expect(guarded.statusText).toBe("Busy");
    expect(guarded.url).toBe(url.href);
    expect(await guarded.text()).toBe("no");
  });

  it("passes a status outside 200–599 on when the reply has no body", () => {
    expect(guardBody(policy, oddReply(600, "", null), url, guard).status).toBe(600);
  });

  it("leaves out a reason phrase with a control character", () => {
    const guarded = guardBody(policy, oddReply(503, "O\u0001K", "no"), url, guard);
    expect(guarded.status).toBe(503);
    expect(guarded.statusText).toBe("");
  });
});
