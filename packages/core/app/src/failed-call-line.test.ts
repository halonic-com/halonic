import {
  maxServiceRetries,
  type RunEvent,
  type RunEventBody,
  type ServiceRefusal,
  type ToolFailureCause,
} from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  connectorNotStartedLine,
  type FailedCall,
  failedCallLine,
  failedCallParts,
  failedToolCalls,
} from "./failed-call.ts";

/** The line as text, with each name in `code` or *name* marks, to see how it looks. */
function shown(tool: string, failed: FailedCall): string {
  return failedCallParts(failedCallLine(tool, failed))
    .map((part) => {
      if (typeof part === "string") return part;
      return part.look === "code" ? `\`${part.name}\`` : `*${part.name}*`;
    })
    .join("");
}

const started = (why: ToolFailureCause & { code: "connector-not-started" }): FailedCall => ({
  cause: why,
});

verifies("app.failed-call-line", () => {
  describe("failedCallLine", () => {
    it("names a time limit's seconds and the tool with its connector", () => {
      expect(
        shown("search_pages", {
          reason: "no-answer",
          cause: { code: "time-limit", seconds: 60 },
          connector: "notion",
        }),
      ).toBe(
        "Didn't work: the tool `search_pages` (*notion*) didn't answer within 60 seconds, so it may or may not have done its work.",
      );
      expect(shown("search_pages", { cause: { code: "time-limit", seconds: 1 } })).toContain(
        "within 1 second,",
      );
    });

    it("says the engine stopped, and each reason a call wasn't made", () => {
      expect(shown("t", { cause: { code: "engine-stopped" } })).toBe(
        "Didn't work: Halonic stopped while the tool `t` was running, so it may or may not have done its work.",
      );
      const notMade = (why: "not-connected" | "tool-gone" | "sending-off" | "bad-arguments") =>
        shown("t", { cause: { code: "not-made", why } });
      expect(notMade("not-connected")).toBe(
        "Didn't work: the call to `t` wasn't made, because its connector isn't connected.",
      );
      expect(notMade("tool-gone")).toContain("its connector no longer offers it.");
      expect(notMade("sending-off")).toContain("because sending is turned off.");
      expect(notMade("bad-arguments")).toContain("arguments that aren't usable.");
    });

    it("names the program, secret or plugin a connector that didn't start missed", () => {
      expect(
        shown(
          "create_note",
          started({ code: "connector-not-started", why: "program-missing", name: "notes-mcp" }),
        ),
      ).toBe(
        "Didn't work: the connector of the tool `create_note` didn't start: its program `notes-mcp` isn't on this computer.",
      );
      expect(
        shown("t", {
          ...started({ code: "connector-not-started", why: "secret-not-set", name: "NOTES_KEY" }),
          connector: "notes",
        }),
      ).toBe(
        "Didn't work: the connector *notes* didn't start: it needs the secret `NOTES_KEY`, which isn't set.",
      );
      expect(
        shown(
          "t",
          started({ code: "connector-not-started", why: "plugin-not-trusted", name: "acme" }),
        ),
      ).toContain("its plugin *acme* isn't trusted yet.");
      expect(
        shown("t", started({ code: "connector-not-started", why: "plugin-changed", name: "acme" })),
      ).toContain("its plugin *acme* changed since you trusted it.");
      expect(
        shown(
          "t",
          started({ code: "connector-not-started", why: "plugin-stopped", name: "Weather" }),
        ),
      ).toContain(". The sandbox didn't work when its plugin *Weather* started.");
    });

    it("doesn't mark a stopped plugin as a plugin, since its cause holds its name and not its id", () => {
      const cause = {
        code: "connector-not-started",
        why: "plugin-stopped",
        name: "Weather",
      } as const;
      const names = failedCallParts(failedCallLine("t", started(cause))).filter(
        (part) => typeof part !== "string",
      );
      expect(names).toContainEqual({ name: "Weather", look: "name" });
      expect(names.some((part) => part.plugin === true)).toBe(false);
    });

    it("says the sandbox a plugin runs in can't start on this computer, with or without a name", () => {
      expect(
        shown("t", {
          cause: { code: "connector-not-started", why: "sandbox-not-ready" },
          connector: "orders",
        }),
      ).toBe(
        "Didn't work: the connector *orders* didn't start: the sandbox its plugin runs in can't start on this computer.",
      );
    });

    it("says only that a connector didn't start when the cause names nothing", () => {
      expect(shown("t", started({ code: "connector-not-started", why: "other", name: "x" }))).toBe(
        "Didn't work: the connector of the tool `t` didn't start.",
      );
      expect(shown("t", started({ code: "connector-not-started", why: "program-missing" }))).toBe(
        "Didn't work: the connector of the tool `t` didn't start.",
      );
    });

    it("says a call broke off without an answer, or only that it didn't work", () => {
      expect(shown("t", { reason: "no-answer" })).toBe(
        "Didn't work: the tool `t` broke off without an answer, so it may or may not have done its work.",
      );
      expect(shown("t", {})).toBe("Didn't work.");
    });
  });

  describe("failedCallLine for a refused service", () => {
    const refused = (refusal: ServiceRefusal, sentOnce?: true): FailedCall => ({
      cause: { code: "service-refused", ...refusal, ...(sentOnce ? { sentOnce } : {}) },
      connector: "shop",
    });

    it("says a 401 is the token, and to set a new one", () => {
      expect(shown("list_orders", refused({ why: "not-accepted" }))).toBe(
        "Didn't work: the service didn't accept the token for the tool `list_orders` (*shop*). It may be mistyped or revoked, so set a new one.",
      );
    });

    it("says a 403 is the token's permissions, at the service", () => {
      expect(shown("list_orders", refused({ why: "not-allowed" }))).toBe(
        "Didn't work: the token isn't allowed to do what the tool `list_orders` (*shop*) asked. Check its permissions at the service.",
      );
    });

    it("says a 429 asked to slow down, how often Halonic tried again, and nothing sent twice only with sentOnce", () => {
      expect(shown("t", refused({ why: "slow-down", retries: 0 }))).toBe(
        "Didn't work: the service asked Halonic to slow down when the tool `t` (*shop*) called it. Try again in a few minutes.",
      );
      expect(shown("t", refused({ why: "slow-down", retries: 1 }))).toContain(
        "called it, and still did after Halonic tried again once. Try again in a few minutes.",
      );
      expect(shown("create_order", refused({ why: "slow-down", retries: 2 }, true))).toBe(
        "Didn't work: the service asked Halonic to slow down when the tool `create_order` (*shop*) called it, and still did after Halonic tried again twice. Try again in a few minutes. Nothing was sent twice.",
      );
    });

    it("doesn't say nothing was sent twice for a read tool, whose cause has no sentOnce (HAL-19373)", () => {
      expect(shown("list_orders", refused({ why: "slow-down", retries: 2 }))).toBe(
        "Didn't work: the service asked Halonic to slow down when the tool `list_orders` (*shop*) called it, and still did after Halonic tried again twice. Try again in a few minutes.",
      );
    });

    it("names an undeclared host as code, and says nothing reached it", () => {
      const failed = refused({ why: "host-not-declared", host: "example.net" });
      expect(shown("create_order", failed)).toBe(
        "Didn't work: the tool `create_order` (*shop*) tried to reach `example.net`, which its integration doesn't list. Halonic stopped it, so nothing reached `example.net`. Look at the integration's code.",
      );
      expect(failedCallParts(failedCallLine("create_order", failed))).toContainEqual({
        name: "example.net",
        look: "code",
      });
    });

    it("says only once or twice, as Halonic tries again at most twice", () => {
      // Raising the cap fails here first, so the line gets words for more than twice.
      expect(maxServiceRetries).toBe(2);
    });

    describe("with the outcome unknown, as an earlier step may already have done its work (HAL-19373)", () => {
      const mayHaveWorked = (refusal: ServiceRefusal): FailedCall => ({
        reason: "no-answer",
        cause: { code: "service-refused", ...refusal, sentOnce: true },
        connector: "shop",
      });

      it("says a 401 is the token, and to check before setting a new one", () => {
        expect(shown("create_order", mayHaveWorked({ why: "not-accepted" }))).toBe(
          "Didn't work: the service didn't accept the token for the tool `create_order` (*shop*), after an earlier step may already have done its work. Check before you try again, and set a new token if it was mistyped or revoked.",
        );
      });

      it("says a 403 is the token's permissions, and to check before trying again", () => {
        expect(shown("create_order", mayHaveWorked({ why: "not-allowed" }))).toBe(
          "Didn't work: the token isn't allowed to do what the tool `create_order` (*shop*) asked, after an earlier step may already have done its work. Check before you try again.",
        );
      });

      it("says a 429 asked to slow down, without how often Halonic tried again or nothing sent twice", () => {
        expect(shown("create_order", mayHaveWorked({ why: "slow-down", retries: 2 }))).toBe(
          "Didn't work: the service asked Halonic to slow down when the tool `create_order` (*shop*) called it, after an earlier step may already have done its work. Check before you try again.",
        );
      });

      it("names an undeclared host as code, and says nothing reached it", () => {
        const failed = mayHaveWorked({ why: "host-not-declared", host: "example.net" });
        expect(shown("create_order", failed)).toBe(
          "Didn't work: the tool `create_order` (*shop*) tried to reach `example.net`, which its integration doesn't list, after an earlier step may already have done its work. Halonic stopped it, so nothing reached `example.net`. Check before you try again, and look at the integration's code.",
        );
      });

      it("keeps the broke-off line when there is no cause", () => {
        expect(shown("create_order", { reason: "no-answer", connector: "shop" })).toBe(
          "Didn't work: the tool `create_order` (*shop*) broke off without an answer, so it may or may not have done its work.",
        );
      });
    });
  });

  it("gives a connector that couldn't list its tools its listing line", () => {
    const listing = (cause: Parameters<typeof connectorNotStartedLine>[1]) =>
      failedCallParts(connectorNotStartedLine("notes", cause))
        .map((part) => (typeof part === "string" ? part : part.name))
        .join("");
    expect(
      listing({ code: "connector-not-started", why: "program-missing", name: "notes-mcp" }),
    ).toBe("Couldn't list the tools from notes: its program notes-mcp isn't on this computer.");
    expect(listing({ code: "connector-not-started", why: "sandbox-not-ready" })).toBe(
      "Couldn't list the tools from notes: the sandbox its plugin runs in can't start on this computer.",
    );
    expect(listing({ code: "connector-not-started", why: "other" })).toBe(
      "Couldn't list the tools from notes.",
    );
  });

  it("fails to fill a line that names a value it isn't given", () => {
    expect(() => failedCallParts({ key: "noAnswer", values: {} })).toThrow(
      "noAnswer: no value for {tool}",
    );
  });

  describe("failedToolCalls", () => {
    let seq = 0;
    const event = (body: RunEventBody): RunEvent =>
      ({ seq: ++seq, at: "2026-11-21T10:20:00.000Z", runId: "run_a", ...body }) as RunEvent;

    it("finds the failed calls of a step with their connector, escaped, in order", () => {
      const log = [
        event({ type: "state.entered", state: "read" }),
        event({
          type: "connector.started",
          state: "read",
          agent: "w",
          connector: "no\u202etes",
          timeoutMs: 1,
        }),
        event({ type: "tool.called", agent: "w", tool: "create_note", args: { a: 1 } }),
        event({
          type: "tool.result",
          agent: "w",
          tool: "create_note",
          result: "x",
          outcome: "unknown",
        }),
        event({ type: "tool.called", agent: "w", tool: "search", args: {} }),
        event({ type: "tool.result", agent: "w", tool: "search", result: "x", outcome: "ok" }),
      ];

      expect(failedToolCalls(log, log)).toEqual([
        {
          id: log[2]?.seq,
          tool: "create_note",
          args: { a: 1 },
          failed: { reason: "no-answer", connector: "no\\u202etes" },
        },
      ]);
    });
  });
});
