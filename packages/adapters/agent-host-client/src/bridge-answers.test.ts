import type { BridgeTools } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { answersSent, hostAnswering, openOn, services } from "./bridges.test-helper.ts";
import { fitsAnswerLimit } from "./bridges.ts";
import { type FakeHost, ok, refused } from "./fake-host.test-helper.ts";

/** Waits until `host` has had `count` answers, and returns them. */
async function answers(host: FakeHost, count: number): Promise<unknown[]> {
  await vi.waitFor(() => expect(answersSent(host)).toHaveLength(count));
  return answersSent(host);
}

verifies("agent-host-client.bridges", () => {
  describe("answers the host can't take (HAL-4730)", () => {
    const unsendable = "Studio's answer to this call couldn't be sent to the agent host.";
    const unencodable = "Studio's answer to this call couldn't be encoded as JSON.";
    const limit = 1024 * 1024;
    /** The answer's bytes around a `secrets.get` result: `{"bridge":"b1","call":"1","result":""}`. */
    const envelope = JSON.stringify({ bridge: "b1", call: "1", result: "" }).length;

    /** A bridge whose `anthropic-key` is `key`, asked for it as call 1. */
    async function answerKey(host: FakeHost, key: string): Promise<void> {
      const { stream } = await openOn(host, services({ secrets: { get: async () => key } }));
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
    }
    const tooLarge = {
      bridge: "b1",
      call: "1",
      error:
        "Studio's answer to this call is larger than the agent host takes (1 MiB), so it wasn't sent.",
    };

    it("sends an error for the call instead of an answer over 1 MiB", async () => {
      const host = hostAnswering();
      const tools = services().tools;
      const big: BridgeTools = {
        ...tools,
        call: async () => ({ result: "x".repeat(2 * 1024 * 1024), outcome: "ok" }),
      };
      const { stream } = await openOn(host, services({ tools: big }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("sends an error for the call when the host answers 413", async () => {
      const host = hostAnswering().answer("POST /v1/bridge/answer", (body) =>
        "result" in (body as object)
          ? refused(413, "body_too_large", "Too large.")
          : ok({ answered: true }),
      );
      const { stream } = await openOn(host);
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
      expect(await answers(host, 2)).toEqual([{ bridge: "b1", call: "1", result: null }, tooLarge]);
    });

    it("sends an error for the call when the host refuses the answer for another reason", async () => {
      const host = hostAnswering().answer("POST /v1/bridge/answer", (body) =>
        "result" in (body as object) ? refused(400, "bad_request", "No.") : ok({ answered: true }),
      );
      const { stream } = await openOn(host);
      stream.send({ type: "call", call: "1", method: "tools.list", params: {} });
      expect(await answers(host, 2)).toEqual([
        { bridge: "b1", call: "1", result: [] },
        { bridge: "b1", call: "1", error: unsendable },
      ]);
    });

    it("sends an error for a result with no JSON form, and still closes", async () => {
      const host = hostAnswering();
      const tools = services().tools;
      const odd: BridgeTools = {
        ...tools,
        call: async () => ({ result: "done", outcome: "ok", bytes: 10n }) as never,
      };
      const { bridge, stream } = await openOn(host, services({ tools: odd }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", error: unencodable }]);
      stream.end();
      await expect(bridge.close()).resolves.toBeUndefined();
    });

    it("sends an answer of exactly 1 MiB, envelope included, as it is", async () => {
      const host = hostAnswering();
      const key = "k".repeat(limit - envelope);
      await answerKey(host, key);
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: key }]);
    });

    it("sends an error when the result fits but its envelope takes the answer over 1 MiB", async () => {
      const host = hostAnswering();
      await answerKey(host, "k".repeat(limit - envelope + 1));
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("counts a 4-byte character as 4 bytes, not as its 2 UTF-16 units", async () => {
      const host = hostAnswering();
      // Half the limit in UTF-16 units, but over it in UTF-8 bytes.
      await answerKey(host, "\u{1f600}".repeat(limit / 4));
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("sends the too-large error for a service whose error message is over 1 MiB", async () => {
      const host = hostAnswering();
      const failing: BridgeTools = {
        ...services().tools,
        call: async () => {
          throw new Error("e".repeat(2 * limit));
        },
      };
      const { stream } = await openOn(host, services({ tools: failing }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("sends the error answer once when the host answers 413 to it as well", async () => {
      const host = hostAnswering().answer(
        "POST /v1/bridge/answer",
        refused(413, "body_too_large", "Too large."),
      );
      const { bridge, stream } = await openOn(host);
      stream.send({ type: "call", call: "1", method: "tools.list", params: {} });
      expect(await answers(host, 2)).toEqual([{ bridge: "b1", call: "1", result: [] }, tooLarge]);
      stream.end();
      await bridge.close();
      expect(answersSent(host)).toHaveLength(2);
    });

    it("answers a service that rejects with a value it can't turn into text", async () => {
      const host = hostAnswering();
      const failing: BridgeTools = {
        ...services().tools,
        call: () => Promise.reject(Object.create(null)),
      };
      const { stream } = await openOn(host, services({ tools: failing }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([
        {
          bridge: "b1",
          call: "1",
          error: "Studio's service failed with an error it couldn't read.",
        },
      ]);
    });

    it("sends an error for a result whose toJSON throws", async () => {
      const host = hostAnswering();
      const odd: BridgeTools = {
        ...services().tools,
        call: async () =>
          ({
            result: "done",
            outcome: "ok",
            toJSON: () => {
              throw new Error("Not today.");
            },
          }) as never,
      };
      const { stream } = await openOn(host, services({ tools: odd }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", error: unencodable }]);
    });

    it("sends text cut in the middle of an emoji as well-formed text", async () => {
      const host = hostAnswering();
      const tools = services().tools;
      const cut: BridgeTools = {
        ...tools,
        call: async () => ({ result: "hi \ud83d", outcome: "ok" }),
      };
      const { stream } = await openOn(host, services({ tools: cut }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([
        { bridge: "b1", call: "1", result: { result: "hi \ufffd", outcome: "ok" } },
      ]);
    });

    it("measures the answer in UTF-8 bytes, not characters", () => {
      expect(fitsAnswerLimit("a".repeat(limit))).toBe(true);
      expect(fitsAnswerLimit("a".repeat(limit + 1))).toBe(false);
      // "é" is 2 bytes: half the limit in characters is the whole limit in bytes.
      expect(fitsAnswerLimit("é".repeat(limit / 2))).toBe(true);
      expect(fitsAnswerLimit(`${"é".repeat(limit / 2)}a`)).toBe(false);
      // An emoji is 2 UTF-16 units and 4 bytes.
      expect(fitsAnswerLimit("\u{1f600}".repeat(limit / 4))).toBe(true);
      expect(fitsAnswerLimit(`${"\u{1f600}".repeat(limit / 4)}a`)).toBe(false);
      // "€" is 3 bytes, and a lone surrogate counts as U+FFFD, 3 bytes too.
      const thirds = Math.floor(limit / 3);
      const rest = "a".repeat(limit - thirds * 3);
      for (const unit of ["€", "\ud800", "\udc00"]) {
        expect(fitsAnswerLimit(unit.repeat(thirds) + rest)).toBe(true);
        expect(fitsAnswerLimit(`${unit.repeat(thirds) + rest}a`)).toBe(false);
      }
      // A high surrogate before a character that isn't a low one is alone too.
      expect(fitsAnswerLimit("\ud800a".repeat(limit / 4))).toBe(true);
      expect(fitsAnswerLimit(`${"\ud800a".repeat(limit / 4)}a`)).toBe(false);
    });
  });
});
