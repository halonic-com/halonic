import type { InstructionTrustCheck } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { InstructionsNotTrustedError } from "./check-instruction-trust.ts";
import { runCallOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts, stillOpen } from "./harness-test-kit.test-helper.ts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

/** A harness run with instruction files, whose trust check answers `answer` and records what it was asked. */
function runWith(answer: InstructionTrustCheck, files: readonly string[] = ["AGENTS.md"]) {
  const ports = harnessPorts();
  ports.harness.events = [finished("ok")];
  const asked: unknown[] = [];
  ports.options = {
    ...ports.options,
    instructions: {
      pinOf: async () => ({
        files: files.map((path) => ({ path, sha256: digest("a") })),
        sha256: digest("b"),
      }),
    },
    instructionTrust: {
      location: "/workspaces/acme",
      service: {
        check: async (key, pin) => {
          asked.push({ key, pin });
          return answer;
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

    it("asks nothing when the agent has no instruction files", async () => {
      const { ports, asked } = runWith(ask({ added: ["AGENTS.md"] }));
      ports.options = { ...ports.options, instructions: { pinOf: async () => null } };

      const { error } = await runCallOn(ports);

      expect(error).toBeUndefined();
      expect(asked).toEqual([]);
    });
  });
});
