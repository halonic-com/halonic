import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceFilesWithErrors } from "./files-with-errors.ts";

const replyFile = (agent: string) =>
  `id: reply\nname: Reply\ninitial: draft\nstates:\n  draft:\n    agent: ${agent}\n    on:\n      - to: done\n  done:\n    type: final\n`;

/** Acme with the Support hub, its agent Writer and its workflow Reply, plus `extra` files. */
function acme(extra: Record<string, string> = {}) {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Write.\n",
    "hubs/support/workflows/reply.workflow.yaml": replyFile("writer"),
    ...extra,
  };
  const listeners = new Set<() => void>();
  const source = new WorkspaceFilesWithErrors({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { store, listeners, source };
}

verifies("studio.files-with-errors", () => {
  it("lists nothing for a workspace without errors", async () => {
    expect(await acme().source.list()).toEqual([]);
  });

  it("names a file that isn't YAML by its file name, with its first error", async () => {
    const { source } = acme({
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer: the first\n",
    });

    const [writer] = await source.list();

    expect(writer).toEqual({
      path: "hubs/support/agents/writer.agent.yaml",
      kind: "agent",
      hub: "support",
      id: "writer",
      name: "writer.agent.yaml",
      loaded: false,
      firstError: { line: 2, col: expect.any(Number), reason: expect.any(String) },
      errors: 1,
    });
  });

  it("names a file that reads as YAML by its own name", async () => {
    const { source } = acme({
      "hubs/support/agents/sorter.agent.yaml":
        "id: sorter\nname: Sorter\ninstructions: Sort.\ndescripton: Sorts mail.\n",
    });

    const [sorter] = await source.list();

    expect(sorter).toMatchObject({ name: "Sorter", id: "sorter", loaded: false });
    expect(sorter?.firstError.line).toBe(4);
  });

  it("puts the files that didn't load first, then by kind and name", async () => {
    const { source } = acme({
      "hubs/support/workflows/reply.workflow.yaml": replyFile("nobody"),
      "hubs/support/workflows/triage.workflow.yaml": "id: triage\nname: Triage\n",
      "library/connectors/mail.connector.yaml": "version: 1\nid: mail\nname: Mail\n",
      "hubs/support/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\nbogus: 1\n",
    });

    const listed = await source.list();

    expect(listed.map(({ name, kind, loaded }) => [name, kind, loaded])).toEqual([
      ["Sorter", "agent", false],
      ["Triage", "workflow", false],
      ["Mail", "connector", false],
      ["Reply", "workflow", true],
    ]);
    expect(listed.find(({ kind }) => kind === "connector")?.hub).toBeNull();
  });

  it("counts a file's errors and leaves out files with only warnings and files no list shows", async () => {
    const { source } = acme({
      "hubs/support/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\nbogus: 1\nother: 2\n",
      "models.yaml": "aliases: [\n",
    });

    const listed = await source.list();

    expect(listed.map(({ path, errors }) => [path, errors])).toEqual([
      ["hubs/support/agents/sorter.agent.yaml", 2],
    ]);
  });

  it("tells its listeners after the workspace's files change or are saved", () => {
    const { source, listeners } = acme();
    let heard = 0;

    const stop = source.subscribe(() => heard++);
    for (const listener of listeners) listener();
    stop();

    expect(heard).toBe(1);
    expect(listeners.size).toBe(0);
  });
});
