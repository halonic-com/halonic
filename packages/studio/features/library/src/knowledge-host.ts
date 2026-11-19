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

/** What Summarize came to: a draft, or the reason there is none. */
export type SummarizeOutcome =
  | { readonly kind: "drafted"; readonly text: string }
  /** The default model alias has no local model, and Summarize only uses one. */
  | { readonly kind: "no-local-model" }
  /** The source has no documents, or the host can't list them. */
  | { readonly kind: "no-documents" }
  /** The local model didn't answer, or couldn't finish. */
  | { readonly kind: "model-failed" }
  /** Halonic's agent host, which makes the model call, didn't answer. */
  | { readonly kind: "host-unreachable" }
  /** The documents are more than one request can take. */
  | { readonly kind: "too-large" }
  /** The workspace isn't trusted on this computer, so no model was called (HAL-13134). */
  | { readonly kind: "untrusted" };

/** The knowledge sources of the open workspace, one at a time. The app provides it for each open workspace. */
export interface KnowledgeHost {
  /** The source, or `undefined` when the workspace has none with this id. Rejects when it can't be read. */
  read(source: KnowledgeRef): Promise<KnowledgeSource | undefined>;
  /** Saves the new text of the source's file as one change that shows in Changes. Rejects when it can't be written. */
  write(source: KnowledgeRef, text: string): Promise<void>;
  /** Drafts a summary of the source's documents with the local model. Nothing is saved. Rejects when it fails otherwise. */
  summarize(source: KnowledgeRef): Promise<SummarizeOutcome>;
  /** Who uses the source (`whoUses` of core). */
  usage(source: KnowledgeRef): Promise<ItemUsage>;
  /** Calls `listener` whenever a source may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const KnowledgeHostService: ServiceKey<KnowledgeHost> =
  serviceKey<KnowledgeHost>("library.knowledge");
