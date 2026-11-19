import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

/** `notes-mcp` with a secret in its program's environment, as Mailbox has. */
const connectorWithSecret = `name: Notes server
transport:
  stdio:
    command: notes-mcp
    secretEnv:
      NOTES_TOKEN: notes-token
tools:
  approve: all
`;

verifies("cli.commands.tools.start-failure", () => {
  it("names the program that isn't on this computer, and where its command is written", async () => {
    kit.notes().servers.programMissing = true;

    const { code, stderr } = await kit.tools(["review", "notes-mcp"]);

    expect(code).toBe(exitCode.notFound);
    expect(stderr.slice(0, 2)).toEqual([
      "✕ Couldn't list the tools from notes-mcp: its program notes-mcp isn't on this computer.",
      "  Install it, or change the command in library/connectors/notes-mcp.connector.yaml.",
    ]);
    expect(stderr.join("\n")).not.toContain("can't explain yet");
  });

  it("names the secret that isn't set, and the command that sets it", async () => {
    await kit.notes().rewriteConnector(connectorWithSecret);

    const { code, stderr } = await kit.tools(["review", "notes-mcp"]);

    expect(code).toBe(exitCode.notFound);
    expect(stderr.slice(0, 2)).toEqual([
      "✕ Couldn't list the tools from notes-mcp: it needs the secret notes-token, which isn't set.",
      "  Set it with: halonic secret set notes-token",
    ]);
    expect(kit.notes().servers.started).toEqual([]);
  });

  it("says the same when approve lists the tools, and in --json", async () => {
    kit.notes().servers.programMissing = true;

    const { code, stdout } = await kit.tools(["approve", "notes-mcp", "--all", "--json"]);

    expect(code).toBe(exitCode.notFound);
    expect(JSON.parse(stdout.join("\n")).error).toEqual({
      kind: "not_found",
      message:
        "Couldn't list the tools from notes-mcp: its program notes-mcp isn't on this computer.",
      fix: "Install it, or change the command in library/connectors/notes-mcp.connector.yaml.",
    });
  });
});
