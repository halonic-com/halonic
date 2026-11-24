import { type ErrorKind, KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { bridgeErrorReply } from "./bridge-error.ts";

/** What the bridge wrote to a reply. */
interface WrittenReply {
  status: number;
  body: { type: string; error: { type: string; message: string } };
}

/** The bridge's reply to one error. */
async function replyFor(error: unknown): Promise<WrittenReply> {
  const reply = bridgeErrorReply(error);
  return { status: reply.status, body: (await reply.json()) as WrittenReply["body"] };
}

const statuses: Record<ErrorKind, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  denied: 403,
  not_found: 404,
  conflict: 409,
  limit_reached: 429,
  unavailable: 503,
  internal: 500,
};

verifies("harness-bridge.server", () => {
  it("answers each error kind with its HTTP status, in the shape providers use", async () => {
    for (const [kind, status] of Object.entries(statuses) as [ErrorKind, number][]) {
      const reply = await replyFor(new KindedError(kind, "Readable reason."));
      expect(reply.status).toBe(status);
      expect(reply.body.type).toBe("error");
      expect(reply.body.error.type).toBe(kind);
    }
  });

  it("keeps the message of the bridge's own errors, except internal ones", async () => {
    const denied = await replyFor(new KindedError("denied", "Not this path."));
    expect(denied.body.error.message).toBe("Not this path.");
    const internal = await replyFor(new KindedError("internal", "a detail"));
    expect(internal.body.error.message).not.toContain("a detail");
  });
});
