import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** An agent file's lines: its name, then the fields given. */
const agentFile = (...lines: string[]) => ["name: Coder", ...lines, ""].join("\n");

/** A local connector that runs `command` with `args`, from `cwd` and with `env` when given. */
function connectorFile(
  command: string,
  args: readonly string[],
  cwd?: string,
  env?: Readonly<Record<string, string>>,
): string {
  return [
    "version: 1",
    "id: mail",
    "transport:",
    "  stdio:",
    `    command: ${JSON.stringify(command)}`,
    `    args: ${JSON.stringify(args)}`,
    ...(cwd === undefined ? [] : [`    cwd: ${JSON.stringify(cwd)}`]),
    ...(env === undefined ? [] : [`    env: ${JSON.stringify(env)}`]),
    "",
  ].join("\n");
}

/** A Claude Code agent writing in `folder`. */
const writesIn = (folder: string) => agentFile("harness: claude-code", `workingFolder: ${folder}`);

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
          "Agent \"coder\" can't write in 'scripts': connector \"mail\" uses 'scripts/mail.sh' from there, outside the sandbox",
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

    it.each([
      ["a module that `python -m` runs", "src", connectorFile("python", ["-m", "src.server"])],
      ["a module written with its flag", "src", connectorFile("python", ["-msrc.server"])],
      ["a short flag written with its value", "src", connectorFile("node", ["-csrc/x.json"])],
      ["a file of arguments", "src", connectorFile("node", ["@src/args.txt"])],
      ["a path after 'file:'", "src", connectorFile("node", ["file:src/x"])],
    ])("refuses it for %s", async (_case, folder, connector) => {
      expect(await errorsFor(writesIn(folder), connector)).toHaveLength(1);
    });

    it.each([
      ["NODE_OPTIONS", "--require ./src/hook.js"],
      ["NODE_OPTIONS", "--require=./src/hook.js"],
      ["PYTHONPATH", "src"],
      ["BASH_ENV", "src/x.sh"],
      ["PATH", "/usr/bin:src/bin"],
      ["PATH", "tools\\bin;src\\bin"],
    ])("refuses it for a path in %s=%s", async (name, value) => {
      const errors = await errorsFor(
        writesIn("src"),
        connectorFile("node", ["/opt/mail/server.js"], undefined, { [name]: value }),
      );
      expect(errors).toEqual([
        [
          "agents/coder.agent.yaml",
          "workingFolder",
          `Agent "coder" can't write in 'src': connector "mail" uses '${name}=${value}' from there, outside the sandbox`,
        ],
      ]);
    });

    it("reports one error per agent and connector, however many parts are inside", async () => {
      const errors = await errorsFor(
        agentFile("harness: claude-code", "workingFolder: scripts"),
        connectorFile("scripts/run.sh", ["scripts/a.sh", "scripts/b.sh"], "scripts"),
      );
      expect(errors).toHaveLength(1);
    });
  });

  describe("a working folder a connector loads files from without naming them", () => {
    it.each(["node_modules", "files/node_modules/some-mcp", "files/Node_Modules"])(
      "refuses '%s', where npx and node find packages, with or without a connector",
      async (folder) => {
        const errors = await errorsFor(writesIn(folder), connectorFile("npx", ["-y", "some-mcp"]));
        expect(errors).toEqual([
          [
            "agents/coder.agent.yaml",
            "workingFolder",
            `Agent "coder" can't write in '${folder}': programs load the packages in a node_modules folder without naming them, outside the sandbox`,
          ],
        ]);
      },
    );

    it("refuses a working folder inside the folder a connector starts in", async () => {
      const errors = await errorsFor(
        writesIn("tools/lib"),
        connectorFile("node", ["/opt/mail/server.js"], "tools"),
      );
      expect(errors).toEqual([
        [
          "agents/coder.agent.yaml",
          "workingFolder",
          "Agent \"coder\" can't write in 'tools/lib': connector \"mail\" starts in 'tools', which holds it, and reads files from there, outside the sandbox",
        ],
      ]);
    });

    it.each([
      ["node", "tools/server.js"],
      ["python", "tools/server.py"],
      ["node", "tools\\server.js"],
    ])(
      "refuses a working folder below the folder of the script %s runs, which it loads files next to",
      async (command, script) => {
        const errors = await errorsFor(writesIn("tools/lib"), connectorFile(command, [script]));
        expect(errors).toEqual([
          [
            "agents/coder.agent.yaml",
            "workingFolder",
            `Agent "coder" can't write in 'tools/lib': connector "mail" uses '${script}' and loads files from 'tools', which holds it, outside the sandbox`,
          ],
        ]);
      },
    );

    it.each([
      ["PYTHONPATH", "src", "src/pkg"],
      ["NODE_PATH", "lib", "lib/foo"],
    ])("refuses a working folder below a folder named in %s=%s", async (name, value, folder) => {
      const errors = await errorsFor(
        writesIn(folder),
        connectorFile("node", ["/opt/mail/server.js"], undefined, { [name]: value }),
      );
      expect(errors).toEqual([
        [
          "agents/coder.agent.yaml",
          "workingFolder",
          `Agent "coder" can't write in '${folder}': connector "mail" uses '${name}=${value}' and loads files from '${value}', which holds it, outside the sandbox`,
        ],
      ]);
    });

    it.each([".", "./", ""])(
      "lets a working folder pass when the connector starts in the workspace root as '%s'",
      async (cwd) => {
        const errors = await errorsFor(
          writesIn("src"),
          connectorFile("npx", ["-y", "some-mcp"], cwd),
        );
        expect(errors).toEqual([]);
      },
    );
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
      ["a file whose name has a dot, without '-m'", "scripts.sh"],
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
