import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

/** `notes-mcp` started with the program `notes-nope`, which isn't on this computer. */
async function programMissing() {
  await kit
    .notes()
    .rewriteConnector("name: Notes server\ntransport:\n  stdio:\n    command: notes-nope\n");
  kit.notes().servers.missing.add("notes-nope");
}

/** `notes-mcp` started with the program `notes-quits`, which exits as soon as it starts, as `false` does. */
async function programStopsAtStart() {
  await kit
    .notes()
    .rewriteConnector("name: Notes server\ntransport:\n  stdio:\n    command: notes-quits\n");
  kit.notes().servers.stopsAtStart.add("notes-quits");
}

verifies("cli.commands.tools.connector-start", () => {
  it("names the missing program and how to fix it in review, instead of a problem it can't explain", async () => {
    await programMissing();

    const { code, stdout, stderr } = await kit.tools(["review", "notes-mcp"]);

    expect(code).toBe(exitCode.unavailable);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "✕ Couldn't list the tools from notes-mcp: its program notes-nope isn't on this computer.",
      "  Install it, or change the command in library/connectors/notes-mcp.connector.yaml.",
    ]);
  });

  it("gives approve's --json the cause and the program", async () => {
    await programMissing();

    const { code, stdout } = await kit.tools(["approve", "notes-mcp", "archive", "--json"]);

    expect(code).toBe(exitCode.unavailable);
    expect(JSON.parse(stdout.join("\n")).error).toEqual({
      kind: "unavailable",
      message:
        "Couldn't list the tools from notes-mcp: its program notes-nope isn't on this computer.",
      fix: "Install it, or change the command in library/connectors/notes-mcp.connector.yaml.",
      reason: "program-missing",
      program: "notes-nope",
    });
    expect(kit.notes().servers.started).toEqual([]);
  });

  it("names a secret that isn't set, says how to save it, and starts no program", async () => {
    await kit
      .notes()
      .rewriteConnector(
        "name: Notes server\ntransport:\n  stdio:\n    command: notes-mcp\n    secretEnv:\n      NOTES_TOKEN: notes-token\n",
      );

    const { code, stderr } = await kit.tools(["review", "notes-mcp"]);

    expect(code).toBe(exitCode.usage);
    expect(stderr).toEqual([
      "✕ Couldn't list the tools from notes-mcp: it needs the secret notes-token, which isn't set.",
      "  Set it with: halonic secret set notes-token",
    ]);
    expect(kit.notes().servers.started).toEqual([]);
  });

  it("says nothing answered at the address of a server that isn't running, in review and approve --all", async () => {
    await kit
      .notes()
      .rewriteConnector(
        "name: Notes server\ntransport:\n  http:\n    url: http://127.0.0.1:47998/mcp\n",
      );

    for (const args of [
      ["review", "notes-mcp"],
      ["approve", "notes-mcp", "--all"],
    ]) {
      const { code, stdout, stderr } = await kit.tools(args);

      expect(code).toBe(exitCode.unavailable);
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([
        "✕ Nothing answered at http://127.0.0.1:47998/mcp.",
        "  Start its server, or change the address in library/connectors/notes-mcp.connector.yaml.",
      ]);
    }
  });

  it("gives --json the address without what could hold a token", async () => {
    await kit
      .notes()
      .rewriteConnector(
        "name: Notes server\ntransport:\n  http:\n    url: http://127.0.0.1:47998/mcp?token=abc\n",
      );

    const { code, stdout } = await kit.tools(["review", "notes-mcp", "--json"]);

    expect(code).toBe(exitCode.unavailable);
    expect(JSON.parse(stdout.join("\n")).error).toEqual({
      kind: "unavailable",
      message: "Nothing answered at http://127.0.0.1:47998/mcp.",
      fix: "Start its server, or change the address in library/connectors/notes-mcp.connector.yaml.",
      reason: "nothing-answered",
      address: "http://127.0.0.1:47998/mcp",
    });
  });

  it("says when the server stopped before it listed its tools", async () => {
    kit.notes().servers.stopsWithoutAnswering = true;

    const { code, stderr } = await kit.tools(["approve", "notes-mcp", "--all"]);

    expect(code).toBe(exitCode.unavailable);
    expect(stderr).toEqual([
      "✕ The notes-mcp server stopped, or didn't answer in time, before it listed its tools.",
      "  Check that its server starts and works on its own, then try again.",
    ]);
  });
  it("names a program that stopped right after it started in review, instead of a problem it can't explain", async () => {
    await programStopsAtStart();

    const { code, stdout, stderr } = await kit.tools(["review", "notes-mcp"]);

    expect(code).toBe(exitCode.unavailable);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "✕ Couldn't list the tools from notes-mcp: its program notes-quits stopped right after it started.",
      "  To see why, run the command and args from library/connectors/notes-mcp.connector.yaml yourself.",
    ]);
  });

  it("gives approve's --json the cause and the program that stopped, and approves nothing", async () => {
    await programStopsAtStart();

    const { code, stdout } = await kit.tools(["approve", "notes-mcp", "archive", "--json"]);

    expect(code).toBe(exitCode.unavailable);
    expect(JSON.parse(stdout.join("\n")).error).toEqual({
      kind: "unavailable",
      message:
        "Couldn't list the tools from notes-mcp: its program notes-quits stopped right after it started.",
      fix: "To see why, run the command and args from library/connectors/notes-mcp.connector.yaml yourself.",
      reason: "program-stopped",
      program: "notes-quits",
    });
  });

  it("keeps the general stopped line for a server that doesn't answer in time", async () => {
    kit.notes().servers.answersNothing = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let settled = false;
      const review = kit.tools(["review", "notes-mcp"]).finally(() => {
        settled = true;
      });
      // The files are read for real, so time moves on in steps until the request runs out of it.
      while (!settled) await vi.advanceTimersByTimeAsync(5_000);
      const { code, stderr } = await review;

      expect(code).toBe(exitCode.unavailable);
      expect(stderr).toEqual([
        "✕ The notes-mcp server stopped, or didn't answer in time, before it listed its tools.",
        "  Check that its server starts and works on its own, then try again.",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
