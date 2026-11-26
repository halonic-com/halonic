import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  evaluate,
  type PageSocket,
  type Polling,
  rememberScript,
  studioPage,
} from "./studio-page.ts";

function polling(answers: readonly (readonly { type: string; url: string }[] | Error)[]): Polling {
  let clock = 0;
  let call = 0;
  return {
    list: async () => {
      const answer = answers[Math.min(call++, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      return (answer ?? []).map((page) => ({ ...page, webSocketDebuggerUrl: `ws://${page.url}` }));
    },
    wait: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
}

/** A socket that opens, then answers the one message with `reply`. */
function socketAnswering(reply: unknown, sent: string[]): (address: string) => PageSocket {
  return () => {
    const listeners = new Map<string, (event: { data?: unknown }) => void>();
    queueMicrotask(() => listeners.get("open")?.({}));
    return {
      addEventListener: (type, listener) => listeners.set(type, listener),
      send: (data) => {
        sent.push(data);
        queueMicrotask(() => listeners.get("message")?.({ data: JSON.stringify(reply) }));
      },
      close: () => {},
    };
  };
}

verifies("open-timings.summary", () => {
  describe("studioPage", () => {
    it("waits until DevTools lists the Studio page", async () => {
      const page = await studioPage(
        9333,
        10,
        polling([
          new Error("refused"),
          [{ type: "page", url: "app/inbox.html" }],
          [{ type: "page", url: "app/studio.html" }],
        ]),
      );
      expect(page).toBe("ws://app/studio.html");
    });

    it("says what it last saw when no Studio page comes", async () => {
      await expect(
        studioPage(9333, 3, polling([[{ type: "page", url: "app/inbox.html" }]])),
      ).rejects.toThrow('no Studio page on DevTools port 9333 (last seen: ["app/inbox.html"])');
    });
  });

  describe("rememberScript", () => {
    it("puts the folder in Recent and keeps it as what the window shows", () => {
      const script = rememberScript("acme-folder", "Acme");
      expect(script).toContain('localStorage.setItem("halonic.workspace.recent"');
      expect(script).toContain(
        JSON.stringify(JSON.stringify([{ location: "acme-folder", name: "Acme" }])),
      );
      expect(script).toContain('invoke("window_content_set"');
    });
  });

  describe("evaluate", () => {
    it("asks the page to run the expression and answers its value", async () => {
      const sent: string[] = [];
      const value = await evaluate(
        "ws://page",
        "1 + 1",
        socketAnswering({ id: 1, result: { result: { value: 2 } } }, sent),
      );
      expect(value).toBe(2);
      expect(JSON.parse(sent[0] ?? "")).toMatchObject({
        method: "Runtime.evaluate",
        params: { expression: "1 + 1" },
      });
    });

    it("throws what the page threw", async () => {
      const refused = socketAnswering(
        { id: 1, result: { exceptionDetails: { text: "Uncaught" } } },
        [],
      );
      await expect(evaluate("ws://page", "boom()", refused)).rejects.toThrow(
        'the page refused: {"text":"Uncaught"}',
      );
    });
  });
});
