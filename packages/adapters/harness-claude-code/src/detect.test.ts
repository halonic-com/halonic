import type { ProgramProbeResult } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { detectClaudeCode } from "./detect.ts";
import { claudePath, FakeProbe, ran } from "./fake-probe.test-helper.ts";

const current = ran(0, "2.1.321 (Claude Code)\n");
const signedIn = ran(0, JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }));
const signedOut = ran(1, JSON.stringify({ loggedIn: false, authMethod: "none" }));

/** Detects Claude Code with these answers to `--version` and `auth status`. */
function detectWith(version: ProgramProbeResult, authStatus: ProgramProbeResult = signedIn) {
  const probe = new FakeProbe({ "claude --version": version, "claude auth status": authStatus });
  return { probe, found: detectClaudeCode(probe) };
}

verifies("harness-claude-code.detect", () => {
  describe("detectClaudeCode", () => {
    it("is ready with the leading version when someone is signed in", async () => {
      const { probe, found } = detectWith(current);
      expect(await found).toEqual({ status: "ready", version: "2.1.321" });
      expect(probe.asked).toEqual(["claude --version", "claude auth status"]);
    });

    it("accepts the oldest supported version", async () => {
      const { found } = detectWith(ran(0, "2.1.311 (Claude Code)"));
      expect(await found).toEqual({ status: "ready", version: "2.1.311" });
    });

    it("is signed out when auth status exits with 1 and says loggedIn is false", async () => {
      const { found } = detectWith(current, signedOut);
      expect(await found).toEqual({ status: "signed-out", version: "2.1.321" });
    });

    it("is missing when the program isn't found, and asks nothing more", async () => {
      const { probe, found } = detectWith({ status: "missing" });
      expect(await found).toEqual({ status: "missing" });
      expect(probe.asked).toEqual(["claude --version"]);
    });

    it("is unsupported below the oldest supported version, without asking for the sign-in", async () => {
      for (const old of ["2.1.200 (Claude Code)", "1.0.5 (Claude Code)", "0.2.126 (Claude Code)"]) {
        const { probe, found } = detectWith(ran(0, old));
        expect(await found).toEqual({
          status: "unsupported",
          version: old.split(" ")[0],
          supported: ">=2.1.311",
        });
        expect(probe.asked).toEqual(["claude --version"]);
      }
    });

    it("compares each number, not the text", async () => {
      const { found } = detectWith(ran(0, "2.10.0 (Claude Code)"));
      expect(await found).toEqual({ status: "ready", version: "2.10.0" });
    });
  });

  describe("detectClaudeCode when asking the version fails", () => {
    it("passes on the probe's own sentence", async () => {
      const error = "Claude Code didn't answer within 5 seconds.";
      const { found } = detectWith({ status: "failed", path: claudePath, error });
      expect(await found).toEqual({ status: "failed", error });
    });

    it.each([
      ["ends with another code", ran(2, "2.1.321 (Claude Code)"), "ended with code 2"],
      ["is stopped by a signal", ran(null, ""), "was stopped before it answered"],
      ["prints no version", ran(0, "Claude Code (version unknown)"), "didn't print a version"],
      ["prints a version that isn't first", ran(0, "v2.1.321"), "didn't print a version"],
    ])("is failed when it %s, without the program's output", async (_, answer, sentence) => {
      const { found } = detectWith({ ...answer, stderr: "made-up-secret" });
      const detection = await found;
      expect(detection).toEqual({ status: "failed", error: expect.stringContaining(sentence) });
      expect(JSON.stringify(detection)).not.toContain("made-up-secret");
    });
  });

  describe("detectClaudeCode never guesses signed out", () => {
    it.each([
      ["exits with 1 and prints a usage message", ran(1, "error: unknown command 'auth'")],
      ["exits with 1 but says loggedIn is true", ran(1, JSON.stringify({ loggedIn: true }))],
      ["exits with 1 and its JSON has no loggedIn", ran(1, JSON.stringify({ authMethod: "none" }))],
      ["exits with 1 and loggedIn isn't a boolean", ran(1, JSON.stringify({ loggedIn: "no" }))],
      ["exits with 1 and prints JSON that isn't an object", ran(1, "null")],
      ["exits with another code", ran(2, JSON.stringify({ loggedIn: false }))],
      ["is stopped by a signal", ran(null, "")],
      ["can't be run", { status: "failed", path: claudePath, error: "It didn't answer." }],
    ] satisfies [string, ProgramProbeResult][])(
      "is ready when auth status %s",
      async (_, answer) => {
        const { found } = detectWith(current, answer);
        expect(await found).toEqual({ status: "ready", version: "2.1.321" });
      },
    );
  });
});
