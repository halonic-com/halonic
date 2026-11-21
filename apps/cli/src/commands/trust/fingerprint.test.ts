import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fullFingerprint, terminalTyping, trustKit } from "../../test/trust-kit.spec.ts";

const { folder, store, commands, writeAcme, fingerprintOfAcme } = trustKit();

verifies("cli.commands.trust.review-and-trust", () => {
  it("trusts with --yes and the fingerprint the check printed, asking nothing, then says it's already trusted", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    const { terminal, written } = terminalTyping();
    const args = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];

    const first = captureIo(folder());
    expect(await runCli(args, first, commands(), { terminal })).toBe(exitCode.ok);
    const again = captureIo(folder());
    expect(await runCli(["trust", "--dir", "acme"], again, commands())).toBe(exitCode.ok);

    expect(first.stdout).toEqual(["✓ Acme can run now."]);
    expect(written()).toBe("");
    expect(again.stdout).toEqual([
      "✓ Acme is already trusted on this computer. Nothing changed since 3 Nov.",
    ]);
  });

  it("refuses --yes without --fingerprint as wrong usage, before reading the workspace", async () => {
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme", "--yes"], io, commands());

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ --yes needs --fingerprint, so you trust exactly what you reviewed.",
      "  Run halonic trust --dir acme to see it; the fingerprint is in the check, above the question.",
    ]);
  });

  it("refuses a fingerprint made before the workspace changed, also in a terminal", async () => {
    writeAcme();
    const old = await fingerprintOfAcme();
    writeAcme({
      "library/connectors/notes.connector.yaml":
        "name: Notes\ntransport:\n  stdio:\n    command: notes-server\ntools:\n  approve: []\n",
    });
    const io = captureIo(folder());
    const { terminal, written } = terminalTyping("y", "y");

    const args = ["trust", "--dir", "acme", "--yes", "--fingerprint", old];
    const code = await runCli(args, io, commands(), { terminal });

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.slice(-2)).toEqual([
      "✕ That fingerprint doesn't match Acme as it is now.",
      "  Run halonic trust --dir acme again to review it as it is now.",
    ]);
    expect(io.stdout.at(-1)).not.toBe(old);
    expect(written()).toBe("");
    expect(await store().list()).toEqual([]);
  });

  it("saves nothing when the workspace changes while the person answers", async () => {
    writeAcme();
    const shown = await fingerprintOfAcme();
    const io = captureIo(folder());
    const { terminal } = terminalTyping("y", "y");
    const questions = terminal.questions;
    if (questions === undefined) throw new TypeError("The terminal asks questions");
    const answerAfterAPull: QuestionTerminal = {
      write: (text) => questions.write(text),
      readLine: async () => {
        writeAcme({
          "library/connectors/notes.connector.yaml":
            "name: Notes\ntransport:\n  stdio:\n    command: notes-server\ntools:\n  approve: []\n",
        });
        return await questions.readLine();
      },
    };

    const code = await runCli(["trust", "--dir", "acme"], io, commands(), {
      terminal: { ...terminal, questions: answerAfterAPull },
    });

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.slice(-2)).toEqual([
      "✕ That fingerprint doesn't match Acme as it is now.",
      "  Run halonic trust --dir acme again to review it as it is now.",
    ]);
    expect(io.stdout.at(-1)).toMatch(fullFingerprint);
    expect(io.stdout.at(-1)).not.toBe(shown);
    expect(await store().list()).toEqual([]);
  });
});
