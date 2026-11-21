import type { RunEvent } from "@halonicjs/events";
import type { KeyOrigins } from "@halonicjs/ports";
import type { KeyAddressQuestion } from "@halonicjs/studio-feature-models/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keyOriginAskOf, type KeyOriginPrompt } from "./key-origin-prompt.ts";

/** A run log that starts as `started` says. */
function runsStartedWith(started: Partial<Extract<RunEvent, { type: "run.started" }>> | "none") {
  const event = {
    type: "run.started",
    runId: "run-1",
    seq: 1,
    at: "2026-11-21T09:14:00.000Z",
    hubId: "acme",
    workflowId: "triage",
    input: {},
    kind: "workflow",
    definitionsVersion: "v1",
    ...(started === "none" ? {} : started),
  } as RunEvent;
  return {
    events: async (runId: string) => (runId === "run-1" && started !== "none" ? [event] : []),
  };
}

const keyOrigins: KeyOrigins = {
  allowedOrigins: async (name) =>
    name === "gateway-key" ? ["https://api.example.com"] : undefined,
};

/** A prompt that answers `answer` and records what it was asked and saved. */
function promptAnswering(answer: "allowed" | "not-allowed") {
  const asked: KeyAddressQuestion[] = [];
  const saved: string[] = [];
  const prompt: KeyOriginPrompt = {
    questions: {
      ask: async (question, { save }) => {
        asked.push(question);
        if (answer === "allowed") await save();
        return answer;
      },
    },
    allowOrigin: async (key, origin) => {
      saved.push(`${key} ${origin}`);
      return true;
    },
  };
  return { prompt, asked, saved };
}

const setTimer = () => () => undefined;

verifies("studio.key-origin-prompt", () => {
  describe("keyOriginAskOf", () => {
    it("may ask for a run a person started with Run, from the Inbox, or from a workflow's own Run", async () => {
      for (const trigger of [{ type: "manual" }, { type: "inbox" }, undefined] as const) {
        const runs = runsStartedWith(
          trigger === undefined ? {} : { trigger: { ...trigger, at: "2026-11-21T09:14:00.000Z" } },
        );
        const ask = keyOriginAskOf(promptAnswering("allowed").prompt, {
          runs,
          keyOrigins,
          setTimer,
        });
        expect(await ask.mayAsk({ runId: "run-1" })).toBe(true);
      }
    });

    it("never asks for a routine's trigger, a subflow, a chat turn or a run it can't read", async () => {
      const { prompt } = promptAnswering("allowed");
      for (const type of ["schedule", "every", "mail", "signal", "webhook"] as const) {
        const runs = runsStartedWith({ trigger: { type, at: "2026-11-21T09:14:00.000Z" } });
        expect(
          await keyOriginAskOf(prompt, { runs, keyOrigins, setTimer }).mayAsk({ runId: "run-1" }),
        ).toBe(false);
      }
      const subflow = runsStartedWith({ parent: { runId: "run-0", state: "draft", depth: 1 } });
      expect(
        await keyOriginAskOf(prompt, { runs: subflow, keyOrigins, setTimer }).mayAsk({
          runId: "run-1",
        }),
      ).toBe(false);
      const manual = runsStartedWith({});
      expect(
        await keyOriginAskOf(prompt, { runs: manual, keyOrigins, setTimer }).mayAsk(undefined),
      ).toBe(false);
      const unreadable = { events: async () => Promise.reject(new Error("no log")) };
      expect(
        await keyOriginAskOf(prompt, { runs: unreadable, keyOrigins, setTimer }).mayAsk({
          runId: "run-1",
        }),
      ).toBe(false);
      const empty = runsStartedWith("none");
      expect(
        await keyOriginAskOf(prompt, { runs: empty, keyOrigins, setTimer }).mayAsk({
          runId: "run-1",
        }),
      ).toBe(false);
    });

    it("asks with the key's current addresses and saves only the engine's own address", async () => {
      const { prompt, asked, saved } = promptAnswering("allowed");
      const ask = keyOriginAskOf(prompt, { runs: runsStartedWith({}), keyOrigins, setTimer });
      const question = {
        provider: "Gateway",
        key: "gateway-key",
        origin: "https://gateway.example.com",
        runId: "run-1",
      };
      const answer = await ask.ask(question, {
        save: () => ask.allowOrigin(question.key, question.origin),
        signal: new AbortController().signal,
      });
      expect(answer).toBe("allowed");
      expect(asked).toEqual([
        {
          provider: "Gateway",
          key: "gateway-key",
          origin: "https://gateway.example.com",
          allowed: ["https://api.example.com"],
        },
      ]);
      expect(saved).toEqual(["gateway-key https://gateway.example.com"]);
    });
  });
});
