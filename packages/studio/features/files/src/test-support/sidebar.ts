import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { act } from "react";
import { filesFeature } from "../feature.ts";
import type { FilesHost, FilesListing } from "../files-host.ts";

export const listing = (
  paths: string[],
  marks: FilesListing["marks"] = new Map(),
): FilesListing => ({
  paths,
  marks,
});

export function contextOf(host: FilesHost): WorkspaceContext {
  const services = limitedLookup(filesFeature, { get: () => host, find: () => host });
  return { services } as unknown as WorkspaceContext;
}

export async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function rowNamed(page: HTMLElement, path: string): HTMLElement {
  const row = page.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (row === null) throw new Error(`no row ${path}`);
  return row;
}

export function contextHost(): FilesHost {
  return {
    list: async () => listing(["agents/a.agent.yaml", "models.yaml"]),
    subscribe: () => () => {},
    read: async () => null,
    edit: () => {},
    create: async () => {},
    renameImpact: async () => ({ places: 0, owners: [] }),
    rename: async () => ({ places: 0, owners: [], undo: async () => {} }),
    remove: async () => ({ places: 0, undo: async () => {} }),
    problems: async () => [],
    yamlSyntaxLine: async () => null,
    outside: () => new Map(),
    noteHeld: () => undefined,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
  };
}
