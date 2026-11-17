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

  it("gives --json an error of kind conflict with the sentence and the command when tools stay off", async () => {
    const { code, stdout } = await kit.tools(["review", "notes-mcp", "--json"]);

    expect(code).toBe(exitCode.failed);
    const document = JSON.parse(stdout.join("\n"));
    expect(document.ok).toBe(false);
    expect(document.error).toEqual({
      kind: "conflict",
      message: "2 tools from notes-mcp stay off: there's no terminal to ask you.",
      fix: expect.stringContaining("approve notes-mcp <tool> --fingerprint <fingerprint>"),
    });
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

  it("runs the fix line that `approve` prints for a changed tool, and it shows the tools", async () => {
    const stale = await kit.tools([
      "approve",
      "notes-mcp",
      "lookup",
      "--fingerprint",
      `htl1:${"0".repeat(64)}`,
    ]);
    const fixLine = stale.stderr.find((line) => line.includes("halonic tools review"));
    if (fixLine === undefined) throw new Error("approve names the command to read the tool first");
    const command = fixLine.slice(fixLine.indexOf("halonic tools review")).split(" ");

    const run = await kit.tools(command.slice(2), terminalTyping("n", "n").terminal);

    expect(run.code).toBe(exitCode.ok);
    expect(run.stdout.join("\n")).toContain("lookup");
  });

  it("approves the fingerprint it showed, so a tool that changed meanwhile is Changed again", async () => {
    const shown = (await kit.reviewJson()).waiting.find((tool) => tool.name === "archive");
    const servers = kit.notes().servers;
    const terminal = terminalTyping("n", "y");
    const answering = terminal.terminal.questions;
    if (answering === undefined) throw new Error("the test terminal asks");
    const readLine = answering.readLine;
    answering.readLine = async (signal) => {
      servers.tools = [
        notesTools.send,
        notesTools.lookup,
        { ...notesTools.archive, description: "Moves a note anywhere." },
      ];
      return await readLine(signal);
    };

    await kit.tools(["review", "notes-mcp"], terminal.terminal);

    const after = (await kit.listedNow()).waiting.find((tool) => tool.name === "archive");
    expect(after).toEqual(expect.objectContaining({ state: "changed" }));
    expect(after?.fingerprint).not.toBe(shown?.fingerprint);
  });

  it("shows no control or bidi character of a server's description or schema", async () => {
    const evil = `${escapeCode}[31mred\r${rightToLeft}`;
    kit.notes().servers.tools = [
      {
        ...notesTools.archive,
        description: `Moves${evil} a note.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: `the note's id${evil}` } },
        },
      },
    ];

    const run = await kit.tools(["review", "notes-mcp"]);

    const text = [...run.stdout, ...run.stderr].join("\n");
    expect(text).toContain("Moves");
    expect(text).toContain("the note's id");
    expect(text).not.toContain(escapeCode);
    expect(text).not.toContain("\r");
    expect(text).not.toContain(rightToLeft);
  });
});
