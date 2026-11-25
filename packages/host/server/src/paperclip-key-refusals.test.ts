import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RequestLogEntry } from "./api.ts";
import type { ProviderKeyStore } from "./provider-key-store.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const canaryKey = "pcp_board_canary-key-for-server-tests-only";

/** The serve profile's store, holding a Paperclip key under its reserved name. */
class StoreWithPaperclipKey implements ProviderKeyStore {
  readonly calls: string[] = [];
  async has(): Promise<boolean> {
    this.calls.push("has");
    return true;
  }
  async set(): Promise<void> {
    this.calls.push("set");
  }
  async remove(): Promise<void> {
    this.calls.push("remove");
  }
}

function setup() {
  const keys = new StoreWithPaperclipKey();
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const clock = new TestClock();
  const server = testServer({
    passwordHash: null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    providerKeys: keys,
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
  });
  return { server, keys, requestLog, errors };
}

/**
 * Every way to write a Paperclip key's name in the path: the plan's `paperclip-key/<connection>`
 * in each spelling the guard must see through, and the name it is stored under, a token's.
 */
const names = [
  "paperclip-key/x",
  "PAPERCLIP-KEY/x",
  "paperclip-key%2Fx",
  "paperclip-key%2fx",
  "a/../paperclip-key/x",
  "a/%2e%2e/paperclip-key/x",
  "paperclip-key/x/",
  "halonic_token_paperclip-x",
  "HALONIC_TOKEN_PAPERCLIP-X",
  "halonic-token-paperclip-x",
  "halonic_token_paperclip%2Dx",
];

verifies("server.paperclip-key-store", () => {
  it("refuses every spelling of a Paperclip key's name for GET, PUT and DELETE", async () => {
    const { server, keys, requestLog, errors } = setup();

    for (const name of names) {
      for (const method of ["GET", "PUT", "DELETE"]) {
        const response = await server.handle(
          new Request(`http://localhost/api/secrets/${name}`, {
            method,
            headers: { host: "localhost", "content-type": "application/json" },
            ...(method === "PUT" ? { body: JSON.stringify({ value: canaryKey }) } : {}),
          }),
        );
        expect(response.status, `${method} ${name}`).toBe(400);
        const text = await response.text();
        expect(JSON.parse(text), `${method} ${name}`).toMatchObject({
          code: "secret_name_refused",
        });
        expect(text).not.toContain(canaryKey);
      }
    }
    expect(keys.calls).toEqual([]);
    expect(requestLog).toEqual([]);
    expect(errors).toEqual([]);
  });
});
