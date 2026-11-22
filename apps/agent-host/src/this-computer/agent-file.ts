// An agent's file as the gate reads it: parsed for the trust check, and as
// raw bytes for the person's "On this computer" choice. Both must come from
// one version of the file, or trust would be checked on one and the choice
// on another.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { Agent } from "@halonicjs/format";
import type { DefinitionSource, ListOptions, VersionOptions } from "@halonicjs/ports";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** The agent's file in the workspace as it is on disk now: its parsed form and its raw bytes. */
export interface AgentFile {
  readonly agent: Agent;
  readonly bytes: Uint8Array;
}

/**
 * Reads the agent `agentId` of hub `hubId` in the workspace at `root`.
 *
 * @returns `undefined` when the workspace has no such agent, or when its file
 * changed between the parse and the read of its bytes, so nothing is
 * checked against two versions of it
 */
export async function agentFileOf(
  root: string,
  hubId: string,
  agentId: string,
): Promise<AgentFile | undefined> {
  const source = new TextKeepingSource(new FolderDefinitionStore(root, root));
  const workspace = await loadWorkspace(source);
  const file = filesOf(workspace, "agent").find(
    (each) => each.hub === hubId && each.value.id === agentId,
  );
  if (file === undefined) return undefined;
  const bytes = await readFile(join(root, file.path));
  // Decoded as the store decodes, so the same bytes give the same text.
  if (bytes.toString("utf8") !== source.textRead(file.path)) return undefined;
  return { agent: file.value, bytes: new Uint8Array(bytes) };
}

/** A definition source that keeps the text it read for each path. */
class TextKeepingSource implements DefinitionSource {
  readonly #source: DefinitionSource;
  readonly #texts = new Map<string, string | null>();

  constructor(source: DefinitionSource) {
    this.#source = source;
  }

  get location(): string {
    return this.#source.location;
  }

  list(dir?: string, options?: ListOptions): Promise<string[]> {
    return this.#source.list(dir, options);
  }

  async read(path: string): Promise<string | null> {
    const text = await this.#source.read(path);
    this.#texts.set(path, text);
    return text;
  }

  version(options?: VersionOptions): Promise<string> {
    return this.#source.version(options);
  }

  /** The text last read at `path`, or `undefined` if it wasn't read. */
  textRead(path: string): string | null | undefined {
    return this.#texts.get(path);
  }
}
