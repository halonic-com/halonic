import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** An agent file's lines: its name, then the fields given. */
const agentFile = (...lines: string[]) => ["name: Coder", ...lines, ""].join("\n");

/** A local connector that runs `command` with `args`, from `cwd` when given. */
function connectorFile(command: string, args: readonly string[], cwd?: string): string {
  return [
    "version: 1",
    "id: mail",
    "transport:",
    "  stdio:",
    `    command: ${JSON.stringify(command)}`,
    `    args: ${JSON.stringify(args)}`,
    ...(cwd === undefined ? [] : [`    cwd: ${JSON.stringify(cwd)}`]),
    "",
  ].join("\n");
}

/** The check's errors for a workspace with one agent and one connector, as `[file, path, message]`. */
async function errorsFor(agent: string, connector: string): Promise<string[][]> {
  const workspace = await loadWorkspace(
    new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "agents/coder.agent.yaml": agent,
      "library/connectors/mail.connector.yaml": connector,
    }),
  );
  return workspace.issues
    .filter((issue) => issue.code === "working-folder-runs-program")
    .map((issue) => [issue.file, issue.path.join("."), issue.message]);
}

verifies("workspace.working-folders", () => {
  describe("a working folder that holds what a connector runs", () => {
    it("refuses the agent's working folder, naming the connector and the path", async () => {
      const errors = await errorsFor(
        agentFile("harness: claude-code", "workingFolder: scripts"),
        connectorFile("bash", ["scripts/mail.sh"]),
      );
      expect(errors).toEqual([
        [
          "agents/coder.agent.yaml",
          "workingFolder",
          "Agent \"coder\" can't write in 'scripts': connector \"mail\" runs 'scripts/mail.sh' from there, outside the sandbox",
        ],
      ]);
    });

    it("refuses the default folder when the connector starts in it", async () => {
      const errors = await errorsFor(
        agentFile("harness: codex"),
        connectorFile("node", ["server.js"], "files/agents/coder/server"),
      );
      expect(errors).toHaveLength(1);
    });

    it.each([
      ["a program read from the connector's folder", connectorFile("./run.sh", [], "tools")],
      ["a path after '='", connectorFile("node", ["--config=tools/mail.json"])],
      ["a path with '\\'", connectorFile("node", ["tools\\mail.js"])],
      ["a path through '..'", connectorFile("node", ["../tools/mail.js"], "files")],
      ["a part with a trailing dot", connectorFile("node", ["tools./mail.js"])],
    ])("refuses it for %s, in another letter case", async (_case, connector) => {
      const errors = await errorsFor(
        agentFile("harness: claude-code", "workingFolder: Tools"),
        connector,
      );
      expect(errors).toHaveLength(1);
    });

    it("reports one error per agent and connector, however many parts are inside", async () => {
      const errors = await errorsFor(
        agentFile("harness: claude-code", "workingFolder: scripts"),
        connectorFile("scripts/run.sh", ["scripts/a.sh", "scripts/b.sh"], "scripts"),
      );
      expect(errors).toHaveLength(1);
    });
  });

  describe("a working folder that holds nothing a connector runs", () => {
    it("lets a working folder elsewhere in the workspace pass", async () => {
      const errors = await errorsFor(
        agentFile("harness: claude-code", "workingFolder: files/reports"),
        connectorFile("bash", ["scripts/mail.sh"]),
      );
      expect(errors).toEqual([]);
    });

    it.each([
      ["a folder whose name only starts the same", "scripts-old/mail.sh"],
      ["an absolute path outside the workspace", "/opt/mail/run.sh"],
      ["a path that leaves the workspace", "../scripts/mail.sh"],
    ])("lets %s pass", async (_case, arg) => {
      const errors = await errorsFor(
        agentFile("harness: claude-code", "workingFolder: scripts"),
        connectorFile("bash", [arg]),
      );
      expect(errors).toEqual([]);
    });

    it("doesn't check an agent in Halonic's own loop, which starts no program", async () => {
      const errors = await errorsFor(
        agentFile("workingFolder: scripts"),
        connectorFile("bash", ["scripts/mail.sh"]),
      );
      expect(errors).toEqual([]);
    });
  });
});
