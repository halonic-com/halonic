import type { ActionRecordEvent } from "@halonicjs/events";
import type { ActionRecords } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** Creates an empty record store for one test. */
export type MakeActionRecords = () => Promise<ActionRecords>;

const at = "2026-11-24T13:00:00.000Z";
const started = (request: string, step: number): ActionRecordEvent => ({
  type: "action.step.started",
  request,
  at,
  step,
});
const finished: ActionRecordEvent = {
  type: "action.finished",
  request: "req-1",
  at,
  outcome: "succeeded",
};

/**
 * The contract every {@link ActionRecords} passes: the fake now, the
 * shell's record files later. Retention (a finished request's record goes
 * after 90 days) is the adapter's own test, since it needs the adapter's clock.
 */
export function actionRecordsContract(name: string, make: MakeActionRecords): void {
  verifies("contracts.action-records", () => {
    describe(`ActionRecords contract: ${name}`, () => {
      it("reads nothing for a request with no record", async () => {
        const records = await make();
        expect(await records.read("req-1")).toEqual([]);
      });

      it("reads a request's events back oldest first, apart from another request's", async () => {
        const records = await make();
        await records.append(started("req-1", 1));
        await records.append(started("req-2", 1));
        await records.append(finished);
        expect(await records.read("req-1")).toEqual([started("req-1", 1), finished]);
        expect(await records.read("req-2")).toEqual([started("req-2", 1)]);
      });

      it("refuses an event the allow-list refuses, and writes nothing", async () => {
        const records = await make();
        const smuggled = { ...started("req-1", 1), authorization: "acme-fake-token" };
        await expect(records.append(smuggled)).rejects.toThrow(RangeError);
        expect(await records.read("req-1")).toEqual([]);
      });

      it("refuses the request itself, which is a run event", async () => {
        const records = await make();
        const requested = {
          type: "action.requested",
          request: "req-1",
          at,
          definition: "github.approve-run",
          version: 1,
          parameters: { owner: "acme" },
          requester: { kind: "user" },
          reason: "Ship it.",
          expires: at,
        } as unknown as ActionRecordEvent;
        await expect(records.append(requested)).rejects.toThrow(RangeError);
        expect(await records.read("req-1")).toEqual([]);
      });

      it("keeps what was appended, whatever the caller does with its object later", async () => {
        const records = await make();
        const event = { type: "action.step.started" as const, request: "req-1", at, step: 1 };
        await records.append(event);
        event.step = 9;
        expect(await records.read("req-1")).toEqual([started("req-1", 1)]);
      });
    });
  });
}
