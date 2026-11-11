import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ClosedRequests } from "./closed-requests.ts";

verifies("integration-runner.requests", () => {
  describe("ClosedRequests", () => {
    it("keeps a number until the runner acts in a call started after the close", () => {
      const closed = new ClosedRequests();
      closed.add(4, { nextCall: 3, nextPing: 0 });
      closed.runnerReadCall(2);
      expect(closed.has(4)).toBe(true);
      closed.runnerReadCall(3);
      expect(closed.has(4)).toBe(false);
    });

    it("keeps a number until the runner answers a ping sent after the close", () => {
      const closed = new ClosedRequests();
      closed.add(4, { nextCall: 3, nextPing: 5 });
      closed.runnerReadPing(4);
      expect(closed.has(4)).toBe(true);
      closed.runnerReadPing(5);
      expect(closed.has(4)).toBe(false);
    });

    it("forgets only the numbers closed before what the runner has read", () => {
      const closed = new ClosedRequests();
      closed.add(0, { nextCall: 1, nextPing: 0 });
      closed.add(1, { nextCall: 1, nextPing: 0 });
      closed.add(7, { nextCall: 4, nextPing: 2 });
      closed.runnerReadCall(2);
      expect([closed.has(0), closed.has(1), closed.has(7)]).toEqual([false, false, true]);
      expect(closed.size).toBe(1);
      closed.runnerReadPing(2);
      expect(closed.size).toBe(0);
    });
  });
});
