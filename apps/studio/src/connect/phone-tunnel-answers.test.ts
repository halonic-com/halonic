import type { PairingId } from "@halonicjs/studio-feature-remote/phone";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  readComputers,
  readConnect,
  readForget,
  readPairingOutcome,
  readPairingStep,
  readSendAnswer,
  readTunnelEvent,
} from "./phone-tunnel-answers.ts";

const pairing = "pairing-1" as PairingId;

/** A report that keeps its lines, so a test sees what reached the log. */
function reports(): { lines: string[]; report: (line: string) => void } {
  const lines: string[] = [];
  return { lines, report: (line) => lines.push(line) };
}

const listed = {
  id: "c1",
  standing: "paired",
  name: "Test laptop",
  endpoints: ["tcp://192.168.1.20:4100"],
  pairedAtMs: 0,
  lastConnectedAtMs: 1000,
};

const laptop = {
  id: "c1",
  name: "Test laptop",
  pairedAt: "1970-01-01T00:00:00.000Z",
  lastConnectedAt: "1970-01-01T00:00:01.000Z",
  endpoints: ["tcp://192.168.1.20:4100"],
  standing: "paired",
};

verifies("studio.connect.phone-tunnel", () => {
  describe("a pairing's start", () => {
    it("gives the check code with the adapter's pairing id", () => {
      const { lines, report } = reports();
      const answer = { kind: "check", computerName: "Test laptop", checkCode: "4F72KQ" };
      expect(readPairingStep(answer, pairing, report)).toEqual({ ...answer, pairing });
      expect(lines).toEqual([]);
    });

    it("passes the pairing problems and the phone's own problems on as they are", () => {
      for (const problem of [
        { kind: "wrong-code", triesLeft: 3 },
        { kind: "code-ended" },
        { kind: "code-used" },
        { kind: "rate-limited" },
        { kind: "handshake-failed" },
        { kind: "cant-reach", reason: "network-down" },
        { kind: "unreadable" },
        { kind: "bad-start" },
        { kind: "no-local-network", askAgain: true },
        { kind: "key-unreadable" },
        { kind: "keys-unavailable" },
      ]) {
        expect(readPairingStep(problem, pairing, reports().report)).toEqual(problem);
      }
    });

    it("reads not-paired, the page naming a computer that isn't listed, as bad-start", () => {
      expect(readPairingStep({ kind: "not-paired" }, pairing, reports().report)).toEqual({
        kind: "bad-start",
      });
    });

    it("reports an answer it doesn't know and reads it as bad-start", () => {
      for (const answer of [
        { kind: "check", computerName: "Test laptop", checkCode: "4F72KQ", privateKey: "x" },
        { kind: "denied" },
        "the shell broke",
        { kind: "wrong-code", triesLeft: -1 },
      ]) {
        const { lines, report } = reports();
        expect(readPairingStep(answer, pairing, report)).toEqual({ kind: "bad-start" });
        expect(lines).toHaveLength(1);
      }
    });
  });

  describe("the wait for Allow", () => {
    it("gives the paired computer with ISO times", () => {
      expect(readPairingOutcome({ kind: "paired", computer: listed }, reports().report)).toEqual({
        kind: "paired",
        computer: laptop,
      });
    });

    it("reads denied as refused and timed-out as timeout", () => {
      expect(readPairingOutcome({ kind: "denied" }, reports().report)).toEqual({ kind: "refused" });
      expect(readPairingOutcome({ kind: "timed-out" }, reports().report)).toEqual({
        kind: "timeout",
      });
    });

    it("passes a wrong code after the check code and broken key storage on", () => {
      for (const problem of [{ kind: "wrong-code", triesLeft: 2 }, { kind: "keys-unavailable" }]) {
        expect(readPairingOutcome(problem, reports().report)).toEqual(problem);
      }
    });

    it("reports a paired computer it can't read and reads it as unreadable", () => {
      const { lines, report } = reports();
      const unnamed = { ...listed, name: undefined, standing: "unreadable" };
      expect(readPairingOutcome({ kind: "paired", computer: unnamed }, report)).toEqual({
        kind: "unreadable",
      });
      expect(lines).toHaveLength(1);
    });
  });

  describe("the paired list", () => {
    it("lists readable computers in full and an unreadable one by its id alone", () => {
      const unreadable = { id: "c2", standing: "unreadable", endpoints: [] };
      const removed = { ...listed, id: "c3", standing: "removed", lastConnectedAtMs: undefined };
      const answer = { kind: "computers", computers: [listed, unreadable, removed] };
      const { lastConnectedAt: _, ...removedLaptop } = laptop;
      expect(readComputers(answer, reports().report)).toEqual([
        laptop,
        { id: "c2", standing: "unreadable" },
        { ...removedLaptop, id: "c3", standing: "removed" },
      ]);
    });

    it("reads any problem, or an answer it doesn't know, as broken key storage", () => {
      for (const answer of [{ kind: "keys-unavailable" }, { kind: "key-unreadable" }, null]) {
        expect(readComputers(answer, reports().report)).toEqual({ kind: "keys-unavailable" });
      }
    });
  });

  describe("forget and connect", () => {
    it("reads a computer already gone as forgotten", () => {
      expect(readForget({ kind: "forgotten" }, reports().report)).toEqual({ kind: "forgotten" });
      expect(readForget({ kind: "not-paired" }, reports().report)).toEqual({ kind: "forgotten" });
      expect(readForget({ kind: "keys-unavailable" }, reports().report)).toEqual({
        kind: "keys-unavailable",
      });
    });

    it("passes connecting and the connect problems on, and reads anything else as can't reach", () => {
      for (const answer of [
        { kind: "connecting" },
        { kind: "not-paired" },
        { kind: "cant-reach", reason: "timeout" },
        { kind: "no-local-network", askAgain: false },
        { kind: "key-unreadable" },
      ]) {
        expect(readConnect(answer, reports().report)).toEqual(answer);
      }
      const { lines, report } = reports();
      expect(readConnect({ kind: "unreadable" }, report)).toEqual({
        kind: "cant-reach",
        reason: "unreachable",
      });
      expect(lines).toEqual(["phone_connect answered unreadable"]);
    });
  });

  describe("status events", () => {
    it("gives nextTryAt as an ISO time, a first wait under one second included", () => {
      const event = {
        kind: "status",
        computer: "c1",
        status: { state: "reconnecting", lastTry: "timeout", nextTryAtMs: 500 },
      };
      expect(readTunnelEvent(event, reports().report)).toEqual({
        kind: "status",
        computer: "c1",
        status: {
          state: "reconnecting",
          lastTry: "timeout",
          nextTryAt: "1970-01-01T00:00:00.500Z",
        },
      });
    });

    it("passes the other states on and reports an event it doesn't know", () => {
      const event = { kind: "status", computer: "c1", status: { state: "removed" } };
      expect(readTunnelEvent(event, reports().report)).toEqual({
        kind: "status",
        computer: "c1",
        status: { state: "removed" },
      });
      const { lines, report } = reports();
      expect(readTunnelEvent({ ...event, kind: "session" }, report)).toBeUndefined();
      expect(
        readTunnelEvent({ ...event, status: { state: "reconnecting", nextTryAtMs: 9e15 } }, report),
      ).toBeUndefined();
      expect(lines).toHaveLength(2);
    });
  });
});

