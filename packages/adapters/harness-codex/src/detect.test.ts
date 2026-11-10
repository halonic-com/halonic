import type { ProgramProbeResult } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { detectCodex } from "./detect.ts";
import { codexPath, FakeProbe, ran } from "./fake-probe.test-helper.ts";

const current = ran(0, "codex-cli 0.167.0\n");
// What Codex 0.166.0 printed on 10 Nov 2026, with the masked key made up.
const signedIn = ran(0, "", "Logged in using ChatGPT\n");
const signedInWithKey = ran(0, "", "API key configured - made-up-key***\n");
const signedOut = ran(1, "", "Not logged in\n");

/** Detects Codex with these answers to `--version` and `login status`. */
function detectWith(version: ProgramProbeResult, loginStatus: ProgramProbeResult = signedIn) {
  const probe = new FakeProbe({ "codex --version": version, "codex login status": loginStatus });
  return { probe, found: detectCodex(probe) };
}

verifies("harness-codex.detect", () => {
  describe("detectCodex", () => {
    it("is ready with the version when someone is signed in", async () => {
      const { probe, found } = detectWith(current);
      expect(await found).toEqual({ status: "ready", version: "0.167.0" });
      expect(probe.asked).toEqual(["codex --version", "codex login status"]);
    });

    it("is ready when an API key is set up, and keeps the key out of the answer", async () => {
      const { found } = detectWith(current, signedInWithKey);
      const detection = await found;
      expect(detection).toEqual({ status: "ready", version: "0.167.0" });
      expect(JSON.stringify(detection)).not.toContain("made-up-key");
    });

    it("accepts the oldest supported version and newer pre-releases", async () => {
      for (const version of ["0.166.0", "0.169.0-alpha.6"]) {
        const { found } = detectWith(ran(0, `codex-cli ${version}`));
        expect(await found).toEqual({ status: "ready", version });
      }
    });

    it("reads the version from Windows line endings", async () => {
      const { found } = detectWith(ran(0, "codex-cli 0.167.0\r\n"));
      expect(await found).toEqual({ status: "ready", version: "0.167.0" });
    });

    it("is signed out when login status exits with 1 and says Not logged in", async () => {
      const { found } = detectWith(current, signedOut);
      expect(await found).toEqual({ status: "signed-out", version: "0.167.0" });
    });

    it("is signed out when a warning comes before Not logged in", async () => {
      const warned = ran(1, "", "WARNING: proceeding, even though …\r\nNot logged in\r\n");
      const { found } = detectWith(current, warned);
      expect(await found).toEqual({ status: "signed-out", version: "0.167.0" });
    });

    it("is missing when the program isn't found, and asks nothing more", async () => {
      const { probe, found } = detectWith({ status: "missing" });
      expect(await found).toEqual({ status: "missing" });
      expect(probe.asked).toEqual(["codex --version"]);
    });

    it("is unsupported below the oldest supported version, without asking for the sign-in", async () => {
      for (const old of ["0.165.0", "0.166.0-alpha.3", "0.9.0"]) {
        const { probe, found } = detectWith(ran(0, `codex-cli ${old}`));
        expect(await found).toEqual({
          status: "unsupported",
          version: old,
          supported: ">=0.166.0",
        });
        expect(probe.asked).toEqual(["codex --version"]);
      }
    });
  });

  describe("detectCodex when asking the version fails", () => {
    it("passes on the probe's own sentence", async () => {
      const error = "Codex didn't answer within 5 seconds.";
      const { found } = detectWith({ status: "failed", path: codexPath, error });
      expect(await found).toEqual({ status: "failed", error });
    });

    it.each([
      ["ends with another code", ran(2, "codex-cli 0.167.0"), "ended with code 2"],
      ["is stopped by a signal", ran(null, ""), "was stopped before it answered"],
      ["prints no version", ran(0, "codex-cli (version unknown)"), "didn't print a version"],
      ["prints only the version", ran(0, "0.167.0"), "didn't print a version"],
      ["prints another name", ran(0, "codex 0.167.0"), "didn't print a version"],
      ["prints more words", ran(0, "codex-cli 0.167.0 (beta)"), "didn't print a version"],
      ["prints nothing", ran(0, ""), "didn't print a version"],
    ])("is failed when it %s, without the program's output", async (_, answer, sentence) => {
      const { found } = detectWith({ ...answer, stderr: "made-up-secret" });
      const detection = await found;
      expect(detection).toEqual({ status: "failed", error: expect.stringContaining(sentence) });
      expect(JSON.stringify(detection)).not.toContain("made-up-secret");
    });
  });

  describe("detectCodex never guesses signed out", () => {
    it.each([
      ["can't read its settings", ran(1, "", "Error loading configuration: made-up reason\n")],
      ["can't read the stored sign-in", ran(1, "", "Error checking login status: made-up\n")],
      ["exits with 1 and prints a usage message", ran(1, "", "error: unrecognized subcommand")],
      ["says Not logged in inside a longer line", ran(1, "", "Error: Not logged in to the proxy")],
      ["says Not logged in but exits with 0", ran(0, "", "Not logged in\n")],
      ["says Not logged in but exits with 2", ran(2, "", "Not logged in\n")],
      ["is stopped by a signal", ran(null, "", "Not logged in\n")],
      ["can't be run", { status: "failed", path: codexPath, error: "It didn't answer." }],
    ] satisfies [string, ProgramProbeResult][])(
      "is ready when login status %s",
      async (_, answer) => {
        const { found } = detectWith(current, answer);
        expect(await found).toEqual({ status: "ready", version: "0.167.0" });
      },
    );

    it("is signed out when Not logged in comes on the standard output", async () => {
      const { found } = detectWith(current, ran(1, "Not logged in\n"));
      expect(await found).toEqual({ status: "signed-out", version: "0.167.0" });
    });
  });
});
