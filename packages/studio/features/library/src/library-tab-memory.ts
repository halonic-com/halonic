import type { LibraryItemKind } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Which Library tab a workspace was last on. The app keeps it for each workspace. */
export interface LibraryTabMemory {
  /** The tab last shown in this workspace, or `undefined` when none was. */
  get(): LibraryItemKind | undefined;
  set(kind: LibraryItemKind): void;
}

export const LibraryTabMemoryService: ServiceKey<LibraryTabMemory> =
  serviceKey<LibraryTabMemory>("library.tab-memory");
