import {
  editKnowledgeText,
  type ItemUsage,
  type KnowledgeChange,
  type KnowledgeParts,
  readKnowledgeText,
} from "@halonicjs/app";
import { errorMessageFor } from "@halonicjs/studio-shell";
import type { KnowledgeHost, KnowledgeRef, SummarizeOutcome } from "./knowledge-host.ts";
import { knowledgeWords } from "./knowledge-words.ts";
import { readFailureReason } from "./read-failure.ts";
import { type SaveItem, saveWithoutWindow } from "./saving.ts";

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
  /** The first read failed and nothing has loaded yet; the next refresh clears it. */
  readonly failed: boolean;
  /** Why the first read failed, in words for the user; absent when the error has none (the page then says the engine isn't answering). */
  readonly failureReason: string | undefined;
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
    failed: false,
    failureReason: undefined,
    gone: false,
    unreadable: false,
    source: "",
    summarize: idle,
  };
  private text = "";
  private readonly listeners = new Set<() => void>();
  private stopHost: (() => void) | undefined;
  private latest = 0;
  /** Changes asked for but not yet written; a failed write leaves them here. */
  private unsaved: KnowledgeChange = {};

  private readonly host: KnowledgeHost;
  private readonly source: KnowledgeRef;

  private readonly saving: SaveItem | undefined;

  /** `saving` writes through the window's save state, which shows a failed save; without it a failed save only logs. */
  constructor(host: KnowledgeHost, source: KnowledgeRef, saving?: SaveItem) {
    this.host = host;
    this.source = source;
    this.saving = saving;
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
        this.set({
          ...this.state,
          loaded: true,
          failed: false,
          failureReason: undefined,
          gone: true,
        });
        return;
      }
      this.text = read.text;
      const parts = readKnowledgeText(read.text);
      this.set({
        loaded: true,
        failed: false,
        failureReason: undefined,
        gone: false,
        unreadable: !parts.ok,
        source: read.source,
        usage,
        summarize: this.state.summarize,
        ...(parts.ok ? { parts: parts.value } : {}),
      });
    } catch (error) {
      if (ticket !== this.latest) return;
      console.error("Couldn't read the knowledge.", error);
      // A page that has loaded keeps what it shows; only a first read that failed says so.
      if (!this.state.loaded) {
        this.set({
          ...this.state,
          failed: true,
          failureReason: readFailureReason(error, knowledgeWords.couldntLoad(this.source.id), {
            kindName: "knowledge source",
          }),
        });
      }
    }
  }

  /**
   * Saves a change as one write. A change that changes nothing writes nothing. A change whose
   * write failed stays in `unsaved` and goes out with the next write, which builds its text from
   * the saved text and every unsaved change, so a later save (or the window's Try again) never
   * loses it. Resolves to whether it was saved (or needed no save): `false` when the write failed.
   */
  async save(change: KnowledgeChange): Promise<boolean> {
    this.unsaved = { ...this.unsaved, ...change };
    const edited = editKnowledgeText(this.text, this.unsaved);
    if (!edited.ok) return false;
    if (edited.value === this.text) {
      this.unsaved = {};
      return true;
    }
    const write = async () => {
      const sent = this.unsaved;
      const next = editKnowledgeText(this.text, sent);
      if (!next.ok) throw new Error(`The knowledge source can't be saved: ${next.error}.`);
      await this.host.write(this.source, next.value);
      // What was written is the text now, even if the refresh below fails or is late. An older
      // read still in flight no longer counts.
      this.latest++;
      this.text = next.value;
      this.unsaved = Object.fromEntries(
        Object.entries(this.unsaved).filter(
          ([field, value]) => value !== sent[field as keyof KnowledgeChange],
        ),
      );
      const parts = readKnowledgeText(next.value);
      this.set({
        ...this.state,
        unreadable: !parts.ok,
        ...(parts.ok ? { parts: parts.value } : {}),
      });
      // A summary saved by Try again came from the draft box, so the box is done.
      if (sent.summary !== undefined && this.state.summarize.phase === "draft") {
        this.discardDraft();
      }
    };
    const title = this.state.parts?.name || this.source.id;
    const saved = await (this.saving?.(title, write) ??
      saveWithoutWindow(write, "knowledge source"));
    if (!saved) return false;
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
    } catch (error) {
      console.error("Couldn't summarize the knowledge source.", error);
      // An unreachable host is not a model that didn't answer.
      const unreachable = errorMessageFor(error, { title: "" }).kind === "unavailable";
      summarize = { phase: "failed", reason: unreachable ? "host-unreachable" : "model-failed" };
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
