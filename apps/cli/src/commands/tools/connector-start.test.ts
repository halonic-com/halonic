import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
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

verifies("cli.commands.tools.connector-start", () => {
  it("names the missing program and how to fix it in review, instead of a problem it can't explain", async () => {
    await programMissing();

    const { code, stdout, stderr } = await kit.tools(["review", "notes-mcp"]);

    expect(code).toBe(exitCode.unavailable);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "✕ The program notes-nope isn't on this computer.",
      "  Install notes-nope, or change the command in library/connectors/notes-mcp.connector.yaml.",
    ]);
  });

  it("gives approve's --json the cause and the program", async () => {
    await programMissing();

    const { code, stdout } = await kit.tools(["approve", "notes-mcp", "archive", "--json"]);

    expect(code).toBe(exitCode.unavailable);
    expect(JSON.parse(stdout.join("\n")).error).toEqual({
      kind: "unavailable",
      message: "The program notes-nope isn't on this computer.",
      fix: "Install notes-nope, or change the command in library/connectors/notes-mcp.connector.yaml.",
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
      "✕ The secret notes-token isn't set on this computer.",
      "  Save it with halonic secret set notes-token, or set HALONIC_SECRET_NOTES_TOKEN, then try again.",
    ]);
    expect(kit.notes().servers.started).toEqual([]);
  });
});