verifies("studio.connect.phone-tunnel-messages", () => {
  describe("session events", () => {
    it("reads a session that opened and its host messages, text untouched", () => {
      const opened = { kind: "session-opened", computer: "c1", generation: 3 };
      const message = { kind: "message", computer: "c1", generation: 3, text: '{"type":"x"}' };
      expect(readTunnelEvent(opened, reports().report)).toEqual(opened);
      expect(readTunnelEvent(message, reports().report)).toEqual(message);
    });

    it("reports a session event it doesn't know without its text", () => {
      const { lines, report } = reports();
      const secretish = "text the log must not hold";
      const events = [
        { kind: "session-opened", computer: "c1", generation: 0 },
        { kind: "session-opened", computer: "c1", generation: 1.5 },
        { kind: "message", computer: "c1", generation: 3 },
        { kind: "message", computer: "c1", generation: 3, text: secretish, key: "k" },
      ];
      for (const event of events) expect(readTunnelEvent(event, report)).toBeUndefined();
      expect(lines).toHaveLength(events.length);
      expect(lines.join("\n")).not.toContain(secretish);
    });
  });

  describe("send answers", () => {
    it("reads sent and each refusal as the port's result", () => {
      expect(readSendAnswer({ sent: true }, reports().report)).toEqual({ sent: true });
      for (const reason of ["not-open", "too-large", "not-allowed"]) {
        const answer = { sent: false, reason };
        expect(readSendAnswer(answer, reports().report)).toEqual(answer);
      }
    });

    it("reads an answer it doesn't know as not-open, and reports it", () => {
      const { lines, report } = reports();
      for (const answer of [null, "sent", { sent: false, reason: "busy" }, { sent: true, x: 1 }]) {
        expect(readSendAnswer(answer, report)).toEqual({ sent: false, reason: "not-open" });
      }
      expect(lines).toEqual(Array(4).fill("tunnel_send gave an answer the page doesn't know"));
    });
  });
});
