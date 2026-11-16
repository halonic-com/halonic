import {
  editKnowledgeText,
  type ItemUsage,
  type KnowledgeChange,
  type KnowledgeParts,
  readKnowledgeText,
} from "@halonicjs/app";
import type { KnowledgeHost, KnowledgeRef, SummarizeOutcome } from "./knowledge-host.ts";

/** Where Summarize is: not asked, running, a draft waiting for a choice, or why there is none. */
export type SummarizeState =
  | { readonly phase: "idle" }
  | { readonly phase: "working" }
  | { readonly phase: "draft"; readonly text: string }
  | {
      readonly phase: "failed";
      readonly reason: Exclude<SummarizeOutcome["kind"], "drafted">;
    };

/** What the knowledge page shows. */
export interface KnowledgeState {
  readonly loaded: boolean;
  /** The workspace has no such source (any more). */
  readonly gone: boolean;
  /** The file isn't valid YAML, so only a person can fix it in the file. */
  readonly unreadable: boolean;
  readonly parts?: KnowledgeParts;
  /** Where the documents are: "Folder docs · 14 documents". */
  readonly source: string;
  readonly usage?: ItemUsage;
  readonly summarize: SummarizeState;
}

const idle: SummarizeState = { phase: "idle" };

/**
 * One knowledge source's page state: its parts read from the host's text, a save for each change
 * (the summary or the lookup mode), and a refresh whenever the host says a source may have
 * changed. The page reads it with `useSyncExternalStore`.
 */
export class KnowledgeModel {
  state: KnowledgeState = {
    loaded: false,
    gone: false,
    unreadable: false,
    source: "",
    summarize: idle,
  };
  private text = "";
  private readonly listeners = new Set<() => void>();
  private stopHost: (() => void) | undefined;
  private latest = 0;

  private readonly host: KnowledgeHost;
  private readonly source: KnowledgeRef;

  constructor(host: KnowledgeHost, source: KnowledgeRef) {
    this.host = host;
    this.source = source;
  }

  /** Calls `listener` after each change of `state`; returns the way to stop. The first listener starts watching the host. */
  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0) {
      this.stopHost = this.host.subscribe(() => void this.refresh());
      void this.refresh();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopHost?.();
        this.stopHost = undefined;
      }
    };
  }

  /** Asks the host again. A failed read keeps what was shown. An older answer never replaces a newer one. */
  async refresh(): Promise<void> {
    const ticket = ++this.latest;
    try {
      const [read, usage] = await Promise.all([
        this.host.read(this.source),
        this.host.usage(this.source),
      ]);
      if (ticket !== this.latest) return;
      if (read === undefined) {
        this.set({ ...this.state, loaded: true, gone: true });
        return;
      }
      this.text = read.text;
      const parts = readKnowledgeText(read.text);
      this.set({
        loaded: true,
        gone: false,
        unreadable: !parts.ok,
        source: read.source,
        usage,
        summarize: this.state.summarize,
        ...(parts.ok ? { parts: parts.value } : {}),
      });
    } catch {
      // The page keeps what it shows; the host says why a read failed.
    }
  }

  /**
   * Saves a change as one write. A change that changes nothing writes nothing. Resolves to
   * whether it was saved (or needed no save): `false` when the write failed.
   */
  async save(change: KnowledgeChange): Promise<boolean> {
    const edited = editKnowledgeText(this.text, change);
    if (!edited.ok) return false;
    if (edited.value === this.text) return true;
    try {
      await this.host.write(this.source, edited.value);
    } catch {
      return false;
    }
    // What was written is the text now, even if the refresh below fails or is late. An older
    // read still in flight no longer counts.
    this.latest++;
    this.text = edited.value;
    const parts = readKnowledgeText(edited.value);
    this.set({
      ...this.state,
      unreadable: !parts.ok,
      ...(parts.ok ? { parts: parts.value } : {}),
    });
    await this.refresh();
    return true;
  }

  /** Drafts a summary on request. A draft is only text until `useDraft` saves it; asking twice at once runs once. */
  async summarize(): Promise<void> {
    if (this.state.summarize.phase === "working") return;
    this.set({ ...this.state, summarize: { phase: "working" } });
    let summarize: SummarizeState;
    try {
      const outcome = await this.host.summarize(this.source);
      summarize =
        outcome.kind === "drafted"
          ? { phase: "draft", text: outcome.text }
          : { phase: "failed", reason: outcome.kind };
    } catch {
      summarize = { phase: "failed", reason: "model-failed" };
    }
    this.set({ ...this.state, summarize });
  }

  /** Saves the draft's text (as edited) as the summary and closes the draft. A failed save keeps the draft. */
  async useDraft(text: string): Promise<boolean> {
    const saved = await this.save({ summary: text.trim() === "" ? null : text.trim() });
    if (saved) this.discardDraft();
    return saved;
  }

  /** Closes the draft without saving it, or clears the reason it failed. */
  discardDraft(): void {
    this.set({ ...this.state, summarize: idle });
  }

  private set(state: KnowledgeState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}
