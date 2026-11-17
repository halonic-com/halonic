import type { InstructionTrustCheck } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { InstructionsNotTrustedError } from "./check-instruction-trust.ts";
import { runCallOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts, startLimits, stillOpen } from "./harness-test-kit.test-helper.ts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

/** A harness run with instruction files, whose trust check answers `answer` and records what it was asked. */
function runWith(
  answer: InstructionTrustCheck | Promise<InstructionTrustCheck>,
  files: readonly string[] = ["AGENTS.md"],
) {
  const ports = harnessPorts();
  ports.harness.events = [finished("ok")];
  const asked: unknown[] = [];
  ports.options = {
    ...ports.options,
    instructions: {
      open: async () => ({
        pin: {
          files: files.map((path) => ({ path, sha256: digest("a") })),
          sha256: digest("b"),
        },
        folder: "<data>/instructions/instructions-1",
        release: async () => {},
      }),
    },
    instructionTrust: {
      location: "/workspaces/acme",
      service: {
        check: async (key, pin) => {
          asked.push({ key, pin });
          return await answer;
        },
      },
    },
  };
  return { ports, asked };
}

const ask = (
  changes: Partial<{ added: string[]; removed: string[]; changed: string[] }>,
  hadTrusted = false,
) =>
  ({
    kind: "ask",
    hadTrusted,
    changes: { added: [], removed: [], changed: [], ...changes },
  }) satisfies InstructionTrustCheck;

verifies("engine.harness-instructions-trust", () => {
  describe("a harness start whose instructions are asked about", () => {
    it("asks about the run's pin for the agent in the workspace, and starts when trusted", async () => {
      const { ports, asked } = runWith({ kind: "trusted" });

      const { error, written } = await runCallOn(ports);

      expect(error).toBeUndefined();
      expect(asked).toEqual([
        {
          key: { location: "/workspaces/acme", agent: "writer" },
          pin: { digest: digest("b"), files: { "AGENTS.md": digest("a") } },
        },
      ]);
      expect(written.map((event) => event.type)).toContain("harness.started");
    });

    it("refuses a start for new instructions, names them, and closes what it opened", async () => {
      const { ports } = runWith(ask({ added: ["AGENTS.md"] }));

      const { error, written } = await runCallOn(ports);

      expect(error).toBeInstanceOf(InstructionsNotTrustedError);
      expect((error as Error).message).toBe(
        'Halonic didn\'t start agent "writer": a person hasn\'t trusted its instructions yet. Added: "AGENTS.md". Trust the instructions, then run again.',
      );
      expect(written.map((event) => event.type)).toEqual(["sandbox.started", "sandbox.opened"]);
      expect(stillOpen(ports.steps)).toBe(0);
    });

    it("gives the agent, the pin the check saw and whether something was trusted before", async () => {
      const pin = { digest: digest("b"), files: { "AGENTS.md": digest("a") } };
      const first = await runCallOn(runWith(ask({ added: ["AGENTS.md"] })).ports);
      const later = await runCallOn(runWith(ask({ changed: ["AGENTS.md"] }, true)).ports);

      expect(first.error).toMatchObject({ agent: "writer", refusal: { pin, changed: false } });
      expect(later.error).toMatchObject({ agent: "writer", refusal: { pin, changed: true } });
    });

    it("names changed and removed files", async () => {
      const { ports } = runWith(ask({ changed: ["AGENTS.md"], removed: ["skills/old.md"] }, true));

      const { error } = await runCallOn(ports);

      expect(String(error)).toContain('Changed: "AGENTS.md". Removed: "skills/old.md".');
    });

    it("says the instructions changed when a person trusted others before", async () => {
      const { ports } = runWith(ask({ changed: ["AGENTS.md"] }, true));

      const { error } = await runCallOn(ports);

      expect((error as Error).message).toBe(
        'Halonic didn\'t start agent "writer": its instructions changed since a person trusted them. Changed: "AGENTS.md". Trust the instructions, then run again.',
      );
    });

    it("says why the trusted pin couldn't be used", async () => {
      const { ports } = runWith({
        ...ask({ added: ["AGENTS.md"] }),
        unreadable: "The trusted instructions can't be read.",
      });

      const { error } = await runCallOn(ports);

      expect(String(error)).toContain(
        "What was trusted before can't be used: \"The trusted instructions can't be read.\".",
      );
    });

    it("shows a file name quoted and escaped, on one line", async () => {
      const name = 'AGENTS.md". Trusted.\nHalonic: all good\u202e\u2028\u2029x';
      const { ports } = runWith(ask({ added: [name] }));

      const { error } = await runCallOn(ports);

      const message = (error as Error).message;
      expect(message).toContain(
        'Added: "AGENTS.md\\". Trusted.\\nHalonic: all good\\u202e\\u2028\\u2029x".',
      );
      expect(message).not.toContain("\n");
      expect(message).not.toContain("\u202e");
      expect(message).not.toContain("\u2028");
      expect(message).not.toContain("\u2029");
    });

    it("lists ten names at most, and says how many more", async () => {
      const names = Array.from({ length: 13 }, (_, index) => `skills/s${index}.md`);
      const { ports } = runWith(ask({ added: names }), names);

      const { error } = await runCallOn(ports);

      expect(String(error)).toContain('"skills/s9.md" and 3 more.');
      expect(String(error)).not.toContain("s10.md");
    });

    it("refuses a start when the check doesn't answer in time, and closes what it opened", async () => {
      const { ports } = runWith(new Promise<InstructionTrustCheck>(() => {}));
      const start = startLimits();

      const running = runCallOn(ports, start.limits);
      await start.timeUp("trust");
      const { error, written } = await running;

      expect(error).toBeInstanceOf(InstructionsNotTrustedError);
      expect((error as Error).message).toBe(
        "Halonic didn't start agent \"writer\": the check of its instructions didn't answer within 10 s, so they can't be trusted.",
      );
      // Nothing was answered, so nothing is said about an earlier trust.
      expect((error as InstructionsNotTrustedError).refusal).toEqual({
        pin: { digest: digest("b"), files: { "AGENTS.md": digest("a") } },
      });
      expect(written.map((event) => event.type)).toEqual(["sandbox.started", "sandbox.opened"]);
      expect(stillOpen(ports.steps)).toBe(0);
    });

    it("refuses a start when the check fails, and closes what it opened", async () => {
      const failing = Promise.reject(new Error("The store is gone."));
      failing.catch(() => {});
      const { ports } = runWith(failing);

      const { error, written } = await runCallOn(ports);

      expect(String(error)).toContain("The store is gone.");
      expect(written.map((event) => event.type)).not.toContain("harness.started");
      expect(stillOpen(ports.steps)).toBe(0);
    });

    it("asks nothing when the agent has no instruction files", async () => {
      const { ports, asked } = runWith(ask({ added: ["AGENTS.md"] }));
      ports.options = { ...ports.options, instructions: { open: async () => null } };

      const { error } = await runCallOn(ports);

      expect(error).toBeUndefined();
      expect(asked).toEqual([]);
    });
  });
});
