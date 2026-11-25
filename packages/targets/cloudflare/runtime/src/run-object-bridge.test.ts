import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CredentialStorage } from "./run-credential-storage.ts";
import { runIdOfObjectName, runObjectBridgeServer } from "./run-object-bridge.ts";

/** A run object's storage in memory. */
function memoryStorage() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async <Value>(key: string) => values.get(key) as Value | undefined,
    put: async <Value>(key: string, value: Value) => {
      values.set(key, value);
    },
    transaction: <Result>(work: (transaction: CredentialStorage) => Promise<Result>) =>
      work(storage),
  };
  return storage;
}

verifies("runtime.run-container-object", () => {
  it("serves the bridge of the run the object is named after, without its scope's prefix", () => {
    expect(runIdOfObjectName("u/acme/run_1", "u/acme/")).toBe("run_1");
    expect(runIdOfObjectName("run_1", null)).toBe("run_1");
  });

  it("serves no bridge for an object without a run name", () => {
    expect(() => runIdOfObjectName(undefined, null)).toThrow(/no run name/);
    expect(() => runIdOfObjectName("o/other/run_1", "u/acme/")).toThrow(/no run name/);
    expect(() => runIdOfObjectName("u/acme/", "u/acme/")).toThrow(/no run name/);
  });

  it("answers 401 while no harness step has the run's bridge open", async () => {
    const server = runObjectBridgeServer(memoryStorage(), {});

    const answer = await server.serve(
      new Request("http://bridge.halonic.invalid/v1/messages", {
        method: "POST",
        headers: { [harnessBridgeTokenHeader]: "made-up-credential" },
      }),
      { runId: "run_1", waitUntil: () => undefined },
    );

    expect(answer.status).toBe(401);
  });
});
