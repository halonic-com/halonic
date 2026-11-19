// The run state's run list updates over a real Durable Object's storage and alarm (see `run-state.test.ts`).

import { entered, started } from "@halonicjs/testing-contracts";
import { waitUntil } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { newState, second } from "./run-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

describe("RunState run list update", () => {
  const events = [started("r1"), entered("r1", 2)];

  it("notes an append in the outbox and sends the summary from the alarmAt, once", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, published } = newState(storage);
      await state.append("r1", 0, events);
      expect(published).toEqual([]);
      expect(await alarmAt()).toBe(clock.now().getTime());
      await state.alarm();
      expect(published).toEqual([["r1", 2]]);
      expect(await alarmAt()).toBeNull();
      await state.alarm();
      expect(published).toHaveLength(1);
    }));

  it("sends nothing for an append that conflicts", () =>
    inObjectState(async ({ storage }) => {
      const { state, alarmAt, published } = newState(storage);
      await state.append("r1", 0, events);
      await state.alarm();
      await storage.deleteAlarm();
      expect(await state.append("r1", 1, [entered("r1", 2)])).toMatchObject({ ok: false });
      expect(await alarmAt()).toBeNull();
      await state.alarm();
      expect(published).toHaveLength(1);
    }));

  it("retries a failed update on the alarm with the backoff, and sends the latest summary", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, published, onPublish } = newState(storage);
      onPublish(async () => {
        throw new Error("D1 is down");
      });
      await state.append("r1", 0, events);
      await state.alarm();
      expect(published).toEqual([]);
      expect(await alarmAt()).toBe(clock.now().getTime() + second);
      await state.append("r1", 2, [entered("r1", 3)]);
      clock.advance(second);
      onPublish(async () => {});
      await state.alarm();
      expect(published).toEqual([["r1", 3]]);
      expect(await alarmAt()).toBeNull();
    }));

  it("keeps the note of an append made while its update was being sent", () =>
    inObjectState(async ({ storage }) => {
      const { state, published, onPublish } = newState(storage);
      await state.append("r1", 0, events);
      onPublish(async () => {
        await state.append("r1", 2, [entered("r1", 3)]);
      });
      await state.alarm();
      onPublish(async () => {});
      await state.alarm();
      expect(published).toEqual([
        ["r1", 2],
        ["r1", 3],
      ]);
    }));

  it("sends an append's update while a timer's call is still running", () =>
    inObjectState(async ({ storage }) => {
      const { state, published, inMs, onDelivery } = newState(storage, {
        nap: (_ms, signal) =>
          new Promise((resolve) => signal.addEventListener("abort", () => resolve())),
      });
      let endCall: () => void = () => {};
      const callEnds = new Promise<void>((resolve) => (endCall = resolve));
      let callStarted: () => void = () => {};
      const started = new Promise<void>((resolve) => (callStarted = resolve));
      onDelivery(async () => {
        callStarted();
        await callEnds;
      });
      await state.schedule("r1", "t1", inMs(0));
      const alarm = state.alarm();
      await started;
      await state.append("r1", 0, events);
      await waitUntil(
        `published to equal [["r1", 2]]`,
        () => JSON.stringify(published) === JSON.stringify([["r1", 2]]),
      );
      expect(published).toEqual([["r1", 2]]);
      endCall();
      await alarm;
    }));

  it("sends the update although a timer's delivery failed, and the reverse", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, published, inMs, onDelivery } = newState(storage, {
        nap: async () => {
          throw new Error("storage failed");
        },
      });
      onDelivery(() => new Promise<void>(() => {}));
      await state.schedule("r1", "stuck", inMs(0));
      await state.schedule("r1", "later", inMs(30 * second));
      await state.append("r1", 0, events);
      await expect(state.alarm()).rejects.toThrow("storage failed");
      expect(published).toEqual([["r1", 2]]);
      expect(await alarmAt()).toBe(clock.now().getTime());
    }));

  it("gives the summary from the log, and none for an empty log", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      expect(await state.summary()).toBeNull();
      await state.append("r1", 0, events);
      expect(await state.summary()).toMatchObject({ id: "r1", status: "running" });
    }));
});
