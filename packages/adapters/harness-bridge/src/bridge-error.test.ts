import type { ServerResponse } from "node:http";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sendBridgeError } from "./bridge-error.ts";

/** What the bridge wrote to a reply. */
interface WrittenReply {
  status: number;
  body: { type: string; error: { type: string; message: string } };
}

/** Sends one error to a stand-in reply and reads back what was written. */
function replyFor(error: unknown): WrittenReply {
  const written = { status: 0, text: "" };
  const response = {
    writeHead(status: number) {
      written.status = status;
      return response;
    },
    end(text: string) {
      written.text = text;
      return response;
    },
  };
  sendBridgeError(response as unknown as ServerResponse, error);
  return { status: written.status, body: JSON.parse(written.text) };
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
  it("answers each error kind with its HTTP status, in the shape providers use", () => {
    for (const [kind, status] of Object.entries(statuses) as [ErrorKind, number][]) {
      const reply = replyFor(new KindedError(kind, "Readable reason."));
      expect(reply.status).toBe(status);
      expect(reply.body.type).toBe("error");
      expect(reply.body.error.type).toBe(kind);
    }
  });

  it("keeps the message of the bridge's own errors, except internal ones", () => {
    expect(replyFor(new KindedError("denied", "Not this path.")).body.error.message).toBe(
      "Not this path.",
    );
    expect(replyFor(new KindedError("internal", "a detail")).body.error.message).not.toContain(
      "a detail",
    );
  });
});
