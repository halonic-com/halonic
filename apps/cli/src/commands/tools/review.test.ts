import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli } from "../../run-cli.ts";
import { notesConnector, notesTools } from "../../test/acme-notes.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { terminalTyping, toolsKit } from "../../test/tools-kit.spec.ts";

/** The escape that starts a terminal code, and the bidi override that turns a line around. */
const escapeCode = String.fromCodePoint(0x1b);
const rightToLeft = String.fromCodePoint(0x202e);

const kit = toolsKit();

verifies("cli.commands.tools.review", () => {
  it("shows the example's tools in order, asks nothing without a terminal, and says what stays off", async () => {
    const run = await kit.expectGolden("review", ["tools", "review", "notes-mcp"]);
    expect(run.noColour.exit).toBe(exitCode.failed);
    expect(kit.notes().servers.running).toBe(0);
  });

  it("asks about each waiting tool and approves the fingerprint shown above the question", async () => {
    const before = await kit.reviewJson();
    const { terminal, written } = terminalTyping("n", "y");

    const { code, stdout } = await kit.tools(["review", "notes-mcp"], terminal);

    expect(code).toBe(exitCode.ok);
    expect(written).toEqual(["Approve this version of lookup? [y/N] ", "Approve archive? [y/N] "]);
    expect(stdout.at(-1)).toBe(
      "✓ Approved 1 tool from notes-mcp. 1 stays off: lookup. 2 tools are on.",
    );
    const after = await kit.reviewJson();
    expect(after.on).toEqual(["send", "archive"]);
    expect(after.waiting.map((tool) => tool.name)).toEqual(["lookup", "search"]);
    expect(before.waiting.find((tool) => tool.name === "archive")?.fingerprint).toMatch(/^htl1:/u);
  });

  it("says when nothing was approved, and when everything was", async () => {
    const none = await kit.tools(["review", "notes-mcp"], terminalTyping("", undefined).terminal);
    expect(none.stdout.at(-1)).toBe(
      "! Approved nothing. 2 tools from notes-mcp stay off: lookup, archive. 1 tool is on.",
    );
    const all = await kit.tools(["review", "notes-mcp"], terminalTyping("y", "yes").terminal);
    expect(all.stdout.at(-1)).toBe("✓ Approved 2 tools from notes-mcp. 3 tools are on.");
    const again = await kit.tools(["review", "notes-mcp"], terminalTyping().terminal);
    expect(again.code).toBe(exitCode.ok);
    expect(again.stdout.at(-1)).toBe(
      "✓ Nothing from notes-mcp is waiting for your approval. 3 tools are on.",
    );
  });

  it("keeps what was approved before Ctrl C, and says so", async () => {
    const signals = fakeSignals();
    const written: string[] = [];
    const questions: QuestionTerminal = {
      write: (text) => written.push(text),
      readLine: async (signal) => {
        if (written.length === 1) return "y";
        signals.send("SIGINT");
        signal?.throwIfAborted();
        return undefined;
      },
    };
    const io = captureIo(kit.notes().acme);
    const code = await runCli(["tools", "review", "notes-mcp"], io, kit.notes().sharedCommands(), {
      terminal: { ...terminalTyping().terminal, questions },
      stop: { signals, exitNow: () => undefined },
    });

    expect(code).toBe(130);
    expect(io.stderr).toEqual(["Stopped. Approved 1 tool from notes-mcp before that: lookup."]);
    expect((await kit.reviewJson()).on).toEqual(["send", "lookup"]);
  });

  it("says a Changed tool with the same text connects differently, never an empty diff", async () => {
    await kit.notes().rewriteConnector(notesConnector(["--port", "7311"]));
    kit.notes().servers.tools = [notesTools.send];

    await kit.expectGolden("review-same-text", ["tools", "review", "notes-mcp"]);
    const document = await kit.reviewJson();
    expect(document.waiting).toEqual([
      expect.objectContaining({ name: "send", serverChanged: true }),
    ]);
  });

  it("escapes what the server wrote, so the terminal stays as it was", async () => {
    kit.notes().servers.tools = [
      {
        name: "evil",
        description: `ok${escapeCode}[2J\r${rightToLeft} evil`,
        inputSchema: { type: "object" },
      },
    ];
    const run = await kit.expectGolden("review-escaping", ["tools", "review", "notes-mcp"]);
    for (const line of [...run.noColour.stdout, ...run.noColour.stderr]) {
      for (const raw of [escapeCode, "\r", rightToLeft]) {
        expect(line).not.toContain(raw);
      }
    }
  });

  it("says a connector whose tools are built in has none to approve", async () => {
    await kit.notes().rewriteConnector("transport:\n  google:\n    account: fin@example.com\n");
    const { code, stdout } = await kit.tools(["review", "notes-mcp"]);
    expect(code).toBe(exitCode.ok);
    expect(stdout).toEqual([
      "notes-mcp has no listed tools to approve. Its tools come with the integration.",
    ]);
  });

  it("needs a connector, and shows the usage line under it", async () => {
    const run = await kit.tools(["review"]);
    expect(run.code).toBe(exitCode.usage);
    expect(run.stderr[0]).toBe("✕ halonic tools review needs a connector's id.");
    expect(run.stderr.join("\n")).toContain("halonic tools review <source>");
  });
});
