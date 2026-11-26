import { BrokenRecordLogError, type RecordChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ConnectorPausedError,
  type ConnectorPauseKey,
  ConnectorPauses,
  type ConnectorPauseWhy,
  connectorPausesCollection,
} from "./connector-pauses.ts";
import { TestRecordStore } from "./testing/test-record-store.ts";
import type { TrustCheck } from "./trust-service.ts";
import {
  clock,
  folder,
  passes,
  radar,
  setup,
  trustedSettings,
} from "./trusted-runner.test-helper.ts";

const hostBlock: ConnectorPauseWhy = { kind: "host-not-declared", host: "undeclared.example.net" };
const leakBlock: ConnectorPauseWhy = { kind: "leak-attempt", code: "secret-in-request" };

/** The pause key of the connector `connector` for the code `check` trusted. */
function keyOf(check: TrustCheck, connector = "radar"): ConnectorPauseKey {
  if (check.status !== "trusted") throw new Error("expected a trusted check");
  const code = check.content.integrations?.find(
    (integration) => integration.folder === folder,
  )?.code;
  if (code === undefined) throw new Error("the trust has no radar");
  return { location: check.grant.location, connector, code };
}

async function pausedError(promise: Promise<unknown>): Promise<ConnectorPausedError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ConnectorPausedError);
  return error as ConnectorPausedError;
}

/** A record store whose log of pauses is damaged, as `FileRecordStore` reports one. */
class DamagedRecordStore extends TestRecordStore {
  override async changes(collection: string): Promise<RecordChange[]> {
    throw new BrokenRecordLogError(
      `/profile/connector-pauses/${collection}.jsonl`,
      "it is not JSON.",
      1,
    );
  }
}

verifies("app.connector-pause", () => {
  describe("a paused connector at the trusted runner start", () => {
    it.each([
      ["an undeclared host", hostBlock],
      ["a secret in a request", leakBlock],
    ])("starts no runner after %s, in this run and in a new one", async (_, why) => {
      const { records, pauses, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      await pauses.pause(keyOf(check), why).saved;

      const error = await pausedError(starts.start(radar(check), startIn));
      expect(error.reason).toBe("connector-paused");
      expect(error.pause).toMatchObject({ connector: "radar", why });

      // A new run reads the same profile with pauses of its own and no note in memory.
      const newRun = new ConnectorPauses({ records, place: "/profile/connector-pauses", clock });
      expect(await newRun.find(keyOf(check))).toMatchObject({ why });
      expect(started).toEqual([]);
    });

    it("counts a pause from the moment it is made: two starts fired at once with it are both refused", async () => {
      const { pauses, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      pauses.pause(keyOf(check), hostBlock);
      const both = await Promise.allSettled([
        starts.start(radar(check), startIn),
        starts.start(radar(check), startIn),
      ]);
      for (const settled of both) {
        expect(settled.status).toBe("rejected");
        if (settled.status === "rejected") {
          expect((settled.reason as ConnectorPausedError).reason).toBe("connector-paused");
        }
      }
      expect(started).toEqual([]);
    });

    it("starts again once the code changed and the person trusted it again", async () => {
      const { workspace, pauses, starts, started, startIn, trusted } = await setup();
      await pauses.pause(keyOf(await trusted()), hostBlock).saved;
      workspace.putFiles({ [`${folder}/src/index.js`]: "export default { fixed: true };\n" });
      expect((await starts.start(radar(await trusted()), startIn)).run).toBe("fenced");
      expect(started).toHaveLength(1);
    });

    it("stays paused when the person trusts the same code again", async () => {
      const { pauses, starts, started, startIn, trusted } = await setup();
      await pauses.pause(keyOf(await trusted()), hostBlock).saved;
      const again = await trusted();
      expect((await pausedError(starts.start(radar(again), startIn))).reason).toBe(
        "connector-paused",
      );
      expect(started).toEqual([]);
    });

    it("stays paused when the code goes back to the code it caught", async () => {
      const { workspace, pauses, starts, startIn, trusted } = await setup();
      await pauses.pause(keyOf(await trusted()), hostBlock).saved;
      workspace.putFiles({ [`${folder}/src/index.js`]: "export default { fixed: true };\n" });
      await trusted();
      workspace.putFiles({ [`${folder}/src/index.js`]: "export default {};\n" });
      const back = await trusted();
      expect((await pausedError(starts.start(radar(back), startIn))).reason).toBe(
        "connector-paused",
      );
    });

    it("leaves another connector of the same integration folder running", async () => {
      const { pauses, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      await pauses.pause(keyOf(check, "radar-home"), hostBlock).saved;
      expect((await starts.start(radar(check, "radar-work"), startIn)).run).toBe("fenced");
      await pausedError(starts.start(radar(check, "radar-home"), startIn));
      expect(started).toHaveLength(1);
    });

    it("starts again once the person removes the pause, and only that connector's", async () => {
      const { records, pauses, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      await pauses.pause(keyOf(check, "radar-home"), hostBlock).saved;
      await pauses.pause(keyOf(check, "radar-work"), leakBlock).saved;
      await pauses.remove(keyOf(check).location, "radar-home");

      expect((await starts.start(radar(check, "radar-home"), startIn)).run).toBe("fenced");
      await pausedError(starts.start(radar(check, "radar-work"), startIn));
      const newRun = new ConnectorPauses({ records, place: "/profile/connector-pauses", clock });
      expect(await newRun.find(keyOf(check, "radar-home"))).toBeUndefined();
      expect(started).toHaveLength(1);
    });
  });

  describe("pauses that can't be read", () => {
    it("start no connector, and the reason names the damaged file", async () => {
      const { starts, started, startIn, trusted } = await setup(
        passes,
        trustedSettings,
        new DamagedRecordStore(),
      );
      const error = await pausedError(starts.start(radar(await trusted()), startIn));
      expect(error.reason).toBe("pause-unreadable");
      expect(error.message).toContain(
        `"/profile/connector-pauses/${connectorPausesCollection}.jsonl"`,
      );
      expect(started).toEqual([]);
    });

    it("start no connector when a record isn't a pause, such as one edited by hand", async () => {
      const records = new TestRecordStore();
      const { starts, started, startIn, trusted } = await setup(passes, trustedSettings, records);
      const check = await trusted();
      const { location, connector, code } = keyOf(check);
      await records.append([
        {
          at: "2026-11-26T08:00:00.000Z",
          collection: connectorPausesCollection,
          id: JSON.stringify([location, connector, code]),
          op: "add",
          values: { location, connector, code: "something else", why: hostBlock, pausedAt: "x" },
        },
      ]);
      const error = await pausedError(starts.start(radar(check), startIn));
      expect(error.reason).toBe("pause-unreadable");
      expect(error.message).toContain('"/profile/connector-pauses"');
      expect(started).toEqual([]);
    });
  });
});
