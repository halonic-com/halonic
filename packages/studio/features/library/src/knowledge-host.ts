import type { ItemUsage } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Which knowledge source: its id, and the hub it sits in, or `null` when the workspace shares it. */
export interface KnowledgeRef {
  readonly hub: string | null;
  readonly id: string;
}

/** A knowledge source as the host reads it: its file's text and where its documents come from. */
export interface KnowledgeSource {
  readonly text: string;
  /** Where the documents are, as the page shows it: "Folder docs · 14 documents". */
  readonly source: string;
}

/** The knowledge sources of the open workspace, one at a time. The app provides it for each open workspace. */
export interface KnowledgeHost {
  /** The source, or `undefined` when the workspace has none with this id. Rejects when it can't be read. */
  read(source: KnowledgeRef): Promise<KnowledgeSource | undefined>;
  /** Saves the new text of the source's file as one change that shows in Changes. Rejects when it can't be written. */
  write(source: KnowledgeRef, text: string): Promise<void>;
  /** Who uses the source (`whoUses` of core). */
  usage(source: KnowledgeRef): Promise<ItemUsage>;
  /** Calls `listener` whenever a source may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const KnowledgeHostService: ServiceKey<KnowledgeHost> =
  serviceKey<KnowledgeHost>("library.knowledge");
