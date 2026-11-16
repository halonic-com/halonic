import { gatewayMaxMessageBytes, gatewayMaxPromptLength } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseGatewayClientMessage } from "./message-parser.ts";

const encoder = new TextEncoder();

function text(value: unknown) {
  return {
    binary: false,
    bytes: encoder.encode(typeof value === "string" ? value : JSON.stringify(value)),
  };
}

const watch = { type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 };

verifies("remote-gateway.message-parser", () => {
  describe("parseGatewayClientMessage", () => {
    it("accepts each of the six messages a phone may send", () => {
      const messages = [
        { type: "hello", id: "h", version: 1 },
        { type: "list-sessions", id: "l" },
        watch,
        { type: "unwatch", id: "u", sessionId: "s1" },
        { type: "answer-approval", id: "a", sessionId: "s1", approvalId: "p1", decision: "deny" },
        { type: "prompt", id: "p", sessionId: "s1", text: "hello" },
      ];
      for (const message of messages) {
        expect(parseGatewayClientMessage(text(message))).toEqual({ ok: true, message });
      }
    });

    it("refuses a message over 64 KiB as too-large before it parses it", () => {
      const bytes = new Uint8Array(gatewayMaxMessageBytes + 1).fill(0x7b);
      expect(parseGatewayClientMessage({ binary: false, bytes })).toEqual({
        ok: false,
        code: "too-large",
      });
    });

    it("takes a message of exactly 64 KiB as far as its shape", () => {
      const padding = " ".repeat(gatewayMaxMessageBytes - JSON.stringify(watch).length);
      expect(parseGatewayClientMessage(text(JSON.stringify(watch) + padding))).toMatchObject({
        ok: true,
      });
    });

    it("refuses a binary frame, bad UTF-8 and text that is not one JSON object", () => {
      const bad = [
        { binary: true, bytes: encoder.encode(JSON.stringify(watch)) },
        { binary: false, bytes: Uint8Array.of(0x7b, 0xc3, 0x28, 0x7d) },
        text(""),
        text("not json"),
        text("[]"),
        text("null"),
        text('"watch"'),
        text("{}{}"),
      ];
      for (const frame of bad) {
        expect(parseGatewayClientMessage(frame)).toEqual({ ok: false, code: "malformed" });
      }
    });

    it("refuses an unlisted type, also one that is a property of every object", () => {
      for (const type of ["run-command", "read-secret", "", "toString", "__proto__", 7]) {
        expect(parseGatewayClientMessage(text({ type, id: "x" }))).toEqual({
          ok: false,
          code: "malformed",
        });
      }
    });

    it("refuses a missing, extra or wrongly typed field", () => {
      const bad = [
        { type: "watch", id: "w1", sessionId: "s1" },
        { ...watch, extra: true },
        { ...watch, afterSeq: "0" },
        { ...watch, sessionId: 5 },
        { type: "hello", id: "h", version: "1" },
        { type: "hello", id: "h", version: 1.5 },
        { type: "answer-approval", id: "a", sessionId: "s", approvalId: "p", decision: "maybe" },
        {
          type: "answer-approval",
          id: "a",
          sessionId: "s",
          approvalId: "p",
          decision: "approve",
          risk: "normal",
        },
        { type: "list-sessions", id: "l", sessionId: "s1" },
      ];
      for (const message of bad) {
        expect(parseGatewayClientMessage(text(message))).toEqual({ ok: false, code: "malformed" });
      }
    });

    it("refuses an id that is empty, too long or has other characters", () => {
      for (const id of ["", "a".repeat(129), "a b", "a/b", "ä", "a\n", "../x"]) {
        expect(parseGatewayClientMessage(text({ ...watch, id }))).toEqual({
          ok: false,
          code: "malformed",
        });
      }
      const longest = "a".repeat(128);
      expect(parseGatewayClientMessage(text({ ...watch, id: longest }))).toMatchObject({
        ok: true,
      });
    });

    it("refuses an afterSeq that is not a whole number from 0", () => {
      for (const afterSeq of [-1, 1.5, 2 ** 53, null]) {
        expect(parseGatewayClientMessage(text({ ...watch, afterSeq }))).toEqual({
          ok: false,
          code: "malformed",
        });
      }
      expect(
        parseGatewayClientMessage(
          text('{"type":"watch","id":"w","sessionId":"s","afterSeq":1e400}'),
        ),
      ).toEqual({
        ok: false,
        code: "malformed",
      });
    });

    it("refuses an empty prompt or one over 10,000 code units", () => {
      const prompt = (value: string) =>
        text({ type: "prompt", id: "p", sessionId: "s1", text: value });
      expect(parseGatewayClientMessage(prompt(""))).toEqual({ ok: false, code: "malformed" });
      expect(parseGatewayClientMessage(prompt("x".repeat(gatewayMaxPromptLength + 1)))).toEqual({
        ok: false,
        code: "malformed",
      });
      expect(parseGatewayClientMessage(prompt("x".repeat(gatewayMaxPromptLength)))).toMatchObject({
        ok: true,
      });
    });

    it("leaves a hello with another version to the host, which closes with unsupported-version", () => {
      const result = parseGatewayClientMessage(text({ type: "hello", id: "h", version: 2 }));
      expect(result).toMatchObject({ ok: true, message: { version: 2 } });
    });
  });
});
