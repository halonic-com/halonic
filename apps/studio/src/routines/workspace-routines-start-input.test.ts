import { InputRefused } from "@halonicjs/engine";
import { KindedError } from "@halonicjs/std";
import { EngineNotAnswering } from "@halonicjs/studio-feature-routines/api";
import { EngineNotAnswering as ShellEngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup, weekly } from "./workspace-routines.test-helper.ts";

/** Acme's workflow `support-reply`, whose first step reads the input's `mail`. */
const supportReplyFile = [
  "name: Support reply",
  "initial: read",
  "start:",
  "  field: mail",
  "  label: Answer a customer's email",
  "states:",
  "  read:",
  "    description: Read the email",
  "    agent: analyst",
  "    input: 'Answer this: {{input.mail}}'",
  "    on: [{ to: done }]",
  "  done: { type: final }",
  "",
].join("\n");

/** Acme's routine `morning-replies`, which starts `support-reply` with `input`. */
function morningReplies(input: string) {
  return setup({}, [], {
    "hubs/acme/workflows/support-reply.workflow.yaml": supportReplyFile,
    "hubs/acme/workflows/routines/morning-replies.routine.yaml": [
      "name: Morning replies",
      "trigger: { schedule: '30 7 * * 1-5' }",
      "run:",
      "  workflow: support-reply",
      `  input: ${input}`,
      "",
    ].join("\n"),
  });
}

const morning = { hubId: "acme", id: "morning-replies" } as const;

/** A host whose engine's start rejects with `error`. */
function refusing(error: Error) {
  return setup({
    engine: {
      start: async () => {
        throw error;
      },
    },
  });
}

verifies("studio.workspace-routines-start-input", () => {
  describe("a routine whose input lacks what its first step reads", () => {
    it("says so on its view, and lists the problem halonic validate reports", async () => {
      const { host } = morningReplies("{}");

      expect((await host.read(morning)).inputMissing).toBe(true);
      const listing = (await host.list()).find((one) => one.id === morning.id);
      expect(listing?.problems).toEqual([
        "Morning replies starts support-reply without mail, which its first step reads. Add mail under run.input.",
      ]);
    });

    it("doesn't say so once the input has the field, even empty", async () => {
      const { host } = morningReplies("{ mail: '' }");

      expect((await host.read(morning)).inputMissing).toBe(false);
    });
  });

  describe("Run now's failure", () => {
    it("passes on the engine's refusal of the input with its own sentence", async () => {
      const sentence = "The input has no field mail, which the step Read the email reads.";
      const { host } = refusing(new InputRefused("engine.input-missing-field", sentence));

      const failure = await host.runNow?.(weekly).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(KindedError);
      expect(failure).toMatchObject({ kind: "invalid_input", message: sentence });
    });

    it("keeps an unavailable refusal's sentence", async () => {
      const refusal = new KindedError("unavailable", "Halonic can't write to its data folder.");
      const { host } = refusing(refusal);

      const failure = await host.runNow?.(weekly).catch((error: unknown) => error);
      expect(failure).toBe(refusal);
      expect(failure).not.toBeInstanceOf(EngineNotAnswering);
    });

    it("says the engine isn't answering only when it can't be reached", async () => {
      const { host } = refusing(new ShellEngineNotAnswering());

      await expect(host.runNow?.(weekly)).rejects.toThrow(EngineNotAnswering);
    });
  });
});
