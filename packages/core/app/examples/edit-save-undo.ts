import type { DefinitionStore, DefinitionWatch, Digest, WriteResult } from "@halonicjs/ports";
import { openWorkspace, workspaceFilesKey } from "../src/index.ts";

const agentPath = "hubs/acme/agents/clerk.agent.yaml";

/**
 * Stands in for the platform's `Digest` adapter. The example never writes
 * with `expected` and the assistant changes nothing, so the bytes don't matter.
 */
const digest: Digest = { sha256: async () => new Uint8Array(32) };

/**
 * A few lines of in-memory store. Core may not use an adapter, so this stands in
 * for the memory adapter; a real store also refuses unsafe and private paths.
 */
class MapStore implements DefinitionStore {
  readonly location = "memory:acme";
  private writes = 0;

  private readonly files: Map<string, string>;

  constructor(files: Map<string, string>) {
    this.files = files;
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }
  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async version(): Promise<string> {
    return `v${this.writes}`;
  }
  // The example saves without `expected`, so this store always writes.
  async write(path: string, content: string): Promise<WriteResult> {
    this.files.set(path, content);
    this.writes++;
    return { status: "written" };
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.writes++;
  }
  // Nothing else changes the map, so there is nothing to watch.
  async watch(): Promise<DefinitionWatch> {
    return { close: async () => {} };
  }
}

/** Opens a made-up `acme` workspace, edits one file, saves, then undoes, and describes each step. */
export async function runExample(): Promise<string[]> {
  const store = new MapStore(new Map([[agentPath, "name: Clerk\n"]]));
  const scope = openWorkspace({
    store,
    reviewRecords: new MapStore(new Map()),
    digest,
    onListenerError: (error) => {
      throw error;
    },
  });
  const files = scope.services.get(workspaceFilesKey);
  const lines: string[] = [];
  // What a step left behind: the file in the store, what the workspace shows, and what is unsaved.
  const report = async (step: string): Promise<void> => {
    const unsaved = Object.keys(files.pending);
    lines.push(
      `${step}: store ${JSON.stringify(await store.read(agentPath))}, workspace ${JSON.stringify(await files.read(agentPath))}, unsaved: ${unsaved.length === 0 ? "nothing" : unsaved.join(", ")}`,
    );
  };
  // Every change and save sends an event; the labels tell what happened.
  scope.events.on("files.changed", ({ label }) => lines.push(`event: ${label}`));
  scope.events.on("files.saved", ({ paths }) => lines.push(`event: wrote ${paths.join(", ")}`));

  await report("opened");

  files.change("Renamed the agent", { [agentPath]: "name: Senior Clerk\n" });
  await report("edited");

  const saved = await scope.commands.execute("workspace.save");
  lines.push(`workspace.save wrote ${saved} file`);
  await report("saved");

  // Undoing the edit changes what the workspace shows and marks the file unsaved; the store keeps the saved text.
  await scope.commands.execute("workspace.undo");
  await report("undone");

  await scope.close();
  return lines;
}
